/**
 * File Manager Tools for natural language file management.
 * Provides file operations (copy, move, rename, delete), application launching,
 * file opening, and desktop icon control.
 */

import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app, shell } from 'electron'

// ==================== Safety ====================

const BLOCKED_PATTERNS = [
  /^[A-Z]:\\Windows/i,
  /^[A-Z]:\\Program Files/i,
  /^[A-Z]:\\ProgramData/i,
  /^\/etc\//,
  /^\/usr\//,
  /^\/bin\//,
  /^\/sbin\//,
]

function safeResolve(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath)
  }
  try {
    const home = app.getPath('home')
    return path.resolve(home, filePath)
  } catch {
    return path.resolve(filePath)
  }
}

function isPathSafe(filePath: string): boolean {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(filePath)) return false
  }
  return true
}

// ==================== File Management ====================

const MAX_COPY_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

/**
 * Manage files: copy, move, rename, delete, create_folder.
 * Delete operations use Recycle Bin (shell.trashItem) for safety.
 */
export async function fileManage(
  operation: string,
  source: string,
  destination?: string,
): Promise<string> {
  if (!operation || !source) {
    return JSON.stringify({ error: '缺少必要参数: operation 和 source' })
  }

  const op = operation.toLowerCase().trim()
  const srcPath = safeResolve(source.trim())

  if (!isPathSafe(srcPath)) {
    return JSON.stringify({ error: '安全限制: 不允许操作系统目录下的文件' })
  }

  console.log(`[fileManager] ${op}: ${srcPath} -> ${destination || ''}`)

  try {
    switch (op) {
      case 'copy': {
        if (!destination) return JSON.stringify({ error: 'copy 操作需要 destination 参数' })
        const dstPath = safeResolve(destination.trim())
        if (!isPathSafe(dstPath)) {
          return JSON.stringify({ error: '安全限制: 不允许写入系统目录' })
        }

        const stat = await fsp.stat(srcPath)
        if (stat.isFile() && stat.size > MAX_COPY_SIZE) {
          return JSON.stringify({ error: `文件过大 (${(stat.size / 1024 / 1024 / 1024).toFixed(2)}GB)，最大支持 2GB` })
        }

        // Ensure destination directory exists
        const dstDir = stat.isFile() ? path.dirname(dstPath) : path.dirname(dstPath)
        await fsp.mkdir(dstDir, { recursive: true })

        await fsp.cp(srcPath, dstPath, { recursive: true })
        return JSON.stringify({
          success: true,
          operation: 'copy',
          source: srcPath,
          destination: dstPath,
          message: `已复制到: ${dstPath}`,
        })
      }

      case 'move': {
        if (!destination) return JSON.stringify({ error: 'move 操作需要 destination 参数' })
        const dstPath = safeResolve(destination.trim())
        if (!isPathSafe(dstPath)) {
          return JSON.stringify({ error: '安全限制: 不允许移动到系统目录' })
        }

        await fsp.mkdir(path.dirname(dstPath), { recursive: true })
        await fsp.rename(srcPath, dstPath)
        return JSON.stringify({
          success: true,
          operation: 'move',
          source: srcPath,
          destination: dstPath,
          message: `已移动到: ${dstPath}`,
        })
      }

      case 'rename': {
        if (!destination) return JSON.stringify({ error: 'rename 操作需要 destination 参数（新文件名或完整路径）' })
        // If destination is just a name (no path separators), rename in same directory
        let dstPath: string
        if (!destination.includes('/') && !destination.includes('\\')) {
          dstPath = path.join(path.dirname(srcPath), destination.trim())
        } else {
          dstPath = safeResolve(destination.trim())
        }
        if (!isPathSafe(dstPath)) {
          return JSON.stringify({ error: '安全限制: 不允许重命名到系统目录' })
        }

        await fsp.rename(srcPath, dstPath)
        return JSON.stringify({
          success: true,
          operation: 'rename',
          source: srcPath,
          destination: dstPath,
          message: `已重命名为: ${path.basename(dstPath)}`,
        })
      }

      case 'delete': {
        // Use Recycle Bin for safety
        await shell.trashItem(srcPath)
        return JSON.stringify({
          success: true,
          operation: 'delete',
          source: srcPath,
          message: `已移至回收站: ${path.basename(srcPath)}`,
        })
      }

      case 'create_folder': {
        await fsp.mkdir(srcPath, { recursive: true })
        return JSON.stringify({
          success: true,
          operation: 'create_folder',
          path: srcPath,
          message: `已创建文件夹: ${srcPath}`,
        })
      }

      default:
        return JSON.stringify({
          error: `不支持的操作: ${op}`,
          supported: ['copy', 'move', 'rename', 'delete', 'create_folder'],
        })
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return JSON.stringify({ error: `文件或目录不存在: ${srcPath}` })
    }
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return JSON.stringify({ error: `没有权限执行此操作: ${srcPath}` })
    }
    if (err.code === 'ENOTEMPTY') {
      return JSON.stringify({ error: `目标目录不为空: ${destination}` })
    }
    return JSON.stringify({ error: `文件操作失败: ${err.message}` })
  }
}

