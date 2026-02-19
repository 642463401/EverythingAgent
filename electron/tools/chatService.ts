/**
 * AI Chat Service with Tool Calling support.
 * The AI can autonomously invoke Everything search via OpenAI-compatible function calling.
 */

import { configManager, memoryManager } from '../configManager'
import { searchEverything } from './everythingSearch'
import { webSearch, webReader, isWebSearchAvailable } from './webSearch'
import { readFile, writeFile, editFile, listDirectory, analyzeData } from './fileTools'
import { runCommand } from './commandRunner'
import { fileManage, openApplication, openFile, desktopControl } from './fileManager'
import { mcpService } from './mcpService'
import { lookupCity } from './cityLookup'
import type { ModelConfig } from '../../src/types/config'

export interface ChatRequestMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: any[]
  tool_call_id?: string
}

export interface ChatStreamCallbacks {
  onChunk: (content: string) => void
  onEnd: (fullContent: string) => void
  onError: (error: string) => void
}

interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

interface SubTask {
  id: number
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  result?: string
}

interface TaskPlan {
  goal: string
  subtasks: SubTask[]
  currentSubtaskId: number | null
}

const activeRequests = new Map<string, AbortController>()

const SYSTEM_PROMPT = `你是 EverythingAgent，一个强大的 Windows 桌面 AI 助手，同时也是一个自主编码代理（Auto-Coder）。

你拥有以下能力：
1. 回答用户的各种问题
2. 使用 everything_search 工具在用户电脑上快速搜索本地文件和文件夹
3. 使用 web_search 工具联网搜索实时信息（新闻、技术文档、百科知识等）
4. 使用 web_reader 工具读取和提取网页内容（获取文章全文、页面详情等）
5. 使用 read_file 工具读取本地文件内容（代码、文本、配置文件、PDF 等）
6. 使用 write_file 工具创建或写入文件（生成报告、保存内容、创建代码文件、Markdown 文档等）
7. 使用 edit_file 工具局部修改已有文件内容（查找并替换指定文本，无需重写整个文件）
8. 使用 list_directory 工具列出目录下的文件和文件夹
9. 使用 analyze_data 工具分析数据文件（CSV、JSON），获取统计信息和数据预览
10. 使用 run_command 工具在用户电脑上执行系统命令（运行代码、安装依赖、执行构建、git 操作等）
11. 帮助用户理解和管理他们的文件
12. 使用 file_manage 工具管理文件（复制、移动、重命名、删除文件或文件夹）
13. 使用 open_application 工具打开应用程序（通过名称打开任何已安装的应用）
14. 使用 open_file 工具用默认或指定程序打开文件
15. 使用 desktop_control 工具控制桌面显示（隐藏/显示桌面图标）
16. 使用 task_progress 工具管理复杂任务的进度（分解子任务、跟踪完成状态）

文档生成策略（重要）：
- 所有文档内容默认先生成 Markdown（.md）格式，使用 write_file 直接写入。这是最快的方式。
- 不要使用结构化 JSON 来组织文档内容，直接在 write_file 的 content 参数中写入 Markdown 文本。
- 当用户明确要求 Word(.docx)、Excel(.xlsx)、PPT(.pptx)、PDF(.pdf) 等 Office 格式时，先生成 .md 文件，然后告知用户可以使用 MCP 工具转换为目标格式，或调用可用的 MCP 文档转换工具。
- 禁止对同一文件重复写入！文件写入成功后，不要再次调用 write_file 写入相同文件，除非用户明确要求修改。
- 文件修改：当用户要求修改已有文件的部分内容时，使用 edit_file 工具进行局部替换，避免重写整个文件。如需大幅修改，先用 read_file 读取原内容，修改后再用 write_file 写入。

工具使用策略：
- 当用户要求查找文件时，使用 everything_search（全盘快速搜索）或 list_directory（浏览特定目录）。
- 当用户需要查询实时信息时，使用 web_search 联网搜索。
- 当用户提供 URL 并要求查看内容时，使用 web_reader 读取网页。
- 当用户要求读取/查看某个文件内容时，使用 read_file。支持 PDF 文件自动提取文本。对于图片、音视频等二进制文件，read_file 无法读取，请告知用户。
- 当用户要求创建文件或生成文档时，使用 write_file 直接写入 Markdown 或纯文本内容。
- 当用户要求修改文件中的部分内容时，使用 edit_file 进行精确替换。
- 当用户要求分析数据（CSV/JSON）时，使用 analyze_data 获取统计摘要和预览，然后给出分析结论。
- 当用户要求运行代码、安装依赖、执行构建、git操作或任何命令行任务时，使用 run_command。
- 当用户要求复制、移动、重命名、删除文件或创建文件夹时，使用 file_manage。
- 当用户要求打开某个应用程序时，使用 open_application（支持中英文应用名，如"打开微信"、"打开Chrome"）。
- 当用户要求打开某个文件时，使用 open_file（用默认程序或指定程序打开）。
- 当用户要求隐藏/显示桌面图标时，使用 desktop_control。
- 可以组合使用工具：先搜索文件 → 读取内容 → 分析数据 → 写入报告。
- 搜索结果请以简洁清晰的格式展示，并标注来源。
- 写文件前请确认路径和内容，写入后告知用户完整路径。
- 文件路径必须使用绝对路径（如 C:\\Users\\user\\Desktop\\report.md），不要使用相对路径。

Auto-Coder 自主编码工作流：
当用户提出编码任务时，按照以下流程自主工作：
1. 使用 list_directory 浏览项目结构，了解代码组织。
2. 使用 read_file 读取相关代码文件，理解现有逻辑。
3. 使用 write_file 创建或修改代码文件。
4. 使用 run_command 运行代码、执行测试或构建，检查结果。
5. 如果出错，读取错误信息，修改代码，再次运行，循环直到成功。
run_command 适用场景：运行 Python/Node.js/Java 等代码、pip install / npm install 安装依赖、git 操作、编译构建、运行测试、查看环境信息（python --version 等）。

任务规划与进度管理：
当用户请求涉及多个步骤的复杂任务时（如"分析整个项目"、"读取所有代码文件"、"生成完整报告"），你必须：
1. 先使用 task_progress 工具的 create_plan 操作，将任务分解为 3-10 个可独立执行的子任务。
2. 每开始一个子任务时，调用 update_status 将其标记为 in_progress。
3. 每完成一个子任务时，调用 update_status 将其标记为 completed，并附上简要结果描述（<100字）。
4. 如果某个子任务不再需要，标记为 skipped。

上下文管理注意事项：
- 你的上下文窗口有限，之前轮次的工具结果可能已被压缩或截断。
- 读取大文件时，关注关键信息并在 task_progress 的 result 中记录要点，而不是依赖原始内容在后续步骤中仍然可用。
- 每个子任务应尽量自包含：完成后记录要点摘要，后续步骤可以依赖摘要而非原始数据。
- 如果任务超出你的处理能力，诚实告知用户并建议拆分为多次对话。

你可以根据用户的需求自动切换为以下专家模式，在回复开头用 [模式名] 标注当前模式：

【生活助手】当用户询问衣食住行、生活建议、推荐、天气、美食、旅行等日常问题时：
- 提供实用、具体的建议
- 结合 web_search 查找最新信息和推荐
- 用友好亲切的语调回复

【工作助手】当用户需要文档编写、数据分析、报告生成、会议总结等工作任务时：
- 使用 write_file 生成 Markdown 格式的专业文档，用户需要 Office 格式时再通过 MCP 工具转换
- 使用 edit_file 修改已有文档的部分内容
- 使用 analyze_data 分析数据并给出结论
- 用专业严谨的语调回复

【编程助手】当用户需要代码编写、调试、技术问题解答、项目开发时：
- 遵循 Auto-Coder 工作流（浏览→读取→编写→运行→修复）
- 代码简洁规范，附带必要注释
- 用技术精确的语调回复

【文件管家】当用户需要文件管理、应用操作、桌面控制等系统操作时：
- 使用 file_manage、open_application、open_file、desktop_control 等工具
- 操作前简要确认意图，操作后报告结果
- 用高效直接的语调回复

当任务跨越多个领域时（如"分析这个CSV然后生成PPT报告"），灵活组合多个模式的能力来完成。`

