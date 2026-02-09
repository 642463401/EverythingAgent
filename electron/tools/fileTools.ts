/**
 * File Read/Write and Data Analysis Tools.
 * Provides AI with the ability to read, write, and analyze local files.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

// ==================== Constants ====================

const MAX_READ_SIZE = 512 * 1024      // 512KB max for reading
const MAX_WRITE_SIZE = 1024 * 1024    // 1MB max for writing
const MAX_CSV_ROWS = 10000            // Max rows to analyze
const PREVIEW_ROWS = 20               // Rows to show in preview

// Disallowed paths for safety
const BLOCKED_PATTERNS = [
  /^[A-Z]:\\Windows/i,
  /^[A-Z]:\\Program Files/i,
  /^[A-Z]:\\ProgramData/i,
  /^\/etc\//,
  /^\/usr\//,
  /^\/bin\//,
  /^\/sbin\//,
]

// Strictly binary - never attempt to read as text
const BINARY_EXTS = new Set([
  '.exe', '.dll', '.bin', '.so', '.dylib',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.flac', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.docx', '.xlsx', '.pptx',  // Office XML formats are ZIP-based binary
])

// ==================== Helpers ====================

/**
 * Safely resolve file path.
 * In packaged Electron apps, process.cwd() is often C:\Windows\System32,
 * so we use app.getPath('home') as the base for relative paths.
 */
function safeResolve(filePath: string): string {
  // If already absolute, resolve normally
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath)
  }
  // For relative paths, resolve against user's home directory (NOT process.cwd())
  try {
    const home = app.getPath('home')
    return path.resolve(home, filePath)
  } catch {
    // Fallback to normal resolve (e.g., during tests or if app is not ready)
    return path.resolve(filePath)
  }
}

function isPathSafe(filePath: string): boolean {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(filePath)) return false
  }
  return true
}

function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTS.has(getFileExtension(filePath))
}

/**
 * Decode buffer to string, trying UTF-8 first then GBK (for Chinese Windows).
 */
function decodeBuffer(buf: Buffer): string {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return utf8
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return buf.toString('latin1')
    }
  }
}

// ==================== Read File ====================

export async function readFile(filePath: string): Promise<string> {
  if (!filePath || filePath.trim() === '') {
    return JSON.stringify({ error: '未提供文件路径' })
  }

  const resolved = safeResolve(filePath.trim())
  console.log('[fileTools] readFile:', resolved)

  if (!isPathSafe(resolved)) {
    return JSON.stringify({ error: `安全限制: 不允许读取系统目录下的文件` })
  }

  try {
    const stat = await fsp.stat(resolved)

    if (stat.isDirectory()) {
      return JSON.stringify({ error: `"${resolved}" 是目录而非文件，请使用 list_directory 工具` })
    }

    if (stat.size > MAX_READ_SIZE) {
      return JSON.stringify({
        error: `文件过大 (${(stat.size / 1024).toFixed(1)}KB)，最大支持 ${MAX_READ_SIZE / 1024}KB`,
        path: resolved,
        size: stat.size,
      })
    }

    // Strictly binary files - refuse immediately
    if (isBinaryFile(resolved)) {
      const ext = getFileExtension(resolved)
      return JSON.stringify({
        path: resolved,
        size: stat.size,
        type: ext,
        error: `不支持读取二进制文件 (${ext})`,
        suggestion: ext === '.docx' || ext === '.xlsx' || ext === '.pptx'
          ? '这是 Office XML 格式（本质是 ZIP 压缩包）。建议使用 .md 或 .txt 格式来创建文档。'
          : undefined,
      })
    }

    // Read as buffer first
    const buffer = await fsp.readFile(resolved)

    // Empty file
    if (buffer.length === 0) {
      return JSON.stringify({
        path: resolved,
        size: 0,
        lines: 0,
        content: '',
        message: '文件为空',
      })
    }

    // Quick binary detection: check for null bytes in first 8KB
    const checkLength = Math.min(buffer.length, 8192)
    let nullCount = 0
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) nullCount++
    }

    if (nullCount > checkLength * 0.01) {
      const ext = getFileExtension(resolved)
      return JSON.stringify({
        path: resolved,
        size: stat.size,
        type: ext,
        error: `文件内容为二进制格式，无法作为文本读取`,
        suggestion: '建议使用 .md 或 .txt 格式来创建可读写的文档。',
      })
    }

    // Decode with GBK fallback (important for Chinese Windows)
    const content = decodeBuffer(buffer)
    const lines = content.split('\n')

    return JSON.stringify({
      path: resolved,
      size: stat.size,
      lines: lines.length,
      encoding: 'utf-8',
      content: content,
    })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return JSON.stringify({ error: `文件不存在: ${resolved}` })
    }
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return JSON.stringify({ error: `没有权限读取文件: ${resolved}` })
    }
    return JSON.stringify({ error: `读取文件失败: ${err.message}`, path: resolved })
  }
}

