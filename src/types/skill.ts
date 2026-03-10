export type SkillToolType = 'llm' | 'mcp' | 'script' | 'code' | 'http' | 'file'

/** Per-tool configuration stored alongside each selected tool */
export interface SkillToolItem {
  type: SkillToolType
  /** MCP: selected MCP server IDs */
  mcpServerIds?: string[]
  /** LLM: selected model ID */
  modelId?: string
  /** Script: file path to the script */
  scriptPath?: string
  /** Script: command to run (if not file-based) */
  scriptCommand?: string
  /** HTTP: request URL */
  httpUrl?: string
  /** HTTP: request method */
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** HTTP: request headers JSON */
  httpHeaders?: string
  /** HTTP: request body template */
  httpBody?: string
  /** File: target file path */
  filePath?: string
  /** File: operation type */
  fileOperation?: 'read' | 'write' | 'template'
  /** Code: language */
  codeLanguage?: 'javascript' | 'python'
  /** Code: code content */
  codeContent?: string
}

export interface Skill {
  id: string
  name: string
  /** 使用规则：描述何时及如何调用此技能，可用 {MCP}、{脚本}、{LLM}、{HTTP}、{代码}、{文件} 引用工具 */
  usageRule: string
  /** 此技能可使用的工具列表（带各自配置） */
  tools: SkillToolItem[]
  createdBy: 'user' | 'agent'
  createdAt: number
  updatedAt: number
  enabled: boolean
}

// Legacy types kept for backward compatibility with skillService execution
export interface SkillToolConfig {
  llmSystemPrompt?: string
  llmUserPromptTemplate?: string
  mcpToolName?: string
  mcpArgsTemplate?: string
  scriptCommand?: string
  scriptCwd?: string
  scriptTimeout?: number
  codeLanguage?: 'javascript' | 'python'
  codeContent?: string
  httpUrl?: string
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  httpHeaders?: Record<string, string>
  httpBody?: string
  filePath?: string
  fileOperation?: 'read' | 'write' | 'template'
  fileContent?: string
}

export interface SkillStep {
  id: string
  name: string
  toolType: SkillToolType
  config: SkillToolConfig
  inputMapping?: string
}

export interface SkillTriggerRule {
  keywords?: string[]
  pattern?: string
  description: string
}