function buildTools() {
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
      description: '局部修改已有文件内容。通过查找并替换指定文本来修改文件，无需重写整个文件。适用于修改文档中的某段文字、更新代码中的某行、修正错别字等。old_string 必须在文件中唯一匹配。',
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

  // ==================== Task Progress (context management) ====================
  tools.push({
    type: 'function' as const,
    function: {
      name: 'task_progress',
      description: '任务进度管理工具。用于分解复杂任务、跟踪子任务进度。操作类型：create_plan(创建任务计划)、update_status(更新子任务状态)、get_progress(获取当前进度)。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create_plan', 'update_status', 'get_progress'],
            description: '操作类型',
          },
          goal: {
            type: 'string',
            description: '(create_plan) 总体任务目标',
          },
          subtasks: {
            type: 'array',
            items: { type: 'string' },
            description: '(create_plan) 子任务标题列表',
          },
          subtask_id: {
            type: 'number',
            description: '(update_status) 子任务序号（从1开始）',
          },
          status: {
            type: 'string',
            enum: ['in_progress', 'completed', 'skipped'],
            description: '(update_status) 新状态',
          },
          result: {
            type: 'string',
            description: '(update_status) 子任务完成后的简要结果描述（建议<100字）',
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
    const mcpTools = mcpService.getToolDefinitions()
    tools.push(...mcpTools)
  }

  return tools
}

function getActiveModel(): ModelConfig | null {
  const model = configManager.getActiveModel()
  if (!model) return null
  if (!model.baseUrl || !model.apiKey || !model.modelName) return null
  return model
}

function buildChatUrl(baseUrl: string): string {
  let url = baseUrl.trim()
  if (url.endsWith('/')) url = url.slice(0, -1)
  if (url.endsWith('/chat/completions')) return url
  if (url.endsWith('/v1')) return `${url}/chat/completions`
  return `${url}/chat/completions`
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

/**
 * Parse a single streaming round. Returns accumulated content and tool calls.
 */
async function streamOneRound(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: ChatRequestMessage[],
  signal: AbortSignal,
  onContentChunk: (chunk: string) => void,
): Promise<{ content: string; toolCalls: AccumulatedToolCall[] }> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools: buildTools(),
      stream: true,
      temperature: 0.7,
      max_tokens: 8192,
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

          // Content chunks
          if (delta?.content) {
            content += delta.content
            onContentChunk(delta.content)
          }

          // Tool call chunks
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

/**
 * Execute task_progress tool. Manages an in-memory task plan scoped to the current request.
 */
function executeTaskProgress(planRef: { current: TaskPlan | null }, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson)

    if (args.action === 'create_plan') {
      if (!args.goal || !args.subtasks || args.subtasks.length === 0) {
        return JSON.stringify({ error: '需要提供 goal 和 subtasks' })
      }
      planRef.current = {
        goal: args.goal,
        subtasks: args.subtasks.map((title: string, i: number) => ({
          id: i + 1,
          title,
          status: 'pending' as const,
        })),
        currentSubtaskId: null,
      }
      return JSON.stringify({
        success: true,
        message: `已创建任务计划: ${args.goal}`,
        totalSubtasks: args.subtasks.length,
        subtasks: planRef.current.subtasks,
      })
    }

    if (args.action === 'update_status') {
      if (!planRef.current) {
        return JSON.stringify({ error: '尚未创建任务计划，请先使用 create_plan' })
      }
      const subtask = planRef.current.subtasks.find((t) => t.id === args.subtask_id)
      if (!subtask) {
        return JSON.stringify({ error: `未找到子任务 #${args.subtask_id}` })
      }
      subtask.status = args.status
      if (args.result) subtask.result = args.result
      if (args.status === 'in_progress') planRef.current.currentSubtaskId = subtask.id

      const completed = planRef.current.subtasks.filter((t) => t.status === 'completed').length
      const total = planRef.current.subtasks.length
      return JSON.stringify({
        success: true,
        progress: `${completed}/${total}`,
        subtask: { id: subtask.id, title: subtask.title, status: subtask.status },
      })
    }

    if (args.action === 'get_progress') {
      if (!planRef.current) {
        return JSON.stringify({ message: '无活跃任务计划' })
      }
      const completed = planRef.current.subtasks.filter((t) => t.status === 'completed').length
      return JSON.stringify({
        goal: planRef.current.goal,
        progress: `${completed}/${planRef.current.subtasks.length}`,
        subtasks: planRef.current.subtasks,
      })
    }

    return JSON.stringify({ error: `未知操作: ${args.action}` })
  } catch (err: any) {
    return JSON.stringify({ error: err.message })
  }
}

