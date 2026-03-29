/**
 * Command Runner Tool for Auto-Coder workflow.
 * Executes system commands with safety checks, GBK decoding, timeout control,
 * and output truncation.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import { getBundledPythonDir } from './pythonHelper'

// ==================== Constants ====================

const DEFAULT_TIMEOUT = 30_000    // 30 seconds
const MAX_TIMEOUT = 120_000       // 120 seconds
const MAX_OUTPUT_SIZE = 50 * 1024 // 50KB max output

// ==================== Safety ====================

/**
 * Dangerous command patterns that could cause system damage.
 * Matched against the lowercased command string.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // Windows destructive commands
  /\bformat\s+[a-z]:/i,
  /\brd\s+\/s\s+\/q\s+[a-z]:\\/i,
  /\brmdir\s+\/s\s+\/q\s+[a-z]:\\/i,
  /\bdel\s+\/[sfq]+\s+[a-z]:\\/i,
  /\bdel\s+[a-z]:\\windows/i,
  /\bdel\s+[a-z]:\\program\s*files/i,
  // Linux/Unix destructive
  /\brm\s+-rf\s+\//,
  /\brm\s+-rf\s+\/\*/,
  /\bmkfs\b/,
  // System commands
  /\bshutdown\b/i,
  /\brestart\b.*\/[rf]\b/i,
  /\breg\s+delete\b/i,
  /\bbcdedit\b/i,
  /\bdiskpart\b/i,
  // Registry / admin
  /\bregedit\b/i,
  /\bnet\s+user\b/i,
  /\bnet\s+localgroup\b/i,
  /\btaskkill\s+\/f\s+\/im\s+(explorer|csrss|winlogon|lsass|svchost)/i,
]

const BLOCKED_CWD_PATTERNS = [
  /^[A-Z]:\\Windows/i,
  /^[A-Z]:\\Program Files/i,
  /^[A-Z]:\\ProgramData/i,
  /^\/etc$/,
  /^\/usr$/,
  /^\/bin$/,
  /^\/sbin$/,
]

function isDangerousCommand(command: string): string | null {
  const cmd = command.trim()
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      return `安全限制: 检测到危险命令模式，已拦截执行。`
    }
  }
  return null
}

function isCwdSafe(cwd: string): boolean {
  for (const pattern of BLOCKED_CWD_PATTERNS) {
    if (pattern.test(cwd)) return false
  }
  return true
}

// ==================== Decoder ====================

function decodeBuffer(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return buf.toString('latin1')
    }
  }
}

// ==================== Main Function ====================

/**
 * Execute a system command and return the output.
 *
 * @param command - The command string to execute
 * @param cwd - Optional working directory (defaults to user's home)
 * @param timeout - Optional timeout in ms (default 30s, max 120s)
 * @returns JSON string with { exitCode, stdout, stderr, error? }
 */
export async function runCommand(
  command: string,
  cwd?: string,
  timeout?: number,
): Promise<string> {
  // Validate command
  if (!command || command.trim() === '') {
    return JSON.stringify({ error: '未提供命令' })
  }

  const cmd = command.trim()

  // Safety check
  const dangerCheck = isDangerousCommand(cmd)
  if (dangerCheck) {
    return JSON.stringify({ error: dangerCheck, command: cmd })
  }

  // Resolve working directory
  let workDir: string
  if (cwd && cwd.trim()) {
    workDir = path.resolve(cwd.trim())
  } else {
    try {
      workDir = app.getPath('home')
    } catch {
      workDir = process.cwd()
    }
  }

  if (!isCwdSafe(workDir)) {
    return JSON.stringify({ error: `安全限制: 不允许在系统目录中执行命令: ${workDir}` })
  }

  // Clamp timeout
  const actualTimeout = Math.min(Math.max(timeout || DEFAULT_TIMEOUT, 1000), MAX_TIMEOUT)

  console.log(`[commandRunner] Executing: ${cmd}`)
  console.log(`[commandRunner] CWD: ${workDir}, Timeout: ${actualTimeout}ms`)

  return new Promise<string>((resolve) => {
    // Use cmd.exe on Windows, sh on Unix
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd.exe' : '/bin/sh'
    const shellArgs = isWindows ? ['/c', cmd] : ['-c', cmd]

    // Inject bundled Python into PATH so 'python' / 'pip' resolve to the project environment
    const pythonDir = getBundledPythonDir()
    const currentPath = process.env.PATH || ''
    const envPath = pythonDir
      ? `${pythonDir};${path.join(pythonDir, 'Scripts')};${currentPath}`
      : currentPath

    const child = spawn(shell, shellArgs, {
      cwd: workDir,
      windowsHide: true,
      timeout: actualTimeout,
      env: { ...process.env, PATH: envPath },
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutSize = 0
    let stderrSize = 0
    let truncated = false

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutSize < MAX_OUTPUT_SIZE) {
        stdoutChunks.push(chunk)
        stdoutSize += chunk.length
      } else {
        truncated = true
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrSize < MAX_OUTPUT_SIZE) {
        stderrChunks.push(chunk)
        stderrSize += chunk.length
      } else {
        truncated = true
      }
    })

    child.on('error', (err) => {
      console.error('[commandRunner] Spawn error:', err.message)
      resolve(JSON.stringify({
        error: `命令执行失败: ${err.message}`,
        command: cmd,
        cwd: workDir,
      }))
    })

    child.on('close', (code, signal) => {
      const stdout = decodeBuffer(Buffer.concat(stdoutChunks)).trim()
      const stderr = decodeBuffer(Buffer.concat(stderrChunks)).trim()

      console.log(`[commandRunner] Exit code: ${code}, signal: ${signal}`)

      // Truncate output if needed
      const maxChars = MAX_OUTPUT_SIZE
      const stdoutTrimmed = stdout.length > maxChars ? stdout.slice(0, maxChars) + '\n... (输出被截断)' : stdout
      const stderrTrimmed = stderr.length > maxChars ? stderr.slice(0, maxChars) + '\n... (错误输出被截断)' : stderr

      const result: Record<string, any> = {
        exitCode: code ?? -1,
        command: cmd,
        cwd: workDir,
      }

      if (stdoutTrimmed) result.stdout = stdoutTrimmed
      if (stderrTrimmed) result.stderr = stderrTrimmed
      if (truncated) result.truncated = true

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        result.error = `命令超时 (${actualTimeout / 1000}s) 已终止`
      }

      resolve(JSON.stringify(result))
    })
  })
}
