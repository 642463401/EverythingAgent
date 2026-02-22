/**
 * Everything Search integration via es.exe.
 * Uses spawn + GBK decoding to properly handle Chinese filenames on Windows.
 * Bundles portable Everything.exe and auto-starts it when needed.
 */

import { spawn, execSync, ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export interface SearchResult {
  fullPath: string
  fileName: string
  directory: string
  isDirectory: boolean
}

export interface SearchOptions {
  query: string
  maxResults?: number
  matchPath?: boolean
  matchCase?: boolean
  regex?: boolean
  foldersOnly?: boolean
  filesOnly?: boolean
  sortByPath?: boolean
}

let everythingProcess: ChildProcess | null = null

function getEverythingDir(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'resources', 'everything')
  }
  return path.join(process.resourcesPath, 'everything')
}

function getEsExePath(): string {
  return path.join(getEverythingDir(), 'es.exe')
}

function getEverythingExePath(): string {
  return path.join(getEverythingDir(), 'Everything.exe')
}

function isEverythingRunning(): boolean {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq Everything.exe" /NH', {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 5000,
    })
    return output.toLowerCase().includes('everything.exe')
  } catch {
    return false
  }
}

/**
 * Start the portable Everything.exe if it's not already running.
 * Called at app startup and before searches as a safety net.
 */
export function ensureEverythingRunning(): boolean {
  if (isEverythingRunning()) {
    return true
  }

  const everythingExe = getEverythingExePath()
  if (!fs.existsSync(everythingExe)) {
    return false
  }

  try {
    const dataPath = path.join(app.getPath('userData'), 'everything-data')
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
    }

    everythingProcess = spawn(everythingExe, [
      '-startup',
      '-minimized',
      '-instance', 'EverythingAgent',
      '-db', path.join(dataPath, 'Everything.db'),
    ], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      cwd: getEverythingDir(),
    })
    everythingProcess.unref()
    return true
  } catch {
    return false
  }
}

/**
 * Stop the portable Everything.exe instance on app quit.
 */
export function stopEverything(): void {
  try {
    const everythingExe = getEverythingExePath()
    if (fs.existsSync(everythingExe)) {
      spawn(everythingExe, ['-quit', '-instance', 'EverythingAgent'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    }
  } catch {
    // Ignore errors during shutdown
  }
  if (everythingProcess) {
    everythingProcess = null
  }
}

export function isEverythingAvailable(): boolean {
  return fs.existsSync(getEsExePath()) && fs.existsSync(getEverythingExePath())
}

/**
 * Decode a buffer trying UTF-8 first, falling back to GBK for Chinese Windows.
 */
function decodeBuffer(buf: Buffer): string {
  try {
    // If valid UTF-8 with no replacement chars, use it
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return utf8
  } catch {
    // Fall back to GBK (common on Chinese Windows)
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      // Last resort
      return buf.toString('latin1')
    }
  }
}

export function searchEverything(options: SearchOptions): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    const esPath = getEsExePath()

    if (!fs.existsSync(esPath)) {
      return reject(new Error(`es.exe not found at: ${esPath}`))
    }

    // Ensure Everything.exe is running before searching
    ensureEverythingRunning()

    const args: string[] = []
    args.push('-n', String(options.maxResults ?? 30))
    if (options.matchPath) args.push('-p')
    if (options.matchCase) args.push('-i')
    if (options.regex) args.push('-r')
    if (options.foldersOnly) args.push('/ad')
    if (options.filesOnly) args.push('/a-d')
    if (options.sortByPath) args.push('-s')
    args.push(options.query)

    const child = spawn(esPath, args, {
      windowsHide: true,
      timeout: 10000,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('error', (err) => reject(err))

    child.on('close', (code) => {
      const stdout = decodeBuffer(Buffer.concat(stdoutChunks))

      if (code !== 0 && !stdout.trim()) {
        const stderr = decodeBuffer(Buffer.concat(stderrChunks))
        if (stderr.trim()) return reject(new Error(stderr.trim()))
      }

      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      const results: SearchResult[] = lines.map((fullPath) => {
        const parsed = path.parse(fullPath)
        return {
          fullPath,
          fileName: parsed.base,
          directory: parsed.dir,
          isDirectory: !parsed.ext,
        }
      })

      resolve(results)
    })
  })
}

export async function openSearchResult(fullPath: string): Promise<void> {
  const { shell } = await import('electron')
  shell.openPath(fullPath)
}

export async function revealInExplorer(fullPath: string): Promise<void> {
  const { shell } = await import('electron')
  shell.showItemInFolder(fullPath)
}
