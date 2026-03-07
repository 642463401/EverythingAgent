/**
 * OpenAI-compatible adapter.
 * Extracted from the existing chatService.ts logic — no behavioral changes.
 * Used for: openai-compatible, aliyun, dashscope, zhipu providers.
 */

import type { ChatRequestMessage, AccumulatedToolCall } from '../chatService'
import type { ProviderAdapter, StreamRoundResult, StreamRoundOptions } from './types'

export class OpenAIAdapter implements ProviderAdapter {
  buildUrl(baseUrl: string, _model: string): string {
    let url = baseUrl.trim()
    if (url.endsWith('/')) url = url.slice(0, -1)
    if (url.endsWith('/chat/completions')) return url
    if (url.endsWith('/v1')) return `${url}/chat/completions`
    return `${url}/chat/completions`
  }

  buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
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
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        tools,
        stream: true,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 8192,
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
                  toolCallMap.set(idx, { id: '', name: '', arguments: '' })
                }
                const acc = toolCallMap.get(idx)!
                if (tc.id) acc.id = tc.id
                if (tc.function?.name) acc.name += tc.function.name
                if (tc.function?.arguments) acc.arguments += tc.function.arguments
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
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
      }),
    })

    if (!response.ok) return ''

    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || ''
  }
}
