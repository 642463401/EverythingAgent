import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../src/types/config'

/** Exposed API for renderer process */
const electronAPI = {
  // ==================== Config ====================
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),
  setConfig: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config),

  getModels: () => ipcRenderer.invoke(IPC_CHANNELS.GET_MODELS),
  setModels: (models: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SET_MODELS, models),

  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSettings: (settings: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, settings),

  // ==================== Window ====================
  hideWindow: () => ipcRenderer.send(IPC_CHANNELS.HIDE_WINDOW),
  showSettings: () => ipcRenderer.send(IPC_CHANNELS.SHOW_SETTINGS),
  resizeWindow: (width: number, height: number) => ipcRenderer.invoke(IPC_CHANNELS.RESIZE_WINDOW, width, height),
  setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) => ipcRenderer.invoke(IPC_CHANNELS.SET_WINDOW_BOUNDS, bounds),
  getWindowBounds: () => ipcRenderer.invoke(IPC_CHANNELS.GET_WINDOW_BOUNDS),
  moveWindow: (x: number, y: number) => ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, x, y),

  // ==================== Chat ====================
  chatSend: (requestId: string, messages: unknown[]) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, requestId, messages),
  chatAbort: (requestId: string) => ipcRenderer.send(IPC_CHANNELS.CHAT_ABORT, requestId),
  onChatStreamChunk: (callback: (requestId: string, chunk: string) => void) => {
    const handler = (_event: any, requestId: string, chunk: string) => callback(requestId, chunk)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_CHUNK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_CHUNK, handler)
  },
  onChatStreamEnd: (callback: (requestId: string, fullContent: string) => void) => {
    const handler = (_event: any, requestId: string, fullContent: string) => callback(requestId, fullContent)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_END, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_END, handler)
  },
  onChatStreamError: (callback: (requestId: string, error: string) => void) => {
    const handler = (_event: any, requestId: string, error: string) => callback(requestId, error)
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, handler)
  },

  // ==================== Conversations ====================
  conversationsList: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST),
  conversationsSave: (conv: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_SAVE, conv),
  conversationsDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_DELETE, id),

  // ==================== Memory ====================
  memoryList: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST),
  memoryDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE, id),
  memoryClear: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CLEAR),

  // ==================== Skills ====================
  skillsList: () => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LIST),
  skillsSave: (skill: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_SAVE, skill),
  skillsDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, id),

  // ==================== Dialog ====================
  showOpenDialog: (options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options),

  // ==================== App ====================
  getAppPath: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_PATH),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),

  // ==================== Everything Search ====================
  everythingSearch: (options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EVERYTHING_SEARCH, options),
  everythingAvailable: () => ipcRenderer.invoke(IPC_CHANNELS.EVERYTHING_AVAILABLE),
  everythingOpen: (fullPath: string) => ipcRenderer.invoke(IPC_CHANNELS.EVERYTHING_OPEN, fullPath),
  everythingReveal: (fullPath: string) => ipcRenderer.invoke(IPC_CHANNELS.EVERYTHING_REVEAL, fullPath),

  // ==================== Events ====================
  onToggleWindow: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.TOGGLE_WINDOW, callback)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TOGGLE_WINDOW, callback)
  },

  onShowSettings: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.SHOW_SETTINGS, callback)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_SETTINGS, callback)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

/** Type augmentation for renderer */
export type ElectronAPI = typeof electronAPI
