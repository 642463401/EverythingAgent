import Store from 'electron-store'
import type { AppConfig, ModelConfig, AppSettings, Conversation, Memory, SubAgentState } from '../src/types/config'
import { app } from 'electron'
import path from 'node:path'

/** Default application settings */
const defaultSettings: AppSettings = {
  globalShortcut: 'Alt+Space',
  hideOnBlur: false,
  theme: 'dark',
  language: 'zh-CN',
  projectsPath: path.join(app.getPath('home'), 'EverythingAgent', 'Projects'),
  metasoApiKey: '',
  dashscopeApiKey: '',
  amapApiKey: '',
  enabledMcpServices: [],
  customMcpServices: [],
}

/** Default config */
const defaultConfig: AppConfig = {
  models: [],
  settings: defaultSettings,
}

/** Schema for electron-store validation */
const schema = {
  models: {
    type: 'array' as const,
    items: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const },
        providerType: {
          type: 'string' as const,
          enum: ['openai-compatible', 'aliyun', 'dashscope', 'anthropic', 'google', 'zhipu'],
        },
        name: { type: 'string' as const },
        baseUrl: { type: 'string' as const },
        apiKey: { type: 'string' as const },
        modelName: { type: 'string' as const },
        isActive: { type: 'boolean' as const },
      },
      required: ['id', 'providerType', 'name', 'baseUrl', 'apiKey', 'modelName', 'isActive'],
    },
    default: [] as ModelConfig[],
  },
  settings: {
    type: 'object' as const,
    properties: {
      globalShortcut: { type: 'string' as const, default: 'Alt+Space' },
      hideOnBlur: { type: 'boolean' as const, default: false },
      theme: { type: 'string' as const, enum: ['dark', 'light'], default: 'dark' },
      language: { type: 'string' as const, enum: ['zh-CN', 'en-US'], default: 'zh-CN' },
      projectsPath: { type: 'string' as const },
      metasoApiKey: { type: 'string' as const, default: '' },
      dashscopeApiKey: { type: 'string' as const, default: '' },
      amapApiKey: { type: 'string' as const, default: '' },
      enabledMcpServices: {
        type: 'array' as const,
        items: { type: 'string' as const },
        default: [] as string[],
      },
      customMcpServices: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const },
            name: { type: 'string' as const },
            endpoint: { type: 'string' as const },
          },
          required: ['id', 'name', 'endpoint'],
        },
        default: [],
      },
    },
    default: defaultSettings,
  },
}

class ConfigManager {
  private store: Store<AppConfig>

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'everything-agent-config',
      defaults: defaultConfig,
      schema,
      encryptionKey: 'everything-agent-enc-key', // Basic encryption for API keys
    })
  }

  // ==================== Models ====================

  getModels(): ModelConfig[] {
    return this.store.get('models', [])
  }

  setModels(models: ModelConfig[]): void {
    this.store.set('models', models)
  }

  addModel(model: ModelConfig): void {
    const models = this.getModels()
    models.push(model)
    this.setModels(models)
  }

  updateModel(id: string, updates: Partial<ModelConfig>): void {
    const models = this.getModels()
    const index = models.findIndex((m) => m.id === id)
    if (index !== -1) {
      models[index] = { ...models[index], ...updates }
      this.setModels(models)
    }
  }

  deleteModel(id: string): void {
    const models = this.getModels().filter((m) => m.id !== id)
    this.setModels(models)
  }

  getActiveModel(): ModelConfig | undefined {
    return this.getModels().find((m) => m.isActive)
  }

  setActiveModel(id: string): void {
    const models = this.getModels().map((m) => ({
      ...m,
      isActive: m.id === id,
    }))
    this.setModels(models)
  }

  // ==================== Settings ====================

  getSettings(): AppSettings {
    return this.store.get('settings', defaultSettings)
  }

  setSettings(settings: AppSettings): void {
    this.store.set('settings', settings)
  }

  updateSettings(updates: Partial<AppSettings>): void {
    const current = this.getSettings()
    this.setSettings({ ...current, ...updates })
  }

  // ==================== Full Config ====================

  getConfig(): AppConfig {
    return {
      models: this.getModels(),
      settings: this.getSettings(),
    }
  }

  /** Reset all config to defaults */
  reset(): void {
    this.store.clear()
  }

  /** Get the store file path (useful for debugging) */
  getStorePath(): string {
    return this.store.path
  }
}