// ==================== Write File ====================

export async function writeFile(filePath: string, content: string): Promise<string> {
  if (!filePath || filePath.trim() === '') {
    return JSON.stringify({ error: '未提供文件路径' })
  }

  const resolved = safeResolve(filePath.trim())
  console.log('[fileTools] writeFile:', resolved)

  if (!isPathSafe(resolved)) {
    return JSON.stringify({ error: `安全限制: 不允许写入系统目录` })
  }

  if (content.length > MAX_WRITE_SIZE) {
    return JSON.stringify({ error: `内容过大 (${(content.length / 1024).toFixed(1)}KB)，最大支持 ${MAX_WRITE_SIZE / 1024}KB` })
  }

  try {
    // Ensure directory exists (skip if already present, e.g. drive root)
    const dir = path.dirname(resolved)
    try {
      const dirStat = await fsp.stat(dir)
      if (!dirStat.isDirectory()) {
        return JSON.stringify({ error: `路径无效: "${dir}" 不是目录` })
      }
    } catch {
      // Directory doesn't exist, create it
      await fsp.mkdir(dir, { recursive: true })
    }

    await fsp.writeFile(resolved, content, 'utf-8')

    // Verify file was written
    const stat = await fsp.stat(resolved)
    return JSON.stringify({
      success: true,
      path: resolved,
      size: stat.size,
      lines: content.split('\n').length,
      message: `文件已成功写入: ${resolved}`,
    })
  } catch (err: any) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return JSON.stringify({ error: `没有权限写入: ${resolved}` })
    }
    return JSON.stringify({ error: `写入文件失败: ${err.message}`, path: resolved })
  }
}

// ==================== List Directory ====================

export async function listDirectory(dirPath: string): Promise<string> {
  if (!dirPath || dirPath.trim() === '') {
    return JSON.stringify({ error: '未提供目录路径' })
  }

  const resolved = safeResolve(dirPath.trim())
  console.log('[fileTools] listDirectory:', resolved)

  if (!isPathSafe(resolved)) {
    return JSON.stringify({ error: `安全限制: 不允许列出系统目录` })
  }

  try {
    const stat = await fsp.stat(resolved)
    if (!stat.isDirectory()) {
      return JSON.stringify({ error: `"${resolved}" 不是目录` })
    }

    const entries = await fsp.readdir(resolved, { withFileTypes: true })

    const items = entries.slice(0, 200).map((entry) => {
      const fullPath = path.join(resolved, entry.name)
      let size = 0
      try {
        if (entry.isFile()) {
          size = fs.statSync(fullPath).size
        }
      } catch { /* ignore */ }

      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? size : undefined,
        ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : undefined,
      }
    })

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return JSON.stringify({
      path: resolved,
      totalEntries: entries.length,
      showing: items.length,
      items,
    })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return JSON.stringify({ error: `目录不存在: ${resolved}` })
    }
    return JSON.stringify({ error: `列出目录失败: ${err.message}` })
  }
}

// ==================== Analyze Data ====================

export async function analyzeData(filePath: string): Promise<string> {
  if (!filePath || filePath.trim() === '') {
    return JSON.stringify({ error: '未提供文件路径' })
  }

  const resolved = safeResolve(filePath.trim())
  console.log('[fileTools] analyzeData:', resolved)

  if (!isPathSafe(resolved)) {
    return JSON.stringify({ error: `安全限制: 不允许读取系统目录下的文件` })
  }

  const ext = getFileExtension(resolved)

  try {
    const stat = await fsp.stat(resolved)

    if (ext === '.json') {
      return await analyzeJson(resolved, stat.size)
    } else if (ext === '.csv' || ext === '.tsv') {
      return await analyzeCsv(resolved, stat.size, ext === '.tsv' ? '\t' : ',')
    } else {
      return JSON.stringify({
        error: `不支持的数据格式: ${ext}`,
        supported: ['.json', '.csv', '.tsv'],
        suggestion: '请提供 JSON、CSV 或 TSV 格式的数据文件',
      })
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return JSON.stringify({ error: `文件不存在: ${resolved}` })
    }
    return JSON.stringify({ error: `分析数据失败: ${err.message}` })
  }
}

// ==================== JSON Analysis ====================

