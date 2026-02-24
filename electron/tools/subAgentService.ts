/**
 * SubAgent Service — isolated execution agents for multi-step tasks.
 *
 * Each SubAgent runs in its own context (fresh message history), preventing
 * the "lazy AI" problem where the model skips operations it has seen before.
 * SubAgent states are persisted to disk for cross-session resumption.
 */

import { subAgentManager } from '../configManager'
import {
  getActiveModel,
  buildChatUrl,
  buildTools,
  streamOneRound,
  executeTool,
  compressMessages,
} from './chatService'
import type { ChatRequestMessage, ChatStreamCallbacks, AccumulatedToolCall } from './chatService'
import type { SubAgentState, SubAgentResult } from '../../src/types/config'

// ==================== Constants ====================

const MAX_SUBAGENT_ITERATIONS = 15
const SUBAGENT_TOOL_BLACKLIST = new Set(['delegate_task', 'resume_agent'])

const SUBAGENT_SYSTEM_PROMPT = `你是一个任务执行助手。你唯一的职责是精确执行分配给你的任务。

核心规则（违反任何一条都是严重错误）：
1. 你必须通过调用工具来完成每一个操作。绝不允许在没有调用工具的情况下声称操作已完成。
2. 即使任务描述中提到"之前已做过"类似操作，你也必须重新执行。你没有任何历史上下文，必须从头开始。
3. 每次调用工具后，必须检查返回结果的 success 字段确认操作是否成功。
4. 如果操作失败，分析原因并重试，最多重试 2 次。
5. 完成所有操作后，输出结构化的执行摘要，包括：成功的操作列表、创建/修改的文件路径、遇到的问题。
6. 文件路径必须使用绝对路径（如 C:\\Users\\user\\Desktop\\file.txt）。
7. 创建文件时必须在 write_file 的 content 参数中写入完整的文件内容，不得省略或用占位符代替。
8. 修改文件前必须先用 read_file 读取文件当前内容，确保 edit_file 的 old_string 与实际内容匹配。

你可以使用的工具包括：文件读写（read_file/write_file/edit_file）、目录浏览（list_directory）、数据分析（analyze_data）、命令执行（run_command）、文件管理（file_manage）、打开应用（open_application/open_file）、桌面控制（desktop_control）等。

当前时间: {timestamp}`

// ==================== Helper Functions ====================

function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildSubAgentTools(): any[] {
  const allTools = buildTools()
  return allTools.filter((t: any) => {
    const name = t.function?.name
    return !SUBAGENT_TOOL_BLACKLIST.has(name)
  })
}

function extractFilesAffected(messages: ChatRequestMessage[]): string[] {
  const files = new Set<string>()
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.content) {
      try {
        const parsed = JSON.parse(msg.content)
        if (parsed.path) files.add(parsed.path)
      } catch { /* ignore non-JSON results */ }
    }
  }
  return Array.from(files)
}

function buildTimestamp(): string {
  const now = new Date()
  return now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    hour12: false,
  })
}

// ==================== Tool Meta for SubAgent UI ====================

const subAgentToolMeta: Record<string, { icon: string; label: string }> = {
  'everything_search': { icon: '🔍', label: '本地搜索' },
  'web_search': { icon: '🌐', label: '联网搜索' },
  'web_reader': { icon: '📄', label: '读取网页' },
  'read_file': { icon: '📖', label: '读取文件' },
  'write_file': { icon: '✏️', label: '写入文件' },
  'list_directory': { icon: '📁', label: '浏览目录' },
  'analyze_data': { icon: '📊', label: '分析数据' },
  'run_command': { icon: '⚡', label: '执行命令' },
  'file_manage': { icon: '📦', label: '管理文件' },
  'open_application': { icon: '🚀', label: '打开应用' },
  'open_file': { icon: '📂', label: '打开文件' },
  'desktop_control': { icon: '🖥️', label: '桌面控制' },
  'edit_file': { icon: '✏️', label: '修改文件' },
  'city_lookup': { icon: '🏙️', label: '查询城市' },
}

// ==================== SubAgent Service ====================

