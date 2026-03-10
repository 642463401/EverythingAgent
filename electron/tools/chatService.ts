/**
 * AI Chat Service with Tool Calling support.
 * The AI can autonomously invoke Everything search via OpenAI-compatible function calling.
 */

import { configManager, memoryManager, skillManager } from '../configManager'
import { searchEverything } from './everythingSearch'
import { webSearch, webReader, isWebSearchAvailable } from './webSearch'
import { readFile, writeFile, editFile, listDirectory, analyzeData } from './fileTools'
import { runCommand } from './commandRunner'
import { fileManage, openApplication, openFile, desktopControl } from './fileManager'
import { mcpService } from './mcpService'
import { lookupCity } from './cityLookup'
import { executeSkill } from './skillService'
import { getAdapter } from './adapters'
import type { ProviderAdapter } from './adapters'
import type { ModelConfig, ChatRequestMessage } from '../../src/types/config'

// Lazy import to avoid circular dependency (subAgentService imports from chatService)
let _subAgentService: typeof import('./subAgentService')['subAgentService'] | null = null
async function getSubAgentService() {
  if (!_subAgentService) {
    const mod = await import('./subAgentService')
    _subAgentService = mod.subAgentService
  }
  return _subAgentService
}

export type { ChatRequestMessage }

export interface ChatStreamCallbacks {
  onChunk: (content: string) => void
  onEnd: (fullContent: string) => void
  onError: (error: string) => void
}

export interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

const activeRequests = new Map<string, AbortController>()

const SYSTEM_PROMPT = `你是 EverythingAgent，一个强大的 Windows 桌面 AI 助手。

你的角色是「任务调度中心」：你负责理解用户意图、规划任务、将任务委派给执行助手（SubAgent），然后根据执行结果回复用户。

核心架构（必须严格遵守）：
- 你自己不直接执行任何操作（不读文件、不写文件、不搜索、不运行命令）。
- 所有需要执行的操作，必须通过 delegate_task 工具委派给执行助手。
- 每个执行助手在全新的隔离上下文中运行，不受对话历史影响，确保每次都会真正执行操作。
- 执行助手完成任务后会返回结构化结果，你根据结果回复用户。

delegate_task 使用方法：
- task（必填）：清晰具体的任务描述，包含所有必要信息（完整文件路径、具体内容、操作步骤等）。执行助手没有对话历史，所以任务描述必须自包含。
- context（可选）：提供给执行助手的上下文信息，如之前任务的结果、相关文件内容摘要等。

任务规划策略：
1. 简单任务（单步操作）：直接一次 delegate_task 即可。
   例如：搜索文件、读取一个文件、打开应用、创建单个文件。
2. 复杂任务（多步操作）：将任务拆解为多个独立的子任务，依次委派给执行助手。
   例如："分析项目并生成报告" → 子任务1：浏览项目结构 → 子任务2：读取关键文件 → 子任务3：生成报告。
3. 有依赖的任务：前一个子任务的结果可以作为 context 传给下一个子任务。
4. 独立任务：可以同时委派多个不相关的子任务。

任务描述编写要求（极其重要）：
- 文件路径必须使用绝对路径（如 C:\\Users\\user\\Desktop\\file.txt）。
- 创建文件时，必须在 task 描述中写明完整的文件内容，不得省略或用占位符。
- 修改文件时，必须说明要修改哪个文件、修改什么内容。
- 执行助手没有对话上下文，所以不要用"之前的文件"、"上面提到的"等模糊引用。

执行助手可用的工具：
- everything_search：本地文件搜索（Everything引擎）
- web_search / web_reader：联网搜索和网页读取
- read_file：读取文件内容（支持文本、代码、PDF等）
- write_file：创建/写入文件
- edit_file：局部修改文件内容
- list_directory：列出目录内容
- analyze_data：分析数据文件（CSV/JSON）
- run_command：执行系统命令（运行代码、安装依赖、git等）
- file_manage：文件管理（复制/移动/重命名/删除）
- open_application：打开应用程序
- open_file：打开文件
- desktop_control：桌面控制

回复策略：
- 纯知识问答（不需要操作）：直接回答，无需委派。
- 需要操作的任务：先委派执行，拿到结果后再回复用户。
- 多步任务：简要告知用户任务计划，然后依次委派，最后汇总结果。
- 执行助手返回失败时：分析原因，可以调整任务描述后重新委派。

你可以根据用户的需求自动切换语调风格：
- 生活相关：友好亲切
- 工作相关：专业严谨
- 编程相关：技术精确
- 文件操作：高效直接

极其重要的规则：
- 收到执行助手结果后，必须对照用户原始请求检查是否全部完成。
- 多步任务必须逐一委派直到全部完成，不要因已完成部分任务就停止。
- 子任务失败时应分析原因并重试或调整方案。`

