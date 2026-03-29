/**
 * SubAgent Service — isolated execution agents for multi-step tasks.
 *
 * Flow: User → AGENT → SubAgent(execute & return result) → AGENT → User
 *
 * SubAgent is a pure task executor:
 * - Receives a task from AGENT
 * - Executes the task using tools in an isolated context
 * - Returns structured results to AGENT
 * - Does NOT stream output to the user
 * - Context is released after completion (ephemeral)
 */

import {
  getActiveModel,
  buildTools,
  executeTool,
  compressMessages,
} from './chatService'
import { getAdapter } from './adapters'
import { skillManager } from '../configManager'
import type { ProviderAdapter } from './adapters'
import type { ChatRequestMessage, AccumulatedToolCall } from './chatService'
import type { SubAgentResult } from '../../src/types/config'

// ==================== Constants ====================

const MAX_SUBAGENT_ITERATIONS = 15
const SUBAGENT_TOOL_BLACKLIST = new Set(['delegate_task', 'task_progress'])

const SUBAGENT_SYSTEM_PROMPT = `你是一个任务执行助手。你唯一的职责是精确执行分配给你的任务，并返回执行结果。

核心规则（违反任何一条都是严重错误）：
1. 你必须通过调用工具来完成每一个操作。绝不允许在没有调用工具的情况下声称操作已完成。
2. 即使任务描述中提到"之前已做过"类似操作，你也必须重新执行。你没有任何历史上下文，必须从头开始。
3. 每次调用工具后，必须检查返回结果的 success 字段确认操作是否成功。
4. 如果操作失败，分析原因并重试，最多重试 2 次。
5. 完成所有操作后，以文字形式输出结构化的执行摘要，包括：成功的操作列表、创建/修改的文件路径、遇到的问题。禁止为了输出摘要而额外创建文件。
6. 文件路径必须使用绝对路径（如 C:\\Users\\user\\EverythingAgent\\Projects\\file.txt）。
7. 创建文件时必须在 write_file 的 content 参数中写入完整的文件内容，不得省略或用占位符代替。
8. 修改文件前必须先用 read_file 读取文件当前内容，确保 edit_file 的 old_string 与实际内容匹配。
9. 你的输出不会直接显示给用户，只会作为结果返回给主Agent。请确保摘要信息完整准确。

你可以使用的工具包括：文件读写（read_file/write_file/edit_file）、目录浏览（list_directory）、数据分析（analyze_data）、命令执行（run_command）、文件管理（file_manage）、打开应用（open_application/open_file）、桌面控制（desktop_control）等。

当前时间: {timestamp}`

// ==================== Helper Functions ====================

function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildSubAgentTools(): any[] {
  const allTools = buildTools()
  const filtered = allTools.filter((t: any) => {
    const name = t.function?.name
    return !SUBAGENT_TOOL_BLACKLIST.has(name)
  })

  // Add enabled skills as tools
  const enabledSkills = skillManager.getEnabledSkills()
  for (const skill of enabledSkills) {
    filtered.push({
      type: 'function' as const,
      function: {
        name: `skill_${skill.id}`,
        description: `[技能] ${skill.name}: ${(skill as any).usageRule || (skill as any).description || ''}`,
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: '传递给技能的输入内容',
            },
          },
          required: ['input'],
        },
      },
    })
  }

  return filtered
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

function buildSubAgentSkillsSection(): string {
  const skills = skillManager.getEnabledSkills()
  if (skills.length === 0) return ''
  const lines = skills.map((s: any) => {
    const tools = (s.tools || [])
    const toolsStr = tools.map((t: any) => typeof t === 'string' ? t : t.type).join(', ')
    return `- skill_${s.id}: ${s.name}${toolsStr ? ` [工具: ${toolsStr}]` : ''} — ${s.usageRule || s.description || ''}`
  })
  return `\n\n可用技能工具（通过 skill_<id> 调用）：
${lines.join('\n')}`
}

// ==================== SubAgent Service ====================

class SubAgentService {
  /**
   * Execute a task in an isolated SubAgent context.
   * The SubAgent runs silently — it does NOT stream output to the user.
   * It only executes tools and returns a structured result to the calling AGENT.
   */
  async executeTask(
    task: string,
    context: string | undefined,
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
    console.log(`[SubAgent ${agentId}] Starting task: ${task.slice(0, 80)}`)

    const adapter = getAdapter(model.providerType)
    const url = adapter.buildUrl(model.baseUrl, model.modelName)
    const headers = adapter.buildHeaders(model.apiKey)

    // Build fresh messages — no conversation history pollution
    const systemContent = SUBAGENT_SYSTEM_PROMPT.replace('{timestamp}', buildTimestamp()) + buildSubAgentSkillsSection()
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
        adapter, url, headers, model.modelName, messages,
        controller.signal, agentId,
      )
      finalContent = result.content

      const filesAffected = extractFilesAffected(messages)

      if (result.truncated) {
        console.log(`[SubAgent ${agentId}] Task TRUNCATED after ${result.iterationsUsed} iterations`)
        finalContent = `[⚠️ 任务被截断：已达迭代上限(${result.iterationsUsed}/${MAX_SUBAGENT_ITERATIONS})，任务可能未完成]\n\n${finalContent}`
      } else {
        console.log(`[SubAgent ${agentId}] Task completed successfully (${result.iterationsUsed} iterations)`)
      }

      return {
        agentId,
        success: true,
        summary: finalContent,
        filesAffected,
        truncated: result.truncated,
        iterationsUsed: result.iterationsUsed,
      }
    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' ? '任务被中断' : err.message
      console.error(`[SubAgent ${agentId}] Task failed: ${errorMsg}`)

      return {
        agentId,
        success: false,
        summary: finalContent,
        filesAffected: extractFilesAffected(messages),
        error: errorMsg,
      }
    }
    // Context is released here — messages array is garbage collected
  }

  /**
   * Core tool-calling loop for SubAgent execution.
   * Runs silently without streaming to the user.
   * All output is accumulated internally and returned as the final result.
   */
  private async runToolLoop(
    adapter: ProviderAdapter,
    url: string,
    headers: Record<string, string>,
    modelName: string,
    messages: ChatRequestMessage[],
    signal: AbortSignal,
    agentId: string,
  ): Promise<{ content: string; truncated: boolean; iterationsUsed: number }> {
    let finalContent = ''
    const tools = buildSubAgentTools()
    let lastHadToolCalls = false

    let i = 0
    for (; i < MAX_SUBAGENT_ITERATIONS; i++) {
      // Compress old messages to manage context window
      compressMessages(messages)

      const { content, toolCalls } = await adapter.streamRound(
        url, headers, modelName, messages, tools, signal,
        () => {
          // Discard streaming chunks — SubAgent does not output to user
        },
      )

      finalContent = content
      lastHadToolCalls = toolCalls.length > 0

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

      // Execute each tool call silently
      for (const tc of toolCalls) {
        console.log(`[SubAgent ${agentId}] Tool: ${tc.name}`)

        const result = await executeTool(tc.name, tc.arguments)

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      }
    }

    // Truncated if we exhausted all iterations and the last round still had tool calls
    const truncated = i >= MAX_SUBAGENT_ITERATIONS && lastHadToolCalls
    const iterationsUsed = Math.min(i + (lastHadToolCalls ? 0 : 1), MAX_SUBAGENT_ITERATIONS)

    return { content: finalContent, truncated, iterationsUsed }
  }
}

// ==================== Singleton Export ====================

export const subAgentService = new SubAgentService()