class SubAgentService {
  /**
   * Execute a new task in an isolated SubAgent context.
   */
  async executeTask(
    task: string,
    context: string | undefined,
    callbacks: ChatStreamCallbacks,
  ): Promise<SubAgentResult> {
    const model = getActiveModel()
    if (!model) {
      return {
        agentId: '',
        success: false,
        summary: '',
        filesAffected: [],
        error: '未配置活跃的 AI 模型',
      }
    }

    const agentId = generateAgentId()
    const taskName = task.length > 50 ? task.slice(0, 50) + '...' : task

    callbacks.onChunk(`\n🤖 [执行助手 ${agentId}] 开始执行: "${taskName}"\n`)

    const url = buildChatUrl(model.baseUrl, model.providerType)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`,
    }

    // Build fresh messages — no conversation history pollution
    const systemContent = SUBAGENT_SYSTEM_PROMPT.replace('{timestamp}', buildTimestamp())
    const userContent = context
      ? `任务：${task}\n\n上下文信息：\n${context}`
      : `任务：${task}`

    const messages: ChatRequestMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ]

    const controller = new AbortController()
    let finalContent = ''

    try {
      const result = await this.runToolLoop(
        url, headers, model.modelName, messages,
        controller.signal, callbacks, agentId,
      )
      finalContent = result

      const filesAffected = extractFilesAffected(messages)

      // Persist agent state for possible resume
      const state: SubAgentState = {
        id: agentId,
        name: taskName,
        messages,
        status: 'completed',
        result: finalContent,
        filesAffected,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      subAgentManager.saveAgent(state)

      callbacks.onChunk(`\n🤖 [执行助手 ${agentId}] 任务完成\n`)

      return {
        agentId,
        success: true,
        summary: finalContent,
        filesAffected,
      }
    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' ? '任务被中断' : err.message
      callbacks.onChunk(`\n❌ [执行助手 ${agentId}] 执行失败: ${errorMsg}\n`)

      // Persist failed state for debugging
      const state: SubAgentState = {
        id: agentId,
        name: taskName,
        messages,
        status: 'failed',
        result: errorMsg,
        filesAffected: extractFilesAffected(messages),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      subAgentManager.saveAgent(state)

      return {
        agentId,
        success: false,
        summary: finalContent,
        filesAffected: state.filesAffected,
        error: errorMsg,
      }
    }
  }

  /**
   * Resume a previously persisted SubAgent with additional instructions.
   */
  async resumeAgent(
    agentId: string,
    additionalTask: string,
    callbacks: ChatStreamCallbacks,
  ): Promise<SubAgentResult> {
    const model = getActiveModel()
    if (!model) {
      return {
        agentId,
        success: false,
        summary: '',
        filesAffected: [],
        error: '未配置活跃的 AI 模型',
      }
    }

    // Load persisted agent state
    const savedState = subAgentManager.getAgent(agentId)
    if (!savedState) {
      return {
        agentId,
        success: false,
        summary: '',
        filesAffected: [],
        error: `未找到执行助手 ${agentId}，可能已过期或不存在`,
      }
    }

    callbacks.onChunk(`\n🔄 [执行助手 ${agentId}] 恢复执行: "${additionalTask}"\n`)

    const url = buildChatUrl(model.baseUrl, model.providerType)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`,
    }

    // Continue from saved messages, add new instruction
    const messages = [...savedState.messages]
    messages.push({
      role: 'user',
      content: `继续任务。新的指令：${additionalTask}`,
    })

    const controller = new AbortController()
    let finalContent = ''

