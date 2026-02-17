import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { configManager } from '../configManager'

// ---- MCP Server Registry ----

export interface McpServerConfig {
  id: string
  name: string
  description: string
  endpoint: string
  transport: 'streamable-http' | 'sse'
  icon: string
}

/** All preset MCP servers (exported for settings UI) */
export const MCP_SERVER_PRESETS: McpServerConfig[] = [
  {
    id: 'weather',
    name: '墨迹天气查询',
    description: '实时天气、天气预报',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/market-cmapi013828/mcp',
    transport: 'streamable-http',
    icon: '🌤️',
  },
  {
    id: 'railway',
    name: '12306火车票查询',
    description: '车次、余票、价格',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/china-railway/sse',
    transport: 'sse',
    icon: '🚄',
  },
  {
    id: 'code-interpreter',
    name: '代码解释器',
    description: '在线代码执行',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/code_interpreter_mcp/mcp',
    transport: 'streamable-http',
    icon: '💻',
  },
  {
    id: 'aviation',
    name: '飞常准机票查询',
    description: '航班、机票信息',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/Aviation/sse',
    transport: 'sse',
    icon: '✈️',
  },
  {
    id: 'doc-convert',
    name: 'md转文档',
    description: 'Markdown 转 Word/PDF 等格式',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/docMind/sse',
    transport: 'sse',
    icon: '📄',
  },
  {
    id: 'amap',
    name: '高德地图',
    description: '地图、导航、POI搜索',
    endpoint: 'https://mcp.amap.com/sse?key=',
    transport: 'sse',
    icon: '🗺️',
  },
  {
    id: 'ai-ocr',
    name: 'AIOCR',
    description: '多格式文档识别，支持PDF/Office/图片等',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/ai-ocr/sse',
    transport: 'sse',
    icon: '🔍',
  },
  {
    id: 'how-to-cook',
    name: '今天吃什么',
    description: '菜谱查询、做法推荐',
    endpoint: 'https://dashscope.aliyuncs.com/api/v1/mcps/how-to-cook/sse',
    transport: 'sse',
    icon: '🍳',
  },
]

// ---- Connection State ----

interface McpConnection {
  config: McpServerConfig
  client: Client
  tools: any[]
  connected: boolean
}

class McpServiceManager {
  private connections = new Map<string, McpConnection>()
  private toolToServer = new Map<string, string>()
  private initialized = false

  /** Check if DashScope API key is configured */
  isDashScopeConfigured(): boolean {
    const apiKey = configManager.getSettings().dashscopeApiKey
    return !!apiKey && apiKey.trim().length > 0
  }

  /** Initialize only user-enabled MCP connections */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const settings = configManager.getSettings()
    const apiKey = settings.dashscopeApiKey
    const amapKey = settings.amapApiKey
    const enabledIds = settings.enabledMcpServices || []
    const customServices = settings.customMcpServices || []

    if (enabledIds.length === 0 && customServices.length === 0) {
      console.log('[MCP] No MCP services enabled, skipping')
      this.initialized = true
      return
    }

    // Connect preset services
    const hasDashScope = !!apiKey && apiKey.trim().length > 0
    const hasAmap = !!amapKey && amapKey.trim().length > 0

    const serversToConnect = MCP_SERVER_PRESETS.filter((s) => enabledIds.includes(s.id))

    for (const serverConfig of serversToConnect) {
      try {
        if (serverConfig.id === 'amap') {
          if (!hasAmap) {
            console.log('[MCP] Amap API Key not configured, skipping amap')
            continue
          }
          await this.connectServer(serverConfig, amapKey, true)
        } else {
          if (!hasDashScope) {
            console.log(`[MCP] DashScope API Key not configured, skipping ${serverConfig.name}`)
            continue
          }
          await this.connectServer(serverConfig, apiKey)
        }
      } catch (err: any) {
        console.error(`[MCP] Failed to connect to ${serverConfig.name}: ${err.message}`)
      }
    }

    // Connect custom user services (SSE, no auth header)
    for (const custom of customServices) {
      try {
        const customConfig: McpServerConfig = {
          id: `custom-${custom.id}`,
          name: custom.name,
          description: '自定义 MCP 服务',
          endpoint: custom.endpoint,
          transport: 'sse',
          icon: '🔌',
        }
        await this.connectServer(customConfig, '', true)
      } catch (err: any) {
        console.error(`[MCP] Failed to connect to custom service ${custom.name}: ${err.message}`)
      }
    }

