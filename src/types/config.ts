/** Model provider type */
export type ProviderType = 'openai-compatible' | 'aliyun' | 'dashscope' | 'anthropic' | 'google'

/** Model configuration interface */
export interface ModelConfig {
  id: string
  providerType: ProviderType
  name: string
  baseUrl: string
  apiKey: string
  modelName: string
  isActive: boolean
}

/** Custom MCP service configured by user */
export interface CustomMcpService {
  id: string
  name: string
  endpoint: string
}

/** Application settings */
export interface AppSettings {
  globalShortcut: string
  hideOnBlur: boolean
  theme: 'dark' | 'light'
  language: 'zh-CN' | 'en-US'
  projectsPath: string
  metasoApiKey: string  // 秘塔 AI 搜索 API Key
  dashscopeApiKey: string  // DashScope API Key (MCP 服务)
  amapApiKey: string  // 高德地图 API Key
  enabledMcpServices: string[]  // 用户启用的 MCP 服务 ID 列表
  customMcpServices: CustomMcpService[]  // 用户自定义 MCP 服务
}

/** Full application config stored in electron-store */
export interface AppConfig {
  models: ModelConfig[]
  settings: AppSettings
}

/** Chat message */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

/** Conversation (for history) */
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

/** AI Memory entry */
export interface Memory {
  id: string
  content: string
  category: 'preference' | 'fact' | 'instruction' | 'context'
  createdAt: number
  updatedAt: number
}

/** Chat request message (used internally by chat service and sub-agents) */
export interface ChatRequestMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: any[]
  tool_call_id?: string
}

/** SubAgent state for cross-session persistence */
export interface SubAgentState {
  id: string
  name: string
  messages: ChatRequestMessage[]
  status: 'running' | 'completed' | 'failed'
  result: string | null
  filesAffected: string[]
  createdAt: number
  updatedAt: number
}

/** SubAgent execution result returned to main agent */
export interface SubAgentResult {
  agentId: string
  success: boolean
  summary: string
  filesAffected: string[]
  error?: string
}

/** Everything Search result */
export interface SearchResult {
  fullPath: string
  fileName: string
  directory: string
  isDirectory: boolean
}

/** Everything Search options */
export interface SearchOptions {
  query: string
  maxResults?: number
  matchPath?: boolean
  matchCase?: boolean
  regex?: boolean
  foldersOnly?: boolean
  filesOnly?: boolean
  sortByPath?: boolean
}

/** IPC Channel names */
export const IPC_CHANNELS = {
  // Config
  GET_CONFIG: 'config:get',
  SET_CONFIG: 'config:set',
  GET_MODELS: 'config:get-models',
  SET_MODELS: 'config:set-models',
  GET_SETTINGS: 'config:get-settings',
  SET_SETTINGS: 'config:set-settings',

  // Window
  TOGGLE_WINDOW: 'window:toggle',
  HIDE_WINDOW: 'window:hide',
  SHOW_SETTINGS: 'window:show-settings',
  OPEN_DEVTOOLS: 'window:open-devtools',
  RESIZE_WINDOW: 'window:resize',
  SET_WINDOW_BOUNDS: 'window:set-bounds',
  GET_WINDOW_BOUNDS: 'window:get-bounds',
  MOVE_WINDOW: 'window:move',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_STREAM_CHUNK: 'chat:stream-chunk',
  CHAT_STREAM_END: 'chat:stream-end',
  CHAT_STREAM_ERROR: 'chat:stream-error',
  CHAT_ABORT: 'chat:abort',

  // Conversations
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_SAVE: 'conversations:save',
  CONVERSATIONS_DELETE: 'conversations:delete',

  // Memory
  MEMORY_LIST: 'memory:list',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_CLEAR: 'memory:clear',

  // App
  GET_APP_PATH: 'app:get-path',
  OPEN_EXTERNAL: 'app:open-external',

  // Everything Search
  EVERYTHING_SEARCH: 'everything:search',
  EVERYTHING_AVAILABLE: 'everything:available',
  EVERYTHING_OPEN: 'everything:open',
  EVERYTHING_REVEAL: 'everything:reveal',
} as const
