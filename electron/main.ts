import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
} from 'electron'
import path from 'node:path'
import { configManager, conversationManager } from './configManager'
import { IPC_CHANNELS } from '../src/types/config'
import { searchEverything, isEverythingAvailable, openSearchResult, revealInExplorer } from './tools/everythingSearch'
import { sendChatStream, abortChatRequest } from './tools/chatService'

// ==================== Constants ====================

const DIST = path.join(__dirname, '../dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const INITIAL_WIDTH = 720
const COMPACT_HEIGHT = 84   // Drag handle (20) + Input bar (56) + padding (8)
const EXPANDED_HEIGHT = 520  // Fixed height when chat/search is open

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let savedPosition: { x: number; y: number } | null = null
let currentHeight = COMPACT_HEIGHT // Track current height to prevent resize during drag

// ==================== Window Creation ====================

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  const { y: displayY } = screen.getPrimaryDisplay().workArea

  const initialX = Math.round((screenWidth - INITIAL_WIDTH) / 2)
  const initialY = displayY + 180

  mainWindow = new BrowserWindow({
    width: INITIAL_WIDTH,
    height: COMPACT_HEIGHT,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000', // Critical for transparent windows on Windows
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false, // Disable native shadow to prevent black border artifacts
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault()
      hideWindow()
    }
  })

  mainWindow.on('moved', () => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    savedPosition = { x: bounds.x, y: bounds.y }
  })
}

// ==================== Window Toggle ====================

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    hideWindow()
  } else {
    showWindow()
  }
}

function showWindow() {
  if (!mainWindow) return

  if (savedPosition) {
    currentHeight = COMPACT_HEIGHT // Reset to compact when restoring
    mainWindow.setBounds({
      x: savedPosition.x,
      y: savedPosition.y,
      width: INITIAL_WIDTH,
      height: COMPACT_HEIGHT,
    })
  } else {
    const cursor = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursor)
    const { width: screenWidth } = currentDisplay.workArea
    const { x: displayX, y: displayY } = currentDisplay.workArea

    const x = Math.round(displayX + (screenWidth - INITIAL_WIDTH) / 2)
    const y = displayY + 180

    savedPosition = { x, y }
    currentHeight = COMPACT_HEIGHT
    mainWindow.setBounds({ x, y, width: INITIAL_WIDTH, height: COMPACT_HEIGHT })
  }

  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send(IPC_CHANNELS.TOGGLE_WINDOW)
}

function hideWindow() {
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  savedPosition = { x: bounds.x, y: bounds.y }
  mainWindow.hide()
}

// ==================== System Tray ====================

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAGNJREFUOE9jZKAQMFKon2HUAIZhEAY4Q+n/DAwMq0GaQeGAxoiCDcCwgMQApAZkiDcoHJA1gNgYUJqBOAwIMYBBYAmIDULCgGbxgKoGYE0HxBpAVBjgSwdUdcHgjAe8MUHtfAAALaMhEWmfHjsAAAAASUVORK5CYII='
  )

  tray = new Tray(icon)
  tray.setToolTip('EverythingAgent')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示/隐藏', click: toggleWindow },
    {
      label: '设置',
      click: () => {
        showWindow()
        mainWindow?.webContents.send(IPC_CHANNELS.SHOW_SETTINGS)
      },
    },
    { type: 'separator' },
    { label: '开发者工具', click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', toggleWindow)
}

// ==================== Global Shortcut ====================

function registerGlobalShortcut() {
  const settings = configManager.getSettings()
  const shortcut = settings.globalShortcut || 'Alt+Space'
  globalShortcut.unregisterAll()

  const registered = globalShortcut.register(shortcut, toggleWindow)
  if (!registered) {
    console.error(`Failed to register global shortcut: ${shortcut}`)
  }
}

// ==================== IPC Handlers ====================