    this.initialized = true
    const totalServers = serversToConnect.length + customServices.length
    console.log(
      `[MCP] Initialized. Connected: ${this.connections.size}/${totalServers}, Total tools: ${this.toolToServer.size}`
    )
  }

  /** Disconnect all servers */
  async shutdown(): Promise<void> {
    for (const [, conn] of this.connections) {
      try {
        await conn.client.close()
      } catch {
        /* ignore */
      }
    }
    this.connections.clear()
    this.toolToServer.clear()
    this.initialized = false
  }

  /** Reinitialize (after API key change) */
  async reinitialize(): Promise<void> {
    await this.shutdown()
    await this.initialize()
  }

  /** Get all MCP tools in OpenAI function-calling format */
  getToolDefinitions(): any[] {
    const tools: any[] = []
    for (const [, conn] of this.connections) {
      if (!conn.connected) continue
      for (const mcpTool of conn.tools) {
        tools.push(this.convertToOpenAITool(mcpTool))
      }
    }
    return tools
  }

  /** Check if a tool name belongs to MCP */
  isMcpTool(toolName: string): boolean {
    return this.toolToServer.has(toolName)
  }

  /** Execute an MCP tool call */
  async executeTool(toolName: string, argsJson: string): Promise<string> {
    const serverId = this.toolToServer.get(toolName)
    if (!serverId) {
      return JSON.stringify({ error: `MCP tool not found: ${toolName}` })
    }

    const conn = this.connections.get(serverId)
    if (!conn || !conn.connected) {
      return JSON.stringify({ error: `MCP server disconnected: ${serverId}` })
    }

    try {
      const args = JSON.parse(argsJson)
      const result = await conn.client.callTool({ name: toolName, arguments: args })

      // MCP callTool returns { content: Array<{type, text}> }
      if (result.content && Array.isArray(result.content)) {
        const textParts = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
        return textParts.join('\n') || JSON.stringify(result)
      }

      return JSON.stringify(result)
    } catch (err: any) {
      console.error(`[MCP] Tool execution error (${toolName}):`, err)
      return JSON.stringify({ error: `MCP工具调用失败: ${err.message}` })
    }
  }

  /** Get tool metadata for UI display */
  getToolMeta(): Record<string, { icon: string; label: string }> {
    const meta: Record<string, { icon: string; label: string }> = {}
    for (const [, conn] of this.connections) {
      for (const mcpTool of conn.tools) {
        const serverMeta = this.getServerMeta(conn.config.id)
        meta[mcpTool.name] = serverMeta
      }
    }
    return meta
  }

  // ---- Private methods ----

  private async connectServer(config: McpServerConfig, apiKey: string, keyInUrl = false): Promise<void> {
    let transport: any
    const endpoint = keyInUrl ? `${config.endpoint}${apiKey}` : config.endpoint

    if (config.transport === 'streamable-http') {
      transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: keyInUrl ? {} : {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      })
    } else {
      transport = new SSEClientTransport(new URL(endpoint), {
        requestInit: keyInUrl ? {} : {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        eventSourceInit: keyInUrl ? undefined : {
          fetch: (url: any, init: any) =>
            fetch(url, {
              ...init,
              headers: {
                ...init?.headers,
                Authorization: `Bearer ${apiKey}`,
              },
            }),
        },
      })
    }

    const client = new Client({ name: 'EverythingAgent', version: '1.0.0' }, { capabilities: {} })

    // Connect with timeout
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000)),
    ])

    // Fetch available tools
    const toolsResult = await client.listTools()
    const tools = toolsResult.tools || []

    // Register tool -> server mapping
    for (const tool of tools) {
      this.toolToServer.set(tool.name, config.id)
    }

    this.connections.set(config.id, {
      config,
      client,
      tools,
      connected: true,
    })

    console.log(`[MCP] Connected to ${config.name}: ${tools.length} tools available`)
  }

  /** Convert MCP tool schema to OpenAI function-calling format */
  private convertToOpenAITool(mcpTool: any): any {
    return {
      type: 'function' as const,
      function: {
        name: mcpTool.name,
        description: mcpTool.description || '',
        parameters: mcpTool.inputSchema || { type: 'object', properties: {} },
      },
    }
  }

  /** Get display metadata per server */
  private getServerMeta(serverId: string): { icon: string; label: string } {
    const preset = MCP_SERVER_PRESETS.find((s) => s.id === serverId)
    if (preset) {
      return { icon: preset.icon, label: preset.name }
    }
    return { icon: '🔌', label: 'MCP工具' }
  }
}

export const mcpService = new McpServiceManager()