export function buildTools() {
  const tools: any[] = [
    {
      type: 'function' as const,
      function: {
        name: 'everything_search',
        description: '在用户的 Windows 电脑上搜索本地文件和文件夹。使用 Everything 搜索引擎，速度极快。支持通配符 * 和 ?',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，支持通配符。例如: "*.pdf", "project readme", "test.py"',
            },
            maxResults: {
              type: 'number',
              description: '最大返回结果数，默认20',
            },
            foldersOnly: {
              type: 'boolean',
              description: '是否只搜索文件夹',
            },
            filesOnly: {
              type: 'boolean',
              description: '是否只搜索文件',
            },
          },
          required: ['query'],
        },
      },
    },
  ]

  // Only add web tools if API key is configured
  if (isWebSearchAvailable()) {
    tools.push({
      type: 'function' as const,
      function: {
        name: 'web_search',
        description: '联网搜索实时信息。使用秘塔 AI 搜索引擎，可搜索网页、学术论文、文档等。当用户需要最新资讯、新闻、技术文档、百科知识等实时信息时使用。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，例如: "最新AI新闻", "React 19 新特性", "量子计算进展"',
            },
            scope: {
              type: 'string',
              enum: ['webpage', 'scholar', 'document', 'image', 'video', 'podcast'],
              description: '搜索范围：webpage(网页)、scholar(学术)、document(文库)、image(图片)、video(视频)、podcast(播客)。默认 webpage',
            },
            size: {
              type: 'number',
              description: '返回结果数量，1-20，默认10',
            },
          },
          required: ['query'],
        },
      },
    })

    tools.push({
      type: 'function' as const,
      function: {
        name: 'web_reader',
        description: '读取并提取指定网页的内容。输入一个 URL，返回该网页的标题和正文内容（Markdown 格式）。适合用于：阅读文章全文、提取页面信息、总结网页内容。可配合 web_search 使用：先搜索再读取详情。',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: '要读取的网页 URL，例如: "https://example.com/article"',
            },
          },
          required: ['url'],
        },
      },
    })
  }

  // ==================== File Tools (always available) ====================
  tools.push({
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: '读取本地文件的内容。支持文本文件、代码文件、配置文件、CSV、JSON 等，也支持 PDF 文件（自动提取文本内容）。文本文件最大支持 512KB，PDF 最大支持 20MB。注意：不支持读取图片、音视频、压缩包等二进制文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的完整路径或相对路径，例如: "C:\\Users\\user\\report.csv", "D:\\project\\config.json"',
          },
        },
        required: ['path'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: '创建或写入文本文件。适用于生成 Markdown 文档、代码文件、配置文件等。支持 .md/.txt/.csv/.json/.html/.py/.js 等文本格式。生成文档时优先使用 Markdown 格式直接写入。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件绝对路径。例如: "C:\\Users\\user\\Desktop\\report.md", "D:\\output\\script.py"',
          },
          content: {
            type: 'string',
            description: '要写入文件的文本内容',
          },
        },
        required: ['path', 'content'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: '局部修改已有文件内容。通过查找并替换指定文本来修改文件，无需重写整个文件。适用于修改文档中的某段文字、更新代码中的某行、修正错别字等。old_string 必须在文件中唯一匹配。重要：使用前必须先用 read_file 读取文件的当前内容，确保 old_string 与文件中的实际文本完全一致。不要依赖对话历史中的旧内容。如果匹配失败，先 read_file 重新读取再重试。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径',
          },
          old_string: {
            type: 'string',
            description: '要被替换的原始文本（必须与文件中的内容完全一致，包括空格和换行）',
          },
          new_string: {
            type: 'string',
            description: '替换后的新文本',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: '列出指定目录下的文件和文件夹。返回文件名、类型、大小等信息。适合用于浏览目录结构、查看文件列表。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录路径，例如: "C:\\Users\\user\\Documents", "D:\\project"',
          },
        },
        required: ['path'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'analyze_data',
      description: '分析数据文件（CSV、TSV、JSON）。返回：列信息、数据类型、统计摘要（最小值、最大值、平均值、中位数）、唯一值分布、数据预览。适合快速了解数据集的结构和特征。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '数据文件路径，支持 .csv、.tsv、.json 格式',
          },
        },
        required: ['path'],
      },
    },
  })

  // ==================== Command Runner (always available) ====================
  tools.push({
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: '在用户电脑上执行系统命令。可运行 Python/Node.js 等代码、安装依赖（pip install / npm install）、执行构建、git 操作、查看系统信息等。返回命令输出（stdout/stderr）和退出码。超时默认30秒。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的命令。例如: "python script.py", "pip install python-docx", "git status", "node -v"',
          },
          cwd: {
            type: 'string',
            description: '命令的工作目录（可选）。例如: "C:\\Users\\user\\project"。默认为用户主目录。',
          },
          timeout: {
            type: 'number',
            description: '超时时间（毫秒），默认30000（30秒），最大120000（120秒）。长时间运行的命令可适当增加。',
          },
        },
        required: ['command'],
      },
    },
  })

  // ==================== File Management Tools ====================
  tools.push({
    type: 'function' as const,
    function: {
      name: 'file_manage',
      description: '管理文件和文件夹：复制、移动、重命名、删除、创建文件夹。删除操作会将文件移至回收站（安全）。',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['copy', 'move', 'rename', 'delete', 'create_folder'],
            description: '操作类型：copy(复制), move(移动), rename(重命名), delete(删除到回收站), create_folder(创建文件夹)',
          },
          source: {
            type: 'string',
            description: '源文件/文件夹的绝对路径',
          },
          destination: {
            type: 'string',
            description: '目标路径（copy/move/rename 需要）。rename 时可以只提供新文件名。',
          },
        },
        required: ['operation', 'source'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'open_application',
      description: '通过名称打开已安装的应用程序。支持中英文应用名，如"微信"、"Chrome"、"VSCode"、"记事本"等。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '应用名称（中文或英文），例如: "微信", "Chrome", "VSCode", "记事本", "Excel"',
          },
        },
        required: ['name'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'open_file',
      description: '用默认程序或指定程序打开文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径',
          },
          application: {
            type: 'string',
            description: '（可选）指定用哪个程序打开，例如: "notepad", "code", "excel"',
          },
        },
        required: ['path'],
      },
    },
  })

  tools.push({
    type: 'function' as const,
    function: {
      name: 'desktop_control',
      description: '控制 Windows 桌面图标的显示和隐藏。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['hide_desktop_icons', 'show_desktop_icons', 'toggle_desktop_icons'],
            description: '操作：hide_desktop_icons(隐藏), show_desktop_icons(显示), toggle_desktop_icons(切换)',
          },
        },
        required: ['action'],
      },
    },
  })

  // ==================== City Lookup (for weather MCP) ====================
  tools.push({
    type: 'function' as const,
    function: {
      name: 'city_lookup',
      description: '查询城市ID。天气查询 MCP 工具需要城市ID（cityId）作为参数，使用此工具通过城市名称查找对应的城市ID。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '城市名称，例如: "北京", "上海", "深圳", "杭州"',
          },
          maxResults: {
            type: 'number',
            description: '最大返回结果数，默认10',
          },
        },
        required: ['query'],
      },
    },
  })

  // ==================== MCP Tools (dynamic, from connected MCP servers) ====================
  if (mcpService.isDashScopeConfigured()) {
    const builtinNames = new Set(tools.map((t: any) => t.function.name))
    const mcpTools = mcpService.getToolDefinitions()
    for (const mcpTool of mcpTools) {
      const name = mcpTool.function?.name
      if (name && !builtinNames.has(name)) {
        tools.push(mcpTool)
        builtinNames.add(name)
      }
    }
  }

  return tools
}