function setupIPC() {
  // Config
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => configManager.getConfig())
  ipcMain.handle(IPC_CHANNELS.SET_CONFIG, (_event, config) => {
    if (config.models) configManager.setModels(config.models)
    if (config.settings) configManager.setSettings(config.settings)
    return configManager.getConfig()
  })

  // Models
  ipcMain.handle(IPC_CHANNELS.GET_MODELS, () => configManager.getModels())
  ipcMain.handle(IPC_CHANNELS.SET_MODELS, (_event, models) => {
    configManager.setModels(models)
    return configManager.getModels()
  })

  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => configManager.getSettings())
  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, (_event, settings) => {
    const oldSettings = configManager.getSettings()
    configManager.setSettings(settings)
    if (settings.globalShortcut && settings.globalShortcut !== oldSettings.globalShortcut) {
      registerGlobalShortcut()
    }
    return configManager.getSettings()
  })

  // ==================== Chat ====================
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (_event, requestId: string, messages: any[]) => {
    if (!mainWindow) return
    const win = mainWindow

    await sendChatStream(requestId, messages, {
      onChunk: (chunk) => {
        if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.CHAT_STREAM_CHUNK, requestId, chunk)
      },
      onEnd: (fullContent) => {
        if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.CHAT_STREAM_END, requestId, fullContent)
      },
      onError: (error) => {
        if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, requestId, error)
      },
    })
  })

  ipcMain.on(IPC_CHANNELS.CHAT_ABORT, (_event, requestId: string) => {
    abortChatRequest(requestId)
  })

  // ==================== Conversations ====================
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, () => conversationManager.getConversations())
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_SAVE, (_event, conv) => {
    conversationManager.saveConversation(conv)
  })
  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE, (_event, id: string) => {
    conversationManager.deleteConversation(id)
  })

  // ==================== Everything Search ====================
  ipcMain.handle(IPC_CHANNELS.EVERYTHING_SEARCH, async (_event, options) => {
    try {
      return { success: true, data: await searchEverything(options) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle(IPC_CHANNELS.EVERYTHING_AVAILABLE, () => isEverythingAvailable())
  ipcMain.handle(IPC_CHANNELS.EVERYTHING_OPEN, async (_event, fullPath: string) => {
    try { await openSearchResult(fullPath); return { success: true } } catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle(IPC_CHANNELS.EVERYTHING_REVEAL, async (_event, fullPath: string) => {
    try { await revealInExplorer(fullPath); return { success: true } } catch (err: any) { return { success: false, error: err.message } }
  })

  // ==================== Window ====================
  ipcMain.on(IPC_CHANNELS.HIDE_WINDOW, () => hideWindow())

  ipcMain.on(IPC_CHANNELS.MOVE_WINDOW, (_event, x: number, y: number) => {
    if (!mainWindow) return
    mainWindow.setPosition(Math.round(x), Math.round(y))
    savedPosition = { x: Math.round(x), y: Math.round(y) }
  })

  ipcMain.handle(IPC_CHANNELS.RESIZE_WINDOW, (_event, width: number, height: number) => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    currentHeight = Math.round(height) // Update tracked height
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: Math.round(width), height: currentHeight })
  })

  ipcMain.handle(IPC_CHANNELS.SET_WINDOW_BOUNDS, (_event, newBounds: { x?: number; y?: number; width?: number; height?: number }) => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    const newX = Math.round(newBounds.x ?? bounds.x)
    const newY = Math.round(newBounds.y ?? bounds.y)
    mainWindow.setBounds({
      x: newX, y: newY,
      width: Math.round(newBounds.width ?? bounds.width),
      height: Math.round(newBounds.height ?? bounds.height),
    })
    if (newBounds.x !== undefined || newBounds.y !== undefined) {
      savedPosition = { x: newX, y: newY }
    }
  })

  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_BOUNDS, () => {
    if (!mainWindow) return null
    const bounds = mainWindow.getBounds()
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    return {
      ...bounds,
      screen: { x: display.workArea.x, y: display.workArea.y, width: display.workArea.width, height: display.workArea.height },
    }
  })

  // App
  ipcMain.handle(IPC_CHANNELS.GET_APP_PATH, () => ({
    home: app.getPath('home'),
    userData: app.getPath('userData'),
    projects: configManager.getSettings().projectsPath,
  }))

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    const { shell } = await import('electron')
    shell.openExternal(url)
  })
}

// ==================== App Lifecycle ====================

app.on('ready', () => {
  // Ensure CWD is user's home directory (not C:\Windows\System32 which is default for shortcuts)
  try {
    const home = app.getPath('home')
    process.chdir(home)
    console.log('[main] CWD set to:', process.cwd())
  } catch (err) {
    console.warn('[main] Could not set CWD:', err)
  }

  createWindow()
  createTray()
  setupIPC()
  registerGlobalShortcut()
  setTimeout(() => showWindow(), 500)
})

app.on('window-all-closed', () => { /* keep running in tray */ })
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('activate', () => { if (!mainWindow) createWindow() })

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}