// ==================== Application Launcher ====================

/**
 * Common application name mappings (Chinese + English -> executable or start command).
 */
const APP_MAP: Record<string, string> = {
  // Browsers
  'chrome': 'chrome',
  '谷歌浏览器': 'chrome',
  'edge': 'msedge',
  'firefox': 'firefox',
  '火狐': 'firefox',

  // Microsoft Office
  'word': 'winword',
  'excel': 'excel',
  'powerpoint': 'powerpnt',
  'ppt': 'powerpnt',
  'outlook': 'outlook',
  'onenote': 'onenote',

  // Development
  'vscode': 'code',
  'code': 'code',
  'visual studio code': 'code',

  // System utilities
  '记事本': 'notepad',
  'notepad': 'notepad',
  '计算器': 'calc',
  'calculator': 'calc',
  'calc': 'calc',
  '画图': 'mspaint',
  'paint': 'mspaint',
  '资源管理器': 'explorer',
  'explorer': 'explorer',
  '文件管理器': 'explorer',
  '任务管理器': 'taskmgr',
  'task manager': 'taskmgr',
  '控制面板': 'control',
  '设置': 'ms-settings:',
  'settings': 'ms-settings:',
  '终端': 'wt',
  'terminal': 'wt',
  'windows terminal': 'wt',
  '截图工具': 'snippingtool',

  // Communication
  '微信': 'WeChat',
  'wechat': 'WeChat',
  'qq': 'QQ',
  '钉钉': 'DingTalk',
  'dingtalk': 'DingTalk',
  '飞书': 'Feishu',
  'feishu': 'Feishu',
  'lark': 'Feishu',
  '腾讯会议': 'WeMeet',
  'teams': 'ms-teams',

  // Media
  '网易云音乐': 'cloudmusic',
  'spotify': 'spotify',

  // Other
  '微信开发者工具': 'wechatdevtools',
  'postman': 'Postman',
  'typora': 'Typora',
  'obsidian': 'Obsidian',
  'notion': 'Notion',
}

// Blocked applications for security
const BLOCKED_APPS = new Set([
  'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
  'regedit', 'regedit.exe', 'reg', 'reg.exe',
  'bcdedit', 'bcdedit.exe', 'diskpart', 'diskpart.exe',
])

/**
 * Open an application by name.
 * First checks the known app map, then tries `start` command,
 * then falls back to Everything search for the .exe path.
 */
export async function openApplication(appName: string): Promise<string> {
  if (!appName || appName.trim() === '') {
    return JSON.stringify({ error: '未提供应用名称' })
  }

  const name = appName.trim()
  const nameLower = name.toLowerCase()

  // Security check
  if (BLOCKED_APPS.has(nameLower)) {
    return JSON.stringify({ error: `安全限制: 不允许直接打开 ${name}，请使用 run_command 工具执行命令` })
  }

  console.log(`[fileManager] openApplication: ${name}`)

  // Check app map
  const mapped = APP_MAP[nameLower]
  if (mapped) {
    return await launchApp(mapped, name)
  }

  // Try to launch directly (works for apps in PATH)
  const directResult = await launchApp(name, name)
  if (!directResult.includes('"error"')) {
    return directResult
  }

  // Fallback: try searching for the executable via Everything
  try {
    const { searchEverything } = await import('./everythingSearch')
    const results = await searchEverything({
      query: `${name}.exe`,
      maxResults: 5,
      filesOnly: true,
    })

    if (results.length > 0) {
      const exePath = results[0].fullPath
      const errorStr = await shell.openPath(exePath)
      if (!errorStr) {
        return JSON.stringify({
          success: true,
          application: name,
          path: exePath,
          message: `已打开: ${name} (${exePath})`,
        })
      }
    }
  } catch { /* ignore search errors */ }

  return JSON.stringify({
    error: `未找到应用: ${name}`,
    suggestion: '请尝试提供完整的应用名称或 .exe 文件路径',
  })
}