export function getActiveModel(): ModelConfig | null {
  const model = configManager.getActiveModel()
  if (!model) return null
  if (!model.baseUrl || !model.apiKey || !model.modelName) return null
  return model
}

export function buildChatUrl(baseUrl: string, providerType?: string, modelName?: string): string {
  const adapter = getAdapter(providerType)
  return adapter.buildUrl(baseUrl, modelName || '')
}

function buildMcpPromptSection(): string {
  if (!mcpService.isDashScopeConfigured()) return ''
  const mcpTools = mcpService.getToolDefinitions()
  if (mcpTools.length === 0) return ''
  return `\n\nMCP 扩展工具（已连接 ${mcpTools.length} 个工具）：
- 天气查询：查询实时天气、天气预报。注意：天气查询需要城市ID，请先用 city_lookup 工具通过城市名称查找城市ID，再调用天气 MCP 工具。
- 火车票查询：查询12306车次、余票、价格
- 机票查询：查询航班信息、机票价格
- 代码解释器：在线执行代码

当用户需要查询天气、火车票、机票或执行代码时，优先使用对应的 MCP 工具。`
}

function buildMemoryPromptSection(): string {
  const memories = memoryManager.getMemories()
  if (memories.length === 0) return ''
  const lines = memories.map((m) => `- ${m.content}`)
  return `\n\n用户记忆（来自之前的对话，请参考这些信息来个性化你的回复，不需要主动提及这些记忆，除非与当前话题相关）：
${lines.join('\n')}`
}

