/**
 * Native file search for Windows.
 * Strategy: Background file index (like Everything) + live walk fallback.
 * - On app startup: builds a file index in the background using Node.js readdir
 * - Searches: instant lookup from the cached index
 * - First search before index ready: live recursive walk with early termination
 * No external dependencies required.
 */

import { readdir } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createInterface } from 'node:readline'

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

// Directories to skip during indexing/search (too deep or system-only)
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__',
  '$Recycle.Bin', 'System Volume Information', '$WINDOWS.~BT', '$WinREAgent',
  'DumpStack.log.tmp',
])

// ==================== Index State ====================

let indexFilePath = ''
let indexReady = false
let indexBuilding = false
const INDEX_MAX_AGE = 2 * 60 * 60 * 1000 // 2 hours

function getIndexPath(): string {
  if (!indexFilePath) {
    try {
      const { app } = require('electron')
      indexFilePath = path.join(app.getPath('userData'), 'file-index.txt')
    } catch {
      indexFilePath = path.join(os.homedir(), '.everythingagent-index.txt')
    }
  }
  return indexFilePath
}

function isIndexFresh(): boolean {
  const p = getIndexPath()
  if (!fs.existsSync(p)) return false
  try {
    return Date.now() - fs.statSync(p).mtimeMs < INDEX_MAX_AGE
  } catch { return false }
}

// ==================== Index Builder ====================

/**
 * Start building file index in the background.
 * Called on app startup. Safe to call multiple times.
 */
export async function startIndexBuild(): Promise<void> {
  if (indexBuilding) return

  if (isIndexFresh()) {
    indexReady = true
    console.log('[search] File index is fresh, skipping rebuild')
    return
  }

  indexBuilding = true
  console.log('[search] Building file index in background...')
  const startTime = Date.now()

  try {
    const p = getIndexPath()
    const tempPath = p + '.tmp'

    // Ensure directory exists
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const ws = fs.createWriteStream(tempPath, { encoding: 'utf-8' })
    let count = 0

    const drives = getAvailableDrives()
    for (const drive of drives) {
      count += await indexWalk(drive, ws)
    }

    ws.end()
    await new Promise<void>((resolve, reject) => {
      ws.on('finish', resolve)
      ws.on('error', reject)
    })

    // Atomic rename
    if (fs.existsSync(p)) fs.unlinkSync(p)
    fs.renameSync(tempPath, p)

    indexReady = true
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[search] File index built: ${count} entries in ${elapsed}s`)
  } catch (err) {
    console.error('[search] Index build failed:', err)
  } finally {
    indexBuilding = false
  }
}

async function indexWalk(dir: string, ws: fs.WriteStream): Promise<number> {
  let count = 0
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      ws.write(fullPath + '\n')
      count++
      if (entry.isDirectory()) {
        count += await indexWalk(fullPath, ws)
      }
    }
  } catch {
    // Permission denied, etc — skip silently
  }
  return count
}

// ==================== Search Helpers ====================

function getAvailableDrives(): string[] {
  const drives: string[] = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    try {
      fs.accessSync(`${letter}:\\`)
      drives.push(`${letter}:\\`)
    } catch { /* not available */ }
  }
  return drives.length > 0 ? drives : ['C:\\']
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const re = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${re}$`, 'i')
}

function checkIsDirectory(fullPath: string): boolean {
  try {
    return fs.statSync(fullPath).isDirectory()
  } catch {
    return !path.extname(fullPath)
  }
}

function parseResults(lines: string[], options: SearchOptions): SearchResult[] {
  let results = lines.map((fullPath) => {
    const parsed = path.parse(fullPath)
    const isDir = checkIsDirectory(fullPath)
    return { fullPath, fileName: parsed.base, directory: parsed.dir, isDirectory: isDir }
  })

  if (options.foldersOnly) results = results.filter((r) => r.isDirectory)
  if (options.filesOnly) results = results.filter((r) => !r.isDirectory)

  return results
}

function matchesQuery(name: string, queryLower: string, regex: RegExp | null): boolean {
  if (regex) return regex.test(name)
  return name.toLowerCase().includes(queryLower)
}

// ==================== Search from Index (fast) ====================

