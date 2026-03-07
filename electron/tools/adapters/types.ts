/**
 * Provider Adapter interface — abstracts away differences between
 * OpenAI, Anthropic, and Google API formats.
 *
 * Internal messages always use OpenAI format (ChatRequestMessage).
 * Adapters convert at the request boundary.
 */

import type { ChatRequestMessage, AccumulatedToolCall } from '../chatService'

export interface StreamRoundResult {
  content: string
  toolCalls: AccumulatedToolCall[]
}

export interface StreamRoundOptions {
  temperature?: number
  maxTokens?: number
}

export interface ProviderAdapter {
  /** Build the full URL for a chat request. */
  buildUrl(baseUrl: string, model: string): string

  /** Build HTTP headers for requests. */
  buildHeaders(apiKey: string): Record<string, string>

  /**
   * Execute one streaming round.
   * Converts internal OpenAI-format messages/tools to provider format,
   * sends the request, parses the SSE stream, returns normalized results.
   */
  streamRound(
    url: string,
    headers: Record<string, string>,
    model: string,
    messages: ChatRequestMessage[],
    tools: any[],
    signal: AbortSignal,
    onContentChunk: (chunk: string) => void,
    options?: StreamRoundOptions,
  ): Promise<StreamRoundResult>

  /**
   * Execute a non-streaming request (e.g. for memory extraction).
   * Returns the assistant's text content.
   */
  nonStreamingRequest(
    url: string,
    headers: Record<string, string>,
    model: string,
    messages: ChatRequestMessage[],
    options?: StreamRoundOptions,
  ): Promise<string>
}