function buildSkillsPromptSection(): string {
  const skills = skillManager.getEnabledSkills()
  if (skills.length === 0) return ''
  const lines = skills.map((s: any) => {
    const tools = (s.tools || [])
    const toolsStr = tools.map((t: any) => typeof t === 'string' ? t : t.type).join(', ')
    return `- skill_${s.id}: ${s.name}${toolsStr ? ` [工具: ${toolsStr}]` : ''} — ${s.usageRule || s.description || ''}`
  })
  return `\n\n可用技能（执行助手可通过 skill_<id> 工具调用这些技能）：
${lines.join('\n')}`
}

/**
 * Build the tools available to AGENT (only delegate_task).
 * AGENT does not execute tasks directly — it delegates everything to SubAgents.
 */
function buildAgentTools(): any[] {
  const tools: any[] = [
    {
      type: 'function' as const,
      function: {
        name: 'delegate_task',
        description: '将任务委派给独立的执行助手。执行助手在全新的隔离上下文中运行，不受当前对话历史影响，确保每个操作都被真正执行。执行完成后返回结构化结果。',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: '要执行的任务描述，必须清晰具体且自包含，包含所有必要信息（完整文件路径、具体内容、操作步骤等）。执行助手没有对话历史，不要使用模糊引用。',
            },
            context: {
              type: 'string',
              description: '可选。提供给执行助手的上下文信息，如之前子任务的执行结果摘要、相关文件内容等。',
            },
          },
          required: ['task'],
        },
      },
    },
  ]
  return tools
}

/**
 * Parse a single streaming round. Returns accumulated content and tool calls.
 * Delegates to the provider adapter for format-specific request/response handling.
 */
export async function streamOneRound(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: ChatRequestMessage[],
  signal: AbortSignal,
  onContentChunk: (chunk: string) => void,
  adapter?: ProviderAdapter,
  tools?: any[],
): Promise<{ content: string; toolCalls: AccumulatedToolCall[] }> {
  const a = adapter || getAdapter()
  return a.streamRound(url, headers, model, messages, tools || buildTools(), signal, onContentChunk)
}

/**
 * Execute a tool call and return the result as a string.
 */