async function analyzeJson(filePath: string, fileSize: number): Promise<string> {
  if (fileSize > MAX_READ_SIZE * 2) {
    return JSON.stringify({ error: `JSON 文件过大 (${(fileSize / 1024 / 1024).toFixed(2)}MB)` })
  }

  const buffer = await fsp.readFile(filePath)
  const raw = decodeBuffer(buffer)
  const data = JSON.parse(raw)

  if (Array.isArray(data)) {
    const totalRows = data.length
    const sample = data.slice(0, PREVIEW_ROWS)

    const allKeys = new Set<string>()
    data.slice(0, 100).forEach((item: any) => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach((k) => allKeys.add(k))
      }
    })

    const columns = [...allKeys]
    const columnStats: Record<string, any> = {}

    for (const col of columns) {
      const values = data.map((row: any) => row?.[col]).filter((v: any) => v !== undefined && v !== null)
      const types = new Set(values.map((v: any) => typeof v))
      const numericValues = values.filter((v: any) => typeof v === 'number') as number[]

      columnStats[col] = {
        type: [...types].join('/'),
        nonNull: values.length,
        nullCount: totalRows - values.length,
      }

      if (numericValues.length > 0) {
        columnStats[col].min = Math.min(...numericValues)
        columnStats[col].max = Math.max(...numericValues)
        columnStats[col].avg = +(numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2)
      }

      if (types.has('string')) {
        const strValues = values.filter((v: any) => typeof v === 'string') as string[]
        const uniqueCount = new Set(strValues).size
        columnStats[col].uniqueValues = uniqueCount
        if (uniqueCount <= 10) {
          columnStats[col].topValues = [...new Set(strValues)].slice(0, 10)
        }
      }
    }

    return JSON.stringify({
      path: filePath,
      format: 'JSON Array',
      fileSize,
      totalRows,
      columns,
      columnStats,
      preview: sample,
    })
  } else if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data)
    return JSON.stringify({
      path: filePath,
      format: 'JSON Object',
      fileSize,
      topLevelKeys: keys,
      keyCount: keys.length,
      preview: data,
    })
  } else {
    return JSON.stringify({
      path: filePath,
      format: 'JSON Primitive',
      fileSize,
      value: data,
    })
  }
}

// ==================== CSV Analysis ====================

async function analyzeCsv(filePath: string, fileSize: number, delimiter: string): Promise<string> {
  const buffer = await fsp.readFile(filePath)
  let raw = decodeBuffer(buffer)
  // Remove BOM if present
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
  const lines = raw.split('\n').filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return JSON.stringify({ path: filePath, error: '文件为空' })
  }

  const header = parseCsvLine(lines[0], delimiter)
  const totalRows = lines.length - 1

  const dataLines = lines.slice(1, MAX_CSV_ROWS + 1)
  const rows = dataLines.map((line) => parseCsvLine(line, delimiter))

  const columnStats: Record<string, any> = {}

  for (let colIdx = 0; colIdx < header.length; colIdx++) {
    const colName = header[colIdx] || `Column_${colIdx}`
    const values = rows.map((row) => row[colIdx] || '').filter((v) => v.trim() !== '')

    const numericValues: number[] = []
    let isNumeric = true
    for (const v of values) {
      const num = Number(v)
      if (!isNaN(num) && v.trim() !== '') {
        numericValues.push(num)
      } else {
        isNumeric = false
      }
    }

    columnStats[colName] = {
      nonNull: values.length,
      nullCount: rows.length - values.length,
    }

    if (isNumeric && numericValues.length > 0) {
      columnStats[colName].type = 'numeric'
      columnStats[colName].min = Math.min(...numericValues)
      columnStats[colName].max = Math.max(...numericValues)
      columnStats[colName].avg = +(numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2)
      const sorted = [...numericValues].sort((a, b) => a - b)
      columnStats[colName].median = sorted.length % 2 === 0
        ? +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(2)
        : sorted[Math.floor(sorted.length / 2)]
    } else {
      columnStats[colName].type = 'string'
      const uniqueCount = new Set(values).size
      columnStats[colName].uniqueValues = uniqueCount
      if (uniqueCount <= 10) {
        const freq: Record<string, number> = {}
        values.forEach((v) => { freq[v] = (freq[v] || 0) + 1 })
        columnStats[colName].topValues = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([val, count]) => ({ value: val, count }))
      }
    }
  }

  const preview = rows.slice(0, PREVIEW_ROWS).map((row) => {
    const obj: Record<string, string> = {}
    header.forEach((col, i) => { obj[col || `Column_${i}`] = row[i] || '' })
    return obj
  })

  return JSON.stringify({
    path: filePath,
    format: delimiter === '\t' ? 'TSV' : 'CSV',
    fileSize,
    totalRows,
    columns: header,
    columnCount: header.length,
    columnStats,
    preview,
  })
}

// Simple CSV line parser (handles quoted fields)
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }
  result.push(current.trim())
  return result
}