    try {
      const result = await this.runToolLoop(
        url, headers, model.modelName, messages,
        controller.signal, callbacks, agentId,
      )
      finalContent = result

      const filesAffected = extractFilesAffected(messages)

      // Update persisted state
      const updatedState: SubAgentState = {
        ...savedState,
        messages,
        status: 'completed',
        result: finalContent,
        filesAffected,
        updatedAt: Date.now(),
      }
      subAgentManager.saveAgent(updatedState)

      callbacks.onChunk(`\n🔄 [执行助手 ${agentId}] 恢复任务完成\n`)

      return {
        agentId,
        success: true,
        summary: finalContent,
        filesAffected,
      }
    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' ? '任务被中断' : err.message
      callbacks.onChunk(`\n❌ [执行助手 ${agentId}] 恢复执行失败: ${errorMsg}\n`)

      const updatedState: SubAgentState = {
        ...savedState,
        messages,
        status: 'failed',
        result: errorMsg,
        filesAffected: extractFilesAffected(messages),
        updatedAt: Date.now(),
      }
      subAgentManager.saveAgent(updatedState)

      return {
        agentId,
        success: false,
        summary: finalContent,
        filesAffected: updatedState.filesAffected,
        error: errorMsg,
      }
    }
  }

  /**
   * Core tool-calling loop for SubAgent execution.
   * Similar to the main agent loop but:
   * - Uses SubAgent-specific tools (no delegate_task/resume_agent)
   * - Has its own iteration limit (15 rounds)
   * - No writtenFiles dedup
   * - Streams tool progress back via callbacks
   */
  private async runToolLoop(
    url: string,
    headers: Record<string, string>,
    modelName: string,
    messages: ChatRequestMessage[],
    signal: AbortSignal,
    callbacks: ChatStreamCallbacks,
    agentId: string,
  ): Promise<string> {
    let finalContent = ''
    const tools = buildSubAgentTools()

    for (let i = 0; i < MAX_SUBAGENT_ITERATIONS; i++) {
      // Compress old messages to manage context window
      compressMessages(messages)

      const { content, toolCalls } = await streamOneRoundWithSubAgentTools(
        url, headers, modelName, messages, signal, tools,
        (chunk) => {
          // Stream SubAgent's text output to the UI
          callbacks.onChunk(chunk)
        },
      )

      finalContent = content

      if (toolCalls.length === 0) break

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      })

      // Execute each tool call
      for (const tc of toolCalls) {
        let queryDisplay = ''
        try {
          const args = JSON.parse(tc.arguments)
          queryDisplay = args.query || args.command || args.path || args.url || args.name || args.operation || args.action || tc.arguments
        } catch {
          queryDisplay = tc.arguments
        }

        // Stream tool status to UI
        const meta = subAgentToolMeta[tc.name] || { icon: '🔧', label: tc.name }
        callbacks.onChunk(`\n  ${meta.icon} ${meta.label}: "${queryDisplay}"\n`)

        const result = await executeTool(tc.name, tc.arguments)

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })

        // Show write/edit result status
        if (tc.name === 'write_file' || tc.name === 'edit_file') {
          try {
            const parsed = JSON.parse(result)
            if (parsed.success) {
              const sizeKB = parsed.size ? ` (${(parsed.size / 1024).toFixed(1)}KB)` : ''
              callbacks.onChunk(`  ✅ ${tc.name === 'write_file' ? '文件已写入' : '文件已修改'}: ${parsed.path}${sizeKB}\n`)
            } else if (parsed.warning || parsed.error) {
              callbacks.onChunk(`  ⚠️ ${parsed.message || parsed.error || '操作未成功'}\n`)
            }
          } catch { /* ignore */ }
        }
      }
    }

    return finalContent
  }
}

/**
 * StreamOneRound variant that uses SubAgent-specific tools.
 * This calls the API directly with the filtered tool set (excluding delegate_task/resume_agent).
 */
async function streamOneRoundWithSubAgentTools(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: ChatRequestMessage[],
  signal: AbortSignal,
  tools: any[],
  onContentChunk: (chunk: string) => void,
): Promise<{ content: string; toolCalls: AccumulatedToolCall[] }> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: true,
      temperature: 0.7,
      max_tokens: 8192,
    }),
    signal,
  })

  if (!response.ok) {
    let errorMsg = `API 请求失败: ${response.status} ${response.statusText}`
    try {
      const errorBody = await response.text()
      const parsed = JSON.parse(errorBody)
      if (parsed.error?.message) {
        errorMsg = `API 错误: ${parsed.error.message}`
      }
    } catch { /* ignore */ }
    throw new Error(errorMsg)
  }

  if (!response.body) {
    throw new Error('API 返回了空的响应体')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const toolCallMap = new Map<number, AccumulatedToolCall>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === ':') continue
      if (trimmed === 'data: [DONE]') continue

      if (trimmed.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(trimmed.slice(6))
          const delta = parsed.choices?.[0]?.delta

          if (delta?.content) {
            content += delta.content
            onContentChunk(delta.content)
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                })
              } else {
                const existing = toolCallMap.get(idx)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name += tc.function.name
                if (tc.function?.arguments) existing.arguments += tc.function.arguments
              }
            }
          }
        } catch { /* skip malformed SSE data */ }
      }
    }
  }

  const toolCalls = Array.from(toolCallMap.values()).filter((tc) => tc.name)
  return { content, toolCalls }
}

// ==================== Singleton Export ====================

export const subAgentService = new SubAgentService()
