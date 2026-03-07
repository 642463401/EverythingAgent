/**
 * Google Gemini native API adapter.
 * Uses /v1beta/models/{model}:streamGenerateContent endpoint with Google's format.
 */

import type { ChatRequestMessage, AccumulatedToolCall } from '../chatService'
import type { ProviderAdapter, StreamRoundResult, StreamRoundOptions } from './types'

// ==================== Message Conversion ====================

interface GooglePart {
  text?: string
  functionCall?: { name: string; args: any }
  functionResponse?: { name: string; response: any }
}

interface GoogleContent {
  role: 'user' | 'model'
  parts: GooglePart[]
}

/**
 * Find tool name from a tool_call_id by searching the messages array.
 */
function findToolName(messages: ChatRequestMessage[], toolCallId: string): string {
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id === toolCallId) {
          return tc.function?.name || tc.name || ''
        }
      }
    }
  }
  return ''
}

/**
 * Convert internal OpenAI-format messages to Google Gemini format.
 * - System messages → systemInstruction
 * - user/assistant → user/model roles with parts
 * - Tool calls → functionCall parts
 * - Tool results → functionResponse parts in user message
 */
function convertMessages(messages: ChatRequestMessage[]): {
  systemInstruction?: { parts: { text: string }[] }
  contents: GoogleContent[]
} {
  let systemText = ''
  const contents: GoogleContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText += (systemText ? '\n\n' : '') + (msg.content || '')
      continue
    }

    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content || '' }],
      })
      continue
    }

    if (msg.role === 'assistant') {
      const parts: GooglePart[] = []
      if (msg.content) {
        parts.push({ text: msg.content })
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const fn = tc.function || tc
          let args: any = {}
          try {
            args = JSON.parse(fn.arguments || '{}')
          } catch {
            args = { raw: fn.arguments }
          }
          parts.push({
            functionCall: { name: fn.name, args },
          })
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts })
      }
      continue
    }

    if (msg.role === 'tool') {
      const toolName = findToolName(messages, msg.tool_call_id || '')
      let parsedContent: any
      try {
        parsedContent = JSON.parse(msg.content || '{}')
      } catch {
        parsedContent = { result: msg.content }
      }

      const part: GooglePart = {
        functionResponse: {
          name: toolName,
          response: parsedContent,
        },
      }

      // Merge consecutive tool results into one user message
      const prev = contents[contents.length - 1]
      if (prev && prev.role === 'user' && prev.parts.some((p) => p.functionResponse)) {
        prev.parts.push(part)
      } else {
        contents.push({ role: 'user', parts: [part] })
      }
      continue
    }
  }

  const result: any = { contents }
  if (systemText) {
    result.systemInstruction = { parts: [{ text: systemText }] }
  }
  return result
}

/**
 * Recursively strip fields that Google Gemini API does not support
 * in function declaration parameters (e.g. additionalProperties, $schema).
 */
function cleanSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(cleanSchema)

  const cleaned: any = {}
  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported top-level JSON Schema fields
    if (key === 'additionalProperties' || key === '$schema') continue
    cleaned[key] = cleanSchema(value)
  }
  return cleaned
}

/**
 * Convert OpenAI-format tool definitions to Google Gemini format.
 */
function convertTools(openaiTools: any[]): any[] {
  if (openaiTools.length === 0) return []
  return [
    {
      functionDeclarations: openaiTools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: cleanSchema(t.function.parameters),
      })),
    },
  ]
}

// ==================== Adapter Implementation ====================

let toolCallCounter = 0

export class GoogleAdapter implements ProviderAdapter {
  buildUrl(baseUrl: string, model: string): string {
    let url = baseUrl.trim()
    if (url.endsWith('/')) url = url.slice(0, -1)
    // Strip /openai suffix if present (leftover from OpenAI-compatible mode)
    if (url.endsWith('/openai')) url = url.slice(0, -7)
    // Ensure /v1beta path
    if (!url.includes('/v1beta') && !url.includes('/v1')) {
      url += '/v1beta'
    }
    return `${url}/models/${model}:streamGenerateContent?alt=sse`
  }

  private buildNonStreamUrl(baseUrl: string, model: string): string {
    let url = baseUrl.trim()
    if (url.endsWith('/')) url = url.slice(0, -1)
    if (url.endsWith('/openai')) url = url.slice(0, -7)
    if (!url.includes('/v1beta') && !url.includes('/v1')) {
      url += '/v1beta'
    }
    return `${url}/models/${model}:generateContent`
  }

  buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
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
    const { systemInstruction, contents } = convertMessages(messages)
    const googleTools = convertTools(tools)

    const body: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 8192,
      },
    }
    if (systemInstruction) body.systemInstruction = systemInstruction
    if (googleTools.length > 0) body.tools = googleTools

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
   * Parse Google Gemini SSE stream.
   * Format: data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"}}]}
   */
  private async parseStream(
    body: ReadableStream<Uint8Array>,
    onContentChunk: (chunk: string) => void,
  ): Promise<StreamRoundResult> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const toolCalls: AccumulatedToolCall[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        try {
          const data = JSON.parse(trimmed.slice(6))

          // Check for blocked prompts
          if (data.promptFeedback?.blockReason) {
            throw new Error(`请求被 Gemini 安全过滤器拦截: ${data.promptFeedback.blockReason}`)
          }

          const parts = data.candidates?.[0]?.content?.parts || []

          for (const part of parts) {
            if (part.text) {
              content += part.text
              onContentChunk(part.text)
            }
            if (part.functionCall) {
              // Google doesn't provide tool call IDs, generate synthetic ones
              toolCalls.push({
                id: `call_google_${Date.now()}_${toolCallCounter++}`,
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {}),
              })
            }
          }

          // Check for safety-stopped responses
          const finishReason = data.candidates?.[0]?.finishReason
          if (finishReason === 'SAFETY' && !content && toolCalls.length === 0) {
            throw new Error('Gemini 安全过滤器中止了响应生成')
          }
        } catch (e) {
          // Re-throw our own errors, skip malformed JSON
          if (e instanceof Error && e.message.includes('Gemini')) throw e
        }
      }
    }

    return { content, toolCalls }
  }

  async nonStreamingRequest(
    url: string,
    headers: Record<string, string>,
    model: string,
    messages: ChatRequestMessage[],
    options?: StreamRoundOptions,
  ): Promise<string> {
    // Build non-streaming URL from the streaming URL
    const nsUrl = url.replace(':streamGenerateContent?alt=sse', ':generateContent')

    const { systemInstruction, contents } = convertMessages(messages)

    const body: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 2048,
      },
    }
    if (systemInstruction) body.systemInstruction = systemInstruction

    const response = await fetch(nsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) return ''

    const data = await response.json()
    const parts = data.candidates?.[0]?.content?.parts || []
    return parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('')
      .trim()
  }
}