async function searchFromIndex(options: SearchOptions): Promise<SearchResult[] | null> {
  const p = getIndexPath()
  if (!fs.existsSync(p)) return null

  // Check freshness
  try {
    if (Date.now() - fs.statSync(p).mtimeMs > INDEX_MAX_AGE * 2) return null
  } catch { return null }

  const maxN = options.maxResults ?? 30
  const query = options.query
  const queryLower = query.toLowerCase()
  const hasWildcard = query.includes('*') || query.includes('?')
  const regex = hasWildcard ? wildcardToRegex(query) : null

  const results: string[] = []

  const rl = createInterface({
    input: fs.createReadStream(p, 'utf-8'),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (results.length >= maxN) { rl.close(); break }
    if (!line) continue

    const target = options.matchPath ? line : path.basename(line)
    if (matchesQuery(target, queryLower, regex)) {
      results.push(line)
    }
  }

  if (results.length === 0) return null
  return parseResults(results, options)
}

// ==================== Live Search (fallback) ====================

async function searchLive(options: SearchOptions): Promise<SearchResult[]> {
  const maxN = options.maxResults ?? 30
  const query = options.query
  const queryLower = query.toLowerCase()
  const hasWildcard = query.includes('*') || query.includes('?')
  const regex = hasWildcard ? wildcardToRegex(query) : null

  const results: string[] = []
  const visited = new Set<string>()
  const startTime = Date.now()
  const TIMEOUT = 15000 // 15 seconds max for live search

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxN) return
    if (Date.now() - startTime > TIMEOUT) return

    const norm = dir.toLowerCase()
    if (visited.has(norm)) return
    visited.add(norm)

    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const subdirs: string[] = []

      for (const entry of entries) {
        if (results.length >= maxN) return
        if (SKIP_DIRS.has(entry.name)) continue

        const fullPath = path.join(dir, entry.name)
        const target = options.matchPath ? fullPath : entry.name

        if (matchesQuery(target, queryLower, regex)) {
          results.push(fullPath)
        }

        if (entry.isDirectory()) {
          subdirs.push(fullPath)
        }
      }

      for (const subdir of subdirs) {
        if (results.length >= maxN) return
        if (Date.now() - startTime > TIMEOUT) return
        await walk(subdir)
      }
    } catch {
      // Permission denied, etc
    }
  }

  // Search user directories first (fast)
  const home = os.homedir()
  const priorityDirs = [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    home,
  ]

  for (const dir of priorityDirs) {
    if (results.length >= maxN) break
    if (Date.now() - startTime > TIMEOUT) break
    try { if (fs.existsSync(dir)) await walk(dir) } catch {}
  }

  // Search all drives if not enough
  if (results.length < maxN && Date.now() - startTime < TIMEOUT) {
    const drives = getAvailableDrives()
    for (const drive of drives) {
      if (results.length >= maxN) break
      if (Date.now() - startTime > TIMEOUT) break
      await walk(drive)
    }
  }

  return parseResults(results, options)
}

// ==================== Main API ====================

/**
 * Native file search — replaces searchEverything.
 * Uses cached file index for instant results, falls back to live walk.
 */
export async function searchNative(options: SearchOptions): Promise<SearchResult[]> {
  console.log('[search] Searching for:', options.query)

  // Try cached index first (fast — streaming readline through index file)
  if (indexReady || isIndexFresh()) {
    const indexed = await searchFromIndex(options)
    if (indexed && indexed.length > 0) {
      console.log('[search] Index hit:', indexed.length, 'results')
      return indexed
    }
  }

  // Fall back to live recursive walk
  console.log('[search] Live search fallback...')
  const live = await searchLive(options)
  console.log('[search] Live search found:', live.length, 'results')

  // Trigger index build if not ready
  if (!indexReady && !indexBuilding) {
    startIndexBuild().catch(() => {})
  }

  return live
}

/**
 * Native search is always available — no external dependencies needed.
 */
export function isSearchAvailable(): boolean {
  return true
}

export async function openSearchResult(fullPath: string): Promise<void> {
  const { shell } = await import('electron')
  shell.openPath(fullPath)
}

export async function revealInExplorer(fullPath: string): Promise<void> {
  const { shell } = await import('electron')
  shell.showItemInFolder(fullPath)
}
