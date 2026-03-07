/**
 * Adapter factory — returns the correct adapter for a provider type.
 */

import type { ProviderType } from '../../../src/types/config'
import type { ProviderAdapter } from './types'
import { OpenAIAdapter } from './openaiAdapter'
import { AnthropicAdapter } from './anthropicAdapter'
import { GoogleAdapter } from './googleAdapter'

const openaiAdapter = new OpenAIAdapter()
const anthropicAdapter = new AnthropicAdapter()
const googleAdapter = new GoogleAdapter()

export function getAdapter(providerType?: ProviderType | string): ProviderAdapter {
  switch (providerType) {
    case 'anthropic':
      return anthropicAdapter
    case 'google':
      return googleAdapter
    default:
      return openaiAdapter
  }
}

export type { ProviderAdapter, StreamRoundResult, StreamRoundOptions } from './types'