async function launchApp(command: string, displayName: string): Promise<string> {
  // For ms-settings: and similar URI schemes
  if (command.includes(':')) {
    try {
      const errorStr = await shell.openExternal(command)
      // shell.openExternal returns void on success for Electron
      return JSON.stringify({
        success: true,
        application: displayName,
        message: `已打开: ${displayName}`,
      })
    } catch (err: any) {
      return JSON.stringify({ error: `打开失败: ${err.message}` })
    }
  }

  return new Promise<string>((resolve) => {
    const child = spawn('cmd.exe', ['/c', 'start', '', command], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    })

    child.unref()

    child.on('error', (err) => {
      resolve(JSON.stringify({ error: `启动失败: ${err.message}` }))
    })

    // Give it a moment to fail or succeed
    setTimeout(() => {
      resolve(JSON.stringify({
        success: true,
        application: displayName,
        message: `已打开: ${displayName}`,
      }))
    }, 1000)
  })
}

// ==================== File Opener ====================

/**
 * Open a file with its default application or a specified application.
 */
export async function openFile(filePath: string, application?: string): Promise<string> {
  if (!filePath || filePath.trim() === '') {
    return JSON.stringify({ error: '未提供文件路径' })
  }

  const resolved = safeResolve(filePath.trim())
  console.log(`[fileManager] openFile: ${resolved}`)

  // Check file exists
  try {
    await fsp.stat(resolved)
  } catch {
    return JSON.stringify({ error: `文件不存在: ${resolved}` })
  }

  if (application) {
    // Open with specific application
    return new Promise<string>((resolve) => {
      const child = spawn('cmd.exe', ['/c', 'start', '', application, resolved], {
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
      })
      child.unref()

      child.on('error', (err) => {
        resolve(JSON.stringify({ error: `用 ${application} 打开失败: ${err.message}` }))
      })

      setTimeout(() => {
        resolve(JSON.stringify({
          success: true,
          path: resolved,
          application,
          message: `已用 ${application} 打开: ${path.basename(resolved)}`,
        }))
      }, 1000)
    })
  }

  // Open with default application
  const errorStr = await shell.openPath(resolved)
  if (errorStr) {
    return JSON.stringify({ error: `打开失败: ${errorStr}` })
  }

  return JSON.stringify({
    success: true,
    path: resolved,
    message: `已打开: ${path.basename(resolved)}`,
  })
}

// ==================== Desktop Control ====================

/**
 * Control desktop icon visibility on Windows.
 * Uses PowerShell to toggle desktop icons via registry.
 */
export async function desktopControl(action: string): Promise<string> {
  if (!action || action.trim() === '') {
    return JSON.stringify({ error: '未提供操作类型' })
  }

  const act = action.toLowerCase().trim()
  console.log(`[fileManager] desktopControl: ${act}`)

  if (process.platform !== 'win32') {
    return JSON.stringify({ error: '桌面控制仅支持 Windows 系统' })
  }

  try {
    switch (act) {
      case 'hide_desktop_icons':
      case 'hide':
        return await setDesktopIconsVisibility(false)

      case 'show_desktop_icons':
      case 'show':
        return await setDesktopIconsVisibility(true)

      case 'toggle_desktop_icons':
      case 'toggle':
        return await toggleDesktopIcons()

      default:
        return JSON.stringify({
          error: `不支持的桌面操作: ${act}`,
          supported: ['hide_desktop_icons', 'show_desktop_icons', 'toggle_desktop_icons'],
        })
    }
  } catch (err: any) {
    return JSON.stringify({ error: `桌面控制失败: ${err.message}` })
  }
}

function runPowerShell(script: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: -1 })
    })

    child.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code })
    })
  })
}

async function setDesktopIconsVisibility(visible: boolean): Promise<string> {
  const value = visible ? 0 : 1
  const script = `
    $regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
    Set-ItemProperty -Path $regPath -Name 'HideIcons' -Value ${value} -Type DWord -Force
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Start-Process explorer.exe
  `

  const result = await runPowerShell(script)
  if (result.exitCode !== 0 && result.stderr) {
    return JSON.stringify({ error: `操作失败: ${result.stderr}` })
  }

  return JSON.stringify({
    success: true,
    action: visible ? 'show_desktop_icons' : 'hide_desktop_icons',
    message: visible ? '桌面图标已显示' : '桌面图标已隐藏',
  })
}

async function toggleDesktopIcons(): Promise<string> {
  const checkScript = `
    $regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
    try {
      $val = (Get-ItemProperty -Path $regPath -Name 'HideIcons' -ErrorAction SilentlyContinue).HideIcons
      if ($val -eq 1) { Write-Output 'hidden' } else { Write-Output 'visible' }
    } catch {
      Write-Output 'visible'
    }
  `

  const check = await runPowerShell(checkScript)
  const currentlyHidden = check.stdout.includes('hidden')
  return await setDesktopIconsVisibility(currentlyHidden)
}