/**
 * Execute a tool call and return the result as a string.
 */
async function executeTool(name: string, argsJson: string): Promise<string> {
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
    if (parsed.success && parsed.path && parsed.message) {
      return JSON.stringify({
        success: parsed.success,
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

function compressMessages(messages: ChatRequestMessage[]): void {
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
    if (messages[i].role === 'tool' && messages[i].content) {
      messages[i].content = compressToolResult(messages[i].content!)
    }
  }
}

/**
 * Extract memories from a completed conversation (async, non-blocking).
 * Sends a separate non-streaming request to the AI to identify key facts.
 */
async function extractMemories(
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

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: '你是一个专注于提取关键信息的助手。你只输出合法的 JSON 数组，不输出任何其他内容。' },
          { role: 'user', content: extractionPrompt },
        ],
        stream: false,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    })

    if (!response.ok) return

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim()
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

  const url = buildChatUrl(model.baseUrl)
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${model.apiKey}`,
  }

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
  const systemContent = `${SYSTEM_PROMPT}${buildMcpPromptSection()}${buildMemoryPromptSection()}\n\n当前时间: ${timestamp}`
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

    // Task progress state scoped to this request
    const taskPlanRef: { current: TaskPlan | null } = { current: null }

    // Track files written in this conversation to prevent duplicate writes
    const writtenFiles = new Set<string>()

    // Tool calling loop (max 30 iterations — supports long multi-step tasks with context compression)
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

      // Execute each tool and add results
      for (const tc of toolCalls) {
        let queryDisplay = ''
        try {
          const args = JSON.parse(tc.arguments)
          queryDisplay = args.query || args.command || args.path || args.url || args.name || args.operation || args.action || args.q || tc.arguments
        } catch {
          queryDisplay = tc.arguments
        }

        // Send status to UI
        const toolMeta: Record<string, { icon: string; label: string }> = {
          'everything_search': { icon: '🔍', label: '本地搜索' },
          'web_search': { icon: '🌐', label: '联网搜索' },
          'metaso_search': { icon: '🌐', label: '联网搜索' },
          'web_reader': { icon: '📄', label: '读取网页' },
          'metaso_reader': { icon: '📄', label: '读取网页' },
          'read_file': { icon: '📖', label: '读取文件' },
          'write_file': { icon: '✏️', label: '写入文件' },
          'list_directory': { icon: '📁', label: '浏览目录' },
          'analyze_data': { icon: '📊', label: '分析数据' },
          'run_command': { icon: '⚡', label: '执行命令' },
          'file_manage': { icon: '📦', label: '管理文件' },
          'open_application': { icon: '🚀', label: '打开应用' },
          'open_file': { icon: '📂', label: '打开文件' },
          'desktop_control': { icon: '🖥️', label: '桌面控制' },
          'edit_file': { icon: '✏️', label: '修改文件' },
          'city_lookup': { icon: '🏙️', label: '查询城市' },
          'task_progress': { icon: '📋', label: '任务进度' },
          ...mcpService.getToolMeta(),
        }

        const meta = toolMeta[tc.name] || { icon: '🔧', label: tc.name }
        callbacks.onChunk(`\n${meta.icon} 正在${meta.label}: "${queryDisplay}"...\n`)
        fullContent += `\n${meta.icon} 正在${meta.label}: "${queryDisplay}"...\n`

        let result: string
        if (tc.name === 'task_progress') {
          result = executeTaskProgress(taskPlanRef, tc.arguments)
          // Send structured progress chunk to frontend
          if (taskPlanRef.current) {
            const p = taskPlanRef.current
            const completed = p.subtasks.filter((t) => t.status === 'completed').length
            const current = p.subtasks.find((t) => t.status === 'in_progress')
            const progressChunk = `\n📋 任务进度: [${completed}/${p.subtasks.length}] ${current ? `正在执行: ${current.title}` : p.goal}...\n`
            callbacks.onChunk(progressChunk)
            fullContent += progressChunk
          }
        } else if (tc.name === 'write_file') {
          // Write deduplication: warn if writing to the same file again
          try {
            const args = JSON.parse(tc.arguments)
            const targetPath = args.path || ''
            if (targetPath && writtenFiles.has(targetPath)) {
              result = JSON.stringify({
                warning: true,
                path: targetPath,
                message: `文件 "${targetPath}" 在本次对话中已写入过。如需修改，请使用 edit_file 工具进行局部修改，或确认用户确实要求重新写入。`,
              })
            } else {
              result = await executeTool(tc.name, tc.arguments)
              // Track successful writes
              try {
                const parsed = JSON.parse(result)
                if (parsed.success && parsed.path) {
                  writtenFiles.add(parsed.path)
                  if (targetPath) writtenFiles.add(targetPath)
                }
              } catch { /* ignore parse errors */ }
            }
          } catch {
            result = await executeTool(tc.name, tc.arguments)
          }
        } else {
          result = await executeTool(tc.name, tc.arguments)
          // Also track edit_file successes
          if (tc.name === 'edit_file') {
            try {
              const parsed = JSON.parse(result)
              if (parsed.success && parsed.path) {
                writtenFiles.add(parsed.path)
              }
            } catch { /* ignore */ }
          }
        }

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      }

      // Continue loop - next iteration will get the AI's response with tool results
    }

    callbacks.onEnd(fullContent)

    // Async memory extraction (non-blocking, fire-and-forget)
    extractMemories(url, headers, model.modelName, userMessages).catch(() => {})
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
