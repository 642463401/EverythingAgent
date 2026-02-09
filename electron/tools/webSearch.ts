/**
 * Web Search via Metaso AI REST API.
 * Endpoint: https://metaso.cn/api/v1/search
 */

import { configManager } from '../configManager'

const API_ENDPOINT = 'https://metaso.cn/api/v1/search'
const READER_ENDPOINT = 'https://metaso.cn/api/v1/reader'

interface MetasoSearchResult {
  title?: string
  url?: string
  snippet?: string
  content?: string
  [key: string]: any
}

/**
 * Search the web using Metaso AI REST API.
 *
 * @param query - Search query
 * @param scope - Search scope: 'webpage' | 'scholar' | 'document' | 'image' | 'video' | 'podcast'
 * @param size - Number of results (1-20)
 * @returns Formatted search results string
 */
export async function webSearch(
  query: string,
  scope: string = 'webpage',
  size: number = 10,
): Promise<string> {
  const apiKey = configManager.getSettings().metasoApiKey
  if (!apiKey) {
    return JSON.stringify({ error: '未配置秘塔 AI 搜索 API Key。请在设置中填写。' })
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        scope: scope,
        includeSummary: false,
        size: String(size),
        includeRawContent: false,
        conciseSnippet: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = await response.json()

    // Format results for AI consumption
    if (data.data && Array.isArray(data.data)) {
      const results = data.data.map((item: MetasoSearchResult, i: number) => ({
        index: i + 1,
        title: item.title || '',
        url: item.url || '',
        snippet: item.snippet || item.content || '',
      }))
      return JSON.stringify({ query, count: results.length, results })
    }

    // Return raw data if format is unexpected
    return JSON.stringify(data)
  } catch (err: any) {
    return JSON.stringify({ error: `联网搜索失败: ${err.message}` })
  }
}

/**
 * Read and extract content from a web page using Metaso AI Reader API.
 *
 * @param url - The URL to read
 * @returns Formatted page content string
 */
export async function webReader(url: string): Promise<string> {
  const apiKey = configManager.getSettings().metasoApiKey
  if (!apiKey) {
    return JSON.stringify({ error: '未配置秘塔 AI 搜索 API Key。请在设置中填写。' })
  }

  try {
    const response = await fetch(READER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const data = await response.json()

    // Format for AI consumption
    if (data.data) {
      const page = data.data
      return JSON.stringify({
        url,
        title: page.title || '',
        content: page.content || page.markdown || page.text || '',
      })
    }

    return JSON.stringify(data)
  } catch (err: any) {
    return JSON.stringify({ error: `网页读取失败: ${err.message}` })
  }
}

/**
 * Check if web search is configured (API key is set).
 */
export function isWebSearchAvailable(): boolean {
  const apiKey = configManager.getSettings().metasoApiKey
  return !!apiKey && apiKey.length > 0
}