// ==================== Conversation Storage ====================

const MAX_CONVERSATIONS = 50

class ConversationManager {
  private store: Store<{ conversations: Conversation[] }>

  constructor() {
    this.store = new Store<{ conversations: Conversation[] }>({
      name: 'everything-agent-conversations',
      defaults: { conversations: [] },
    })
  }

  getConversations(): Conversation[] {
    return this.store.get('conversations', [])
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  saveConversation(conv: Conversation): void {
    const conversations = this.store.get('conversations', [])
    const index = conversations.findIndex((c) => c.id === conv.id)
    if (index !== -1) {
      conversations[index] = conv
    } else {
      conversations.unshift(conv)
    }
    // Keep only the most recent conversations
    this.store.set('conversations', conversations.slice(0, MAX_CONVERSATIONS))
  }

  deleteConversation(id: string): void {
    const conversations = this.store.get('conversations', []).filter((c) => c.id !== id)
    this.store.set('conversations', conversations)
  }
}

export const configManager = new ConfigManager()
export const conversationManager = new ConversationManager()

// ==================== Memory Storage ====================

const MAX_MEMORIES = 200

class MemoryManager {
  private store: Store<{ memories: Memory[] }>

  constructor() {
    this.store = new Store<{ memories: Memory[] }>({
      name: 'everything-agent-memories',
      defaults: { memories: [] },
    })
  }

  getMemories(): Memory[] {
    return this.store.get('memories', [])
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  addOrUpdateMemories(newMemories: { content: string; category: Memory['category']; updateId?: string }[]): void {
    const memories = this.store.get('memories', [])

    for (const item of newMemories) {
      if (item.updateId) {
        // Update existing memory
        const idx = memories.findIndex((m) => m.id === item.updateId)
        if (idx !== -1) {
          memories[idx].content = item.content
          memories[idx].category = item.category
          memories[idx].updatedAt = Date.now()
          continue
        }
      }
      // Add new memory
      memories.push({
        id: crypto.randomUUID(),
        content: item.content,
        category: item.category,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    // Keep only the most recent memories
    const sorted = memories.sort((a, b) => b.updatedAt - a.updatedAt)
    this.store.set('memories', sorted.slice(0, MAX_MEMORIES))
  }

  deleteMemory(id: string): void {
    const memories = this.store.get('memories', []).filter((m) => m.id !== id)
    this.store.set('memories', memories)
  }

  clearMemories(): void {
    this.store.set('memories', [])
  }
}

export const memoryManager = new MemoryManager()

// ==================== SubAgent Storage ====================

const MAX_SUBAGENTS = 20
const SUBAGENT_MAX_AGE_DAYS = 7

class SubAgentManager {
  private store: Store<{ subAgents: SubAgentState[] }>

  constructor() {
    this.store = new Store<{ subAgents: SubAgentState[] }>({
      name: 'everything-agent-subagents',
      defaults: { subAgents: [] },
    })
  }

  getAgents(): SubAgentState[] {
    return this.store.get('subAgents', [])
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getAgent(id: string): SubAgentState | undefined {
    return this.store.get('subAgents', []).find((a) => a.id === id)
  }

  saveAgent(agent: SubAgentState): void {
    const agents = this.store.get('subAgents', [])
    const index = agents.findIndex((a) => a.id === agent.id)
    if (index !== -1) {
      agents[index] = agent
    } else {
      agents.unshift(agent)
    }
    // Keep only the most recent sub-agents
    this.store.set('subAgents', agents.slice(0, MAX_SUBAGENTS))
  }

  deleteAgent(id: string): void {
    const agents = this.store.get('subAgents', []).filter((a) => a.id !== id)
    this.store.set('subAgents', agents)
  }

  cleanupOldAgents(): void {
    const cutoff = Date.now() - SUBAGENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    const agents = this.store.get('subAgents', []).filter((a) => a.updatedAt > cutoff)
    this.store.set('subAgents', agents)
  }
}

export const subAgentManager = new SubAgentManager()

export default configManager
