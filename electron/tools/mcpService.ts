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
  private sanitizedNameMap = new Map<string, string>() // sanitized -> original
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
    this.sanitizedNameMap.clear()
    this.initialized = false
  }

  /** Reinitialize (after API key change) */
  async reinitialize(): Promise<void> {
    await this.shutdown()
    await this.initialize()
  }

  /** Get all MCP tools in OpenAI function-calling format (deduplicated) */
  getToolDefinitions(): any[] {
    const tools: any[] = []
    const seenNames = new Set<string>()
    for (const [, conn] of this.connections) {
      if (!conn.connected) continue
      for (const mcpTool of conn.tools) {
        const tool = this.convertToOpenAITool(mcpTool)
        let name = tool.function.name
        // Deduplicate: if name already used, append a counter suffix
        if (seenNames.has(name)) {
          let suffix = 2
          while (seenNames.has(`${name}_${suffix}`)) suffix++
          const newName = `${name}_${suffix}`
          this.sanitizedNameMap.set(newName, mcpTool.name)
          tool.function.name = newName
          name = newName
        }
        seenNames.add(name)
        tools.push(tool)
      }
    }
    return tools
  }

  /** Check if a tool name belongs to MCP */
  isMcpTool(toolName: string): boolean {
    const originalName = this.sanitizedNameMap.get(toolName) || toolName
    return this.toolToServer.has(originalName)
  }

  /** Execute an MCP tool call */
  async executeTool(toolName: string, argsJson: string): Promise<string> {
    const originalName = this.sanitizedNameMap.get(toolName) || toolName
    const serverId = this.toolToServer.get(originalName)
    if (!serverId) {
      return JSON.stringify({ error: `MCP tool not found: ${toolName}` })
    }

    const conn = this.connections.get(serverId)
    if (!conn || !conn.connected) {
      return JSON.stringify({ error: `MCP server disconnected: ${serverId}` })
    }

    try {
      const args = JSON.parse(argsJson)
      const result = await conn.client.callTool({ name: originalName, arguments: args })

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
        const sanitizedName = this.sanitizeToolName(mcpTool.name)
        meta[sanitizedName] = serverMeta
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
    const sanitizedName = this.sanitizeToolName(mcpTool.name)
    if (sanitizedName !== mcpTool.name) {
      this.sanitizedNameMap.set(sanitizedName, mcpTool.name)
    }

    // Ensure parameters has required fields for Gemini compatibility
    const parameters = mcpTool.inputSchema || { type: 'object', properties: {} }
    if (!parameters.type) {
      parameters.type = 'object'
    }
    if (!parameters.properties) {
      parameters.properties = {}
    }

    return {
      type: 'function' as const,
      function: {
        name: sanitizedName,
        description: mcpTool.description || sanitizedName,
        parameters,
      },
    }
  }

  /**
   * Sanitize tool name for providers with strict naming rules (e.g. Google Gemini).
   * Allowed: a-z, A-Z, 0-9, underscore. Must start with letter or underscore.
   */
  private sanitizeToolName(name: string): string {
    if (!name) return `mcp_tool_${Date.now()}`
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_')
    // Collapse consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_')
    // Trim trailing underscores
    sanitized = sanitized.replace(/_+$/, '')
    // Trim leading underscores (except one)
    sanitized = sanitized.replace(/^_+/, '_')
    // Ensure starts with letter or underscore
    if (sanitized && !/^[a-zA-Z_]/.test(sanitized)) {
      sanitized = 'mcp_' + sanitized
    }
    // Truncate to 64 chars
    if (sanitized.length > 64) {
      sanitized = sanitized.slice(0, 64)
    }
    // If still empty or just underscore, generate a unique name
    if (!sanitized || sanitized === '_') {
      sanitized = `mcp_tool_${Date.now()}`
    }
    return sanitized
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
