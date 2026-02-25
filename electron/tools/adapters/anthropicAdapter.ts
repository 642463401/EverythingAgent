/**
 * Anthropic native API adapter.
 * Uses /v1/messages endpoint with Anthropic's own message format and SSE events.
 */

import type { ChatRequestMessage, AccumulatedToolCall } from '../chatService'
import type { ProviderAdapter, StreamRoundResult, StreamRoundOptions } from './types'

// ==================== Message Conversion ====================

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: any
  tool_use_id?: string
  content?: string
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

/**
 * Convert internal OpenAI-format messages to Anthropic format.
 * - System messages extracted into top-level `system` field
 * - Assistant tool_calls → content blocks with type "tool_use"
 * - Tool results → user messages with type "tool_result" blocks
 */
function convertMessages(messages: ChatRequestMessage[]): {
  system: string
  messages: AnthropicMessage[]
} {
  let system = ''
  const result: AnthropicMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n\n' : '') + (msg.content || '')
      continue
    }

    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content || '' })
      continue
    }

    if (msg.role === 'assistant') {
      const contentBlocks: AnthropicContentBlock[] = []
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content })
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const fn = tc.function || tc
          let input: any = {}
          try {
            input = JSON.parse(fn.arguments || '{}')
          } catch {
            input = { raw: fn.arguments }
          }
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: fn.name,
            input,
          })
        }
      }
      // Use string content if no tool_calls and content is simple text
      if (contentBlocks.length === 1 && contentBlocks[0].type === 'text') {
        result.push({ role: 'assistant', content: contentBlocks[0].text || '' })
      } else if (contentBlocks.length > 0) {
        result.push({ role: 'assistant', content: contentBlocks })
      }
      continue
    }

    if (msg.role === 'tool') {
      // Anthropic requires tool_result inside a user message
      const toolResult: AnthropicContentBlock = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id || '',
        content: msg.content || '',
      }
      // Merge consecutive tool results into a single user message
      const prev = result[result.length - 1]
      if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
        prev.content.push(toolResult)
      } else {
        result.push({ role: 'user', content: [toolResult] })
      }
      continue
    }
  }

  return { system, messages: result }
}

/**
 * Convert OpenAI-format tool definitions to Anthropic format.
 */
function convertTools(openaiTools: any[]): any[] {
  return openaiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }))
}

// ==================== Adapter Implementation ====================

export class AnthropicAdapter implements ProviderAdapter {
  buildUrl(baseUrl: string, _model: string): string {
    let url = baseUrl.trim()
    if (url.endsWith('/')) url = url.slice(0, -1)
    if (url.endsWith('/messages')) return url
    if (url.endsWith('/v1')) return `${url}/messages`
    return `${url}/v1/messages`
  }

  buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  }

  async streamRound(
    url: string,
    headers: Record<string, string>,
    model: string,
    messages: ChatRequestMessage[],
    tools: any[],
    signal: AbortSignal,
    onContentChunk: (chunk: string) => void,
    options?: StreamRoundOptions,
  ): Promise<StreamRoundResult> {
    const { system, messages: anthropicMessages } = convertMessages(messages)
    const anthropicTools = convertTools(tools)

    const body: any = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    }
    if (system) body.system = system
    if (anthropicTools.length > 0) body.tools = anthropicTools

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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

    return this.parseStream(response.body, onContentChunk)
  }

  /**
   * Parse Anthropic SSE stream.
   * Events: message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
   */
  private async parseStream(
    body: ReadableStream<Uint8Array>,
    onContentChunk: (chunk: string) => void,
  ): Promise<StreamRoundResult> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let currentEvent = ''
    const toolCallMap = new Map<number, AccumulatedToolCall>()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          currentEvent = ''
          continue
        }

        // Parse event type
        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7)
          continue
        }

        // Parse data
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6))

            if (currentEvent === 'content_block_start') {
              const block = data.content_block
              if (block?.type === 'tool_use') {
                toolCallMap.set(data.index, {
                  id: block.id || '',
                  name: block.name || '',
                  arguments: '',
                })
              }
            }

            if (currentEvent === 'content_block_delta') {
              const delta = data.delta
              if (delta?.type === 'text_delta' && delta.text) {
                content += delta.text
                onContentChunk(delta.text)
              }
              if (delta?.type === 'input_json_delta' && delta.partial_json) {
                const tc = toolCallMap.get(data.index)
                if (tc) tc.arguments += delta.partial_json
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    }

    return {
      content,
      toolCalls: [...toolCallMap.values()].filter((tc) => tc.id && tc.name),
    }
  }

  async nonStreamingRequest(
    url: string,
    headers: Record<string, string>,
    model: string,
    messages: ChatRequestMessage[],
    options?: StreamRoundOptions,
  ): Promise<string> {
    const { system, messages: anthropicMessages } = convertMessages(messages)

    const body: any = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
    }
    if (system) body.system = system

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) return ''

    const data = await response.json()
    // Anthropic response: { content: [{ type: "text", text: "..." }, ...] }
    if (Array.isArray(data.content)) {
      return data.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
        .trim()
    }
    return ''
  }
}