export async function executeTool(name: string, argsJson: string): Promise<string> {
  if (name === 'everything_search') {
    try {
      const args = JSON.parse(argsJson)
      const results = await searchEverything({
        query: args.query || '',
        maxResults: args.maxResults || 20,
        foldersOnly: args.foldersOnly || false,
        filesOnly: args.filesOnly || false,
      })

      if (results.length === 0) {
        return JSON.stringify({ message: '未找到匹配的文件', results: [] })
      }

      // Return simplified results
      const simplified = results.map((r) => ({
        name: r.fileName,
        path: r.fullPath,
        isDir: r.isDirectory,
      }))
      return JSON.stringify({ count: results.length, results: simplified })
    } catch (err: any) {
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'web_search' || name === 'metaso_search') {
    try {
      const args = JSON.parse(argsJson)
      const result = await webSearch(
        args.query || '',
        args.scope || 'webpage',
        args.size || 10,
      )
      return result
    } catch (err: any) {
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'web_reader' || name === 'metaso_reader') {
    try {
      const args = JSON.parse(argsJson)
      const result = await webReader(args.url || '')
      return result
    } catch (err: any) {
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'read_file') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] read_file:', args.path)
      const result = await readFile(args.path || args.file_path || args.filePath || '')
      console.log('[Tool] read_file result length:', result.length)
      return result
    } catch (err: any) {
      console.error('[Tool] read_file error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'write_file') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] write_file:', args.path)
      const result = await writeFile(args.path || args.file_path || args.filePath || '', args.content || '')
      console.log('[Tool] write_file result:', result)
      return result
    } catch (err: any) {
      console.error('[Tool] write_file error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'list_directory') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] list_directory:', args.path)
      const result = await listDirectory(args.path || args.dir_path || args.dirPath || '')
      return result
    } catch (err: any) {
      console.error('[Tool] list_directory error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'analyze_data') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] analyze_data:', args.path)
      const result = await analyzeData(args.path || args.file_path || args.filePath || '')
      return result
    } catch (err: any) {
      console.error('[Tool] analyze_data error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'run_command') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] run_command:', args.command, 'cwd:', args.cwd)
      const result = await runCommand(args.command || '', args.cwd, args.timeout)
      console.log('[Tool] run_command result length:', result.length)
      return result
    } catch (err: any) {
      console.error('[Tool] run_command error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  // ==================== New Tools ====================

  if (name === 'file_manage') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] file_manage:', args.operation, args.source)
      const result = await fileManage(args.operation || '', args.source || '', args.destination)
      return result
    } catch (err: any) {
      console.error('[Tool] file_manage error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'open_application') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] open_application:', args.name)
      const result = await openApplication(args.name || '')
      return result
    } catch (err: any) {
      console.error('[Tool] open_application error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'open_file') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] open_file:', args.path)
      const result = await openFile(args.path || '', args.application)
      return result
    } catch (err: any) {
      console.error('[Tool] open_file error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'desktop_control') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] desktop_control:', args.action)
      const result = await desktopControl(args.action || '')
      return result
    } catch (err: any) {
      console.error('[Tool] desktop_control error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'edit_file') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] edit_file:', args.path)
      const result = await editFile(args.path || '', args.old_string || '', args.new_string || '')
      console.log('[Tool] edit_file result:', result)
      return result
    } catch (err: any) {
      console.error('[Tool] edit_file error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  if (name === 'city_lookup') {
    try {
      const args = JSON.parse(argsJson)
      console.log('[Tool] city_lookup:', args.query)
      const result = lookupCity(args.query || '', args.maxResults || 10)
      return result
    } catch (err: any) {
      console.error('[Tool] city_lookup error:', err)
      return JSON.stringify({ error: err.message })
    }
  }

  // ==================== MCP Tools (dynamic routing) ====================
  if (mcpService.isMcpTool(name)) {
    try {
      console.log('[Tool] MCP:', name, argsJson.slice(0, 200))
      const result = await mcpService.executeTool(name, argsJson)
      return result
    } catch (err: any) {
      console.error('[Tool] MCP error:', err)
      return JSON.stringify({ error: `MCP工具调用失败: ${err.message}` })
    }
  }

  // ==================== Skill Tools (skill_<id> routing) ====================
  if (name.startsWith('skill_')) {
    try {
      const skillId = name.slice(6) // Remove 'skill_' prefix
      const args = JSON.parse(argsJson)
      console.log('[Tool] Skill:', skillId, argsJson.slice(0, 200))
      const result = await executeSkill(skillId, args.input || '')
      return JSON.stringify(result)
    } catch (err: any) {
      console.error('[Tool] Skill error:', err)
      return JSON.stringify({ error: `技能调用失败: ${err.message}` })
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` })
}

// ==================== Context Compression ====================

const COMPRESSION_THRESHOLD = 8
const MAX_TOOL_RESULT_LENGTH = 500

function compressToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_LENGTH) return content

  try {
    const parsed = JSON.parse(content)

    // File write/edit results: always preserve (small + critical for dedup)
    if (parsed.path && parsed.message) {
      return JSON.stringify({
        success: parsed.success,
        warning: parsed.warning,
        path: parsed.path,
        size: parsed.size,
        message: parsed.message,
      })
    }

    // File read results: keep path/size/lines, truncate content
    if (parsed.content && parsed.path && parsed.lines !== undefined) {
      return JSON.stringify({
        path: parsed.path,
        size: parsed.size,
        lines: parsed.lines,
        content: parsed.content.slice(0, 200) + `\n... [已压缩，原始${parsed.lines}行/${parsed.size}字节]`,
      })
    }

    // Search results: keep count + first few
    if (parsed.results && Array.isArray(parsed.results)) {
      return JSON.stringify({
        count: parsed.count || parsed.results.length,
        results: parsed.results.slice(0, 5),
        compressed: true,
      })
    }

    // Web reader results: truncate body
    if (parsed.title && (parsed.content || parsed.text)) {
      const text = parsed.content || parsed.text || ''
      return JSON.stringify({
        title: parsed.title,
        url: parsed.url,
        content: text.slice(0, 300) + `\n... [已压缩，原始${text.length}字符]`,
      })
    }

    // Directory listing: keep first few items
    if (parsed.items && Array.isArray(parsed.items)) {
      return JSON.stringify({
        path: parsed.path,
        totalEntries: parsed.totalEntries,
        items: parsed.items.slice(0, 10),
        compressed: true,
      })
    }

    // Command output: truncate stdout/stderr
    if (parsed.stdout !== undefined || parsed.exitCode !== undefined) {
      return JSON.stringify({
        exitCode: parsed.exitCode,
        stdout: (parsed.stdout || '').slice(0, 200) + (parsed.stdout?.length > 200 ? '... [已截断]' : ''),
        stderr: parsed.stderr?.slice(0, 100),
      })
    }

    // Generic: truncate JSON string
    const str = JSON.stringify(parsed)
    if (str.length > MAX_TOOL_RESULT_LENGTH) {
      return str.slice(0, MAX_TOOL_RESULT_LENGTH) + '... [已压缩]'
    }
    return str
  } catch {
    return content.slice(0, MAX_TOOL_RESULT_LENGTH) + '... [已压缩]'
  }
}

export function compressMessages(messages: ChatRequestMessage[]): void {
  if (messages.length <= COMPRESSION_THRESHOLD) return

  // Find start of most recent tool-calling round (keep it uncompressed)
  let lastToolRoundStart = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].tool_calls) {
      lastToolRoundStart = i
      break
    }
  }

  if (lastToolRoundStart <= 0) return

  // Compress all tool messages before the most recent round
  for (let i = 0; i < lastToolRoundStart; i++) {
    // Skip progress check messages (they will be replaced each round)
    if (messages[i].role === 'user' && typeof messages[i].content === 'string' && messages[i].content!.startsWith('[进度检查]')) {
      continue
    }
    if (messages[i].role === 'tool' && messages[i].content) {
      messages[i].content = compressToolResult(messages[i].content!)
    }
    // Also compress large tool_call arguments (e.g., write_file content) in old assistant messages
    if (messages[i].role === 'assistant' && messages[i].tool_calls) {
      for (const tc of messages[i].tool_calls!) {
        const fn = (tc as any).function || tc
        const fnName = fn.name || ''
        if ((fnName === 'write_file' || fnName === 'edit_file') && fn.arguments) {
          try {
            const args = JSON.parse(fn.arguments)
            if (args.content && args.content.length > 200) {
              args.content = args.content.slice(0, 100) + `... [内容已压缩，原始${args.content.length}字符]`
              fn.arguments = JSON.stringify(args)
            }
            if (args.old_string && args.old_string.length > 200) {
              args.old_string = args.old_string.slice(0, 100) + '... [已压缩]'
              fn.arguments = JSON.stringify(args)
            }
            if (args.new_string && args.new_string.length > 200) {
              args.new_string = args.new_string.slice(0, 100) + '... [已压缩]'
              fn.arguments = JSON.stringify(args)
            }
          } catch { /* ignore parse errors */ }
        }
      }
    }
  }
}

/**
 * Extract memories from a completed conversation (async, non-blocking).
 * Sends a separate non-streaming request to the AI to identify key facts.
 */
async function extractMemories(
  adapter: ProviderAdapter,
  url: string,
  headers: Record<string, string>,
  modelName: string,
  conversationMessages: ChatRequestMessage[],
): Promise<void> {
  try {
    // Build a compact conversation summary (only user + assistant text, skip tool details)
    const dialogParts: string[] = []
    for (const msg of conversationMessages) {
      if (msg.role === 'user' && msg.content) {
        dialogParts.push(`用户: ${msg.content}`)
      } else if (msg.role === 'assistant' && msg.content) {
        // Strip tool status lines (emoji lines)
        const cleaned = msg.content.split('\n').filter((l) => !l.match(/^[\p{Emoji}]\s*正在/u)).join('\n').trim()
        if (cleaned) dialogParts.push(`助手: ${cleaned}`)
      }
    }

    // Skip extraction if conversation is too short
    if (dialogParts.length < 2) return

    const existingMemories = memoryManager.getMemories()
    const existingList = existingMemories.length > 0
      ? existingMemories.map((m) => `[${m.id}] ${m.content}`).join('\n')
      : '（无）'

    const extractionPrompt = `你是一个记忆提炼助手。请从以下对话中提取值得长期记忆的关键信息。

规则：
1. 提取用户的偏好、习惯、个人信息（姓名、职业、公司、位置等）
2. 提取用户明确要求"记住"的指令或偏好
3. 提取重要的项目/工作上下文（常用目录、技术栈等）
4. 跳过临时性、一次性的操作信息（如"帮我搜索xxx"、"打开某文件"等）
5. 每条记忆用一句简洁的话描述（不超过50字）
6. 如果与已有记忆重复或需要更新，设置 update_id 为对应记忆的ID
7. 如果没有值得记忆的内容，返回空数组 []
8. category 取值: preference(偏好), fact(事实), instruction(指令), context(上下文)

已有记忆：
${existingList}

对话内容：
${dialogParts.join('\n')}

请严格以 JSON 数组格式输出，不要包含其他文字：
[{"content": "...", "category": "...", "update_id": "可选"}]`

    const memMessages: ChatRequestMessage[] = [
      { role: 'system', content: '你是一个专注于提取关键信息的助手。你只输出合法的 JSON 数组，不输出任何其他内容。' },
      { role: 'user', content: extractionPrompt },
    ]

    const text = await adapter.nonStreamingRequest(url, headers, modelName, memMessages, {
      temperature: 0.3,
      maxTokens: 2048,
    })
    if (!text) return

    // Parse JSON from the response (handle markdown code blocks)
    let jsonStr = text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed) || parsed.length === 0) return

    const validMemories = parsed
      .filter((item: any) => item.content && typeof item.content === 'string')
      .map((item: any) => ({
        content: item.content.slice(0, 200),
        category: ['preference', 'fact', 'instruction', 'context'].includes(item.category) ? item.category : 'context',
        updateId: item.update_id || undefined,
      }))

    if (validMemories.length > 0) {
      memoryManager.addOrUpdateMemories(validMemories)
      console.log(`[Memory] Extracted ${validMemories.length} memories`)
    }
  } catch (err: any) {
    console.error('[Memory] Extraction failed:', err.message)
  }
}

/**
 * Send a chat request with streaming and tool calling support.
 * The AI can autonomously call tools and the results are fed back.
 */
export async function sendChatStream(
  requestId: string,
  userMessages: ChatRequestMessage[],
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const model = getActiveModel()
  if (!model) {
    callbacks.onError('未配置活跃的 AI 模型。请在设置中添加并激活一个模型。')
    return
  }

  const controller = new AbortController()
  activeRequests.set(requestId, controller)

  const adapter = getAdapter(model.providerType)
  const url = adapter.buildUrl(model.baseUrl, model.modelName)
  const headers = adapter.buildHeaders(model.apiKey)

  // Build messages with system prompt + current timestamp
  const now = new Date()
  const timestamp = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    hour12: false,
  })
  const systemContent = `${SYSTEM_PROMPT}${buildMcpPromptSection()}${buildSkillsPromptSection()}${buildMemoryPromptSection()}\n\n当前时间: ${timestamp}`
  const messages: ChatRequestMessage[] = [
    { role: 'system', content: systemContent },
    ...userMessages,
  ]

  let fullContent = ''

  try {
    // Lazily initialize MCP connections on first chat
    if (mcpService.isDashScopeConfigured()) {
      try {
        await mcpService.initialize()
      } catch (err: any) {
        console.error('[MCP] Initialization error:', err.message)
      }
    }

    // AGENT only has delegate_task tool — all execution goes through SubAgents
    const agentTools = buildAgentTools()

    // Tool calling loop (max 30 iterations — supports delegating multiple subtasks)
    for (let i = 0; i < 30; i++) {
      // Compress old tool results before each round to free context space
      compressMessages(messages)

      const { content, toolCalls } = await streamOneRound(
        url,
        headers,
        model.modelName,
        messages,
        controller.signal,
        (chunk) => {
          fullContent += chunk
          callbacks.onChunk(chunk)
        },
        adapter,
        agentTools,
      )

      // No tool calls - we're done
      if (toolCalls.length === 0) break

      // AI wants to call tools
      // Add assistant message with tool_calls to conversation
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      })

      // Execute each tool call — AGENT only uses delegate_task
      for (const tc of toolCalls) {
        let queryDisplay = ''
        try {
          const args = JSON.parse(tc.arguments)
          queryDisplay = args.task ? (args.task.length > 60 ? args.task.slice(0, 60) + '...' : args.task) : tc.arguments
        } catch {
          queryDisplay = tc.arguments
        }

        // Send status to UI
        callbacks.onChunk(`\n🤖 正在委派任务: "${queryDisplay}"...\n`)
        fullContent += `\n🤖 正在委派任务: "${queryDisplay}"...\n`

        let result: string
        if (tc.name === 'delegate_task') {
          try {
            const args = JSON.parse(tc.arguments)
            const sas = await getSubAgentService()
            const subResult = await sas.executeTask(
              args.task || '',
              args.context,
            )
            result = JSON.stringify(subResult)

            // Show brief status to user
            if (subResult.success) {
              const statusMsg = `\n✅ 任务执行完成\n`
              callbacks.onChunk(statusMsg)
              fullContent += statusMsg
            } else {
              const statusMsg = `\n❌ 任务执行失败: ${subResult.error || '未知错误'}\n`
              callbacks.onChunk(statusMsg)
              fullContent += statusMsg
            }
          } catch (err: any) {
            result = JSON.stringify({ success: false, error: err.message })
          }
        } else {
          // AGENT should not call other tools, but handle gracefully
          result = JSON.stringify({ error: `AGENT 不直接执行工具。请使用 delegate_task 委派任务。` })
        }

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      }

      // Inject progress check to prevent context pollution causing premature stop
      // Remove old progress check messages first
      const filteredMessages = messages.filter(m => !(m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[进度检查]')))
      messages.length = 0
      messages.push(...filteredMessages)
      // Inject new progress check
      const originalRequest = userMessages[userMessages.length - 1]?.content || ''
      messages.push({
        role: 'user',
        content: `[进度检查] 用户原始请求：「${typeof originalRequest === 'string' ? originalRequest.slice(0, 200) : ''}」。已完成${i + 1}轮委派。请检查是否所有工作已完成，未完成则继续 delegate_task。`,
      })

      // Continue loop - next iteration will get the AI's response with tool results
    }

    callbacks.onEnd(fullContent)

    // Async memory extraction (non-blocking, fire-and-forget)
    extractMemories(adapter, url, headers, model.modelName, userMessages).catch(() => {})
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onEnd(fullContent)
    } else {
      callbacks.onError(err.message || '请求失败')
    }
  } finally {
    activeRequests.delete(requestId)
  }
}

export function abortChatRequest(requestId: string): boolean {
  const controller = activeRequests.get(requestId)
  if (controller) {
    controller.abort()
    activeRequests.delete(requestId)
    return true
  }
  return false
}
