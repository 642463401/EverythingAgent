/**
 * AI Chat Service with Tool Calling support.
 * The AI can autonomously invoke Everything search via OpenAI-compatible function calling.
 */

import { configManager } from '../configManager'
import { searchEverything } from './everythingSearch'
import { webSearch, webReader, isWebSearchAvailable } from './webSearch'
import { readFile, writeFile, listDirectory, analyzeData } from './fileTools'
import { runCommand } from './commandRunner'
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

const activeRequests = new Map<string, AbortController>()

const SYSTEM_PROMPT = `你是 EverythingAgent，一个强大的 Windows 桌面 AI 助手，同时也是一个自主编码代理（Auto-Coder）。

你拥有以下能力：
1. 回答用户的各种问题
2. 使用 everything_search 工具在用户电脑上快速搜索本地文件和文件夹
3. 使用 web_search 工具联网搜索实时信息（新闻、技术文档、百科知识等）
4. 使用 web_reader 工具读取和提取网页内容（获取文章全文、页面详情等）
5. 使用 read_file 工具读取本地文件内容（代码、文本、配置文件等）
6. 使用 write_file 工具创建或写入文件（生成报告、保存内容、创建代码文件等）
7. 使用 list_directory 工具列出目录下的文件和文件夹
8. 使用 analyze_data 工具分析数据文件（CSV、JSON），获取统计信息和数据预览
9. 使用 run_command 工具在用户电脑上执行系统命令（运行代码、安装依赖、执行构建、git 操作等）
10. 帮助用户理解和管理他们的文件

工具使用策略：
- 当用户要求查找文件时，使用 everything_search（全盘快速搜索）或 list_directory（浏览特定目录）。
- 当用户需要查询实时信息时，使用 web_search 联网搜索。
- 当用户提供 URL 并要求查看内容时，使用 web_reader 读取网页。
- 当用户要求读取/查看某个文件内容时，使用 read_file。
- 当用户要求创建纯文本文件（.md/.txt/.csv/.json/.py/.js等）时，使用 write_file。
- 当用户要求分析数据（CSV/JSON）时，使用 analyze_data 获取统计摘要和预览，然后给出分析结论。
- 当用户要求运行代码、安装依赖、执行构建、git操作或任何命令行任务时，使用 run_command。
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

Office 文档生成策略（带回退机制）：
当用户要求创建 .docx、.xlsx、.pptx 等 Office 格式文档时，按以下流程操作：
第一步：检测 Python 环境
- 用 run_command 执行 python --version（如果失败再试 python3 --version）。
- 如果 Python 不可用，直接跳到回退方案。
第二步：尝试用 Python 脚本生成
- 用 write_file 写一个 Python 脚本（如 generate_doc.py），使用对应的库：
  - .docx 文档：使用 python-docx 库
  - .xlsx 表格：使用 openpyxl 库
  - .pptx 演示文稿：使用 python-pptx 库
- 用 run_command 安装所需库：pip install python-docx openpyxl python-pptx（如果 pip 失败，跳到回退方案）
- 用 run_command 执行脚本：python generate_doc.py
- 如果脚本执行成功（exitCode 为 0），告知用户文件路径，删除临时脚本。
- 如果脚本执行失败，跳到回退方案。
回退方案：
- 当 Python 不可用、pip 安装失败或脚本执行失败时，改为使用 write_file 创建 .md 格式文档。
- 将原始文件扩展名从 .docx/.xlsx/.pptx 改为 .md。
- 用 Markdown 格式组织内容（标题用 #，表格用 | 分隔，列表用 -）。
- 告知用户：由于系统未安装 Python 环境（或库安装/脚本执行失败），已自动生成 Markdown 格式文档，可用任意文本编辑器或 Markdown 阅读器打开。
如果用户只需要简单的纯文本报告，直接使用 write_file 创建 .md 文件即可，无需尝试 Python。`

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
      description: '读取本地文件的内容。支持文本文件、代码文件、配置文件、CSV、JSON 等。返回文件内容、大小和行数。最大支持 512KB。',
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
      description: '创建或写入文本文件。支持 .md/.txt/.csv/.json/.html/.py/.js 等文本格式。如需创建 Office 文档（.docx/.xlsx/.pptx），请编写 Python 脚本后用 run_command 执行。',
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
      max_tokens: 4096,
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

  return JSON.stringify({ error: `Unknown tool: ${name}` })
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

  // Build messages with system prompt
  const messages: ChatRequestMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages,
  ]

  let fullContent = ''

  try {
    // Tool calling loop (max 15 iterations — Auto-Coder needs more rounds for read→write→run→fix cycles)
    for (let i = 0; i < 15; i++) {
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
          queryDisplay = args.query || args.command || args.path || args.url || args.q || tc.arguments
        } catch {
          queryDisplay = tc.arguments
        }

        // Send status to UI
        const isWebSearch = tc.name === 'web_search' || tc.name === 'metaso_search'
        const isWebReader = tc.name === 'web_reader' || tc.name === 'metaso_reader'
        const isFileRead = tc.name === 'read_file'
        const isFileWrite = tc.name === 'write_file'
        const isListDir = tc.name === 'list_directory'
        const isAnalyze = tc.name === 'analyze_data'
        const isRunCmd = tc.name === 'run_command'
        const searchIcon = isRunCmd ? '⚡' : isFileWrite ? '✏️' : isAnalyze ? '📊' : isFileRead ? '📖' : isListDir ? '📁' : isWebReader ? '📄' : isWebSearch ? '🌐' : '🔍'
        const searchLabel = isRunCmd ? '执行命令' : isFileWrite ? '写入文件' : isAnalyze ? '分析数据' : isFileRead ? '读取文件' : isListDir ? '浏览目录' : isWebReader ? '读取网页' : isWebSearch ? '联网搜索' : '本地搜索'
        callbacks.onChunk(`\n${searchIcon} 正在${searchLabel}: "${queryDisplay}"...\n`)
        fullContent += `\n${searchIcon} 正在${searchLabel}: "${queryDisplay}"...\n`

        const result = await executeTool(tc.name, tc.arguments)

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      }

      // Continue loop - next iteration will get the AI's response with tool results
    }

    callbacks.onEnd(fullContent)
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
