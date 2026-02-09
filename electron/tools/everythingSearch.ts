/**
 * Everything Search integration via es.exe.
 * Uses spawn + GBK decoding to properly handle Chinese filenames on Windows.
 */

import { spawn } from 'node:child_process'
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

function getEsExePath(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'resources', 'everything', 'es.exe')
  }
  return path.join(process.resourcesPath, 'everything', 'es.exe')
}

export function isEverythingAvailable(): boolean {
  return fs.existsSync(getEsExePath())
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
