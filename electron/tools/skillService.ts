/**
 * Skill Execution Engine
 *
 * Executes user-defined skills based on their tool type.
 * Supports: llm, mcp, script, code, http, file, pipeline
 */

import { skillManager, configManager } from '../configManager'
import { mcpService } from './mcpService'
import { runCommand } from './commandRunner'
import { readFile, writeFile } from './fileTools'
import { getAdapter } from './adapters'
import type { Skill, SkillStep, SkillToolConfig } from '../../src/types/skill'
import type { ChatRequestMessage } from '../../src/types/config'

export interface SkillExecutionResult {
  success: boolean
  output: string
  error?: string
}

/**
 * Execute a skill by its ID with the given input.
 */
export async function executeSkill(skillId: string, input: string): Promise<SkillExecutionResult> {
  const skill = skillManager.getSkill(skillId) as any
  if (!skill) {
    return { success: false, output: '', error: `技能不存在: ${skillId}` }
  }
  if (!skill.enabled) {
    return { success: false, output: '', error: `技能已禁用: ${skill.name}` }
  }

  try {
    // New rule-based skills: return the usage rule as guidance for the AI
    if (skill.usageRule && !skill.toolType) {
      const toolsStr = (skill.tools || []).join(', ')
      return {
        success: true,
        output: `[技能规则] ${skill.usageRule}\n[可用工具] ${toolsStr}\n[输入] ${input}`,
      }
    }

    // Legacy skills with toolType/toolConfig
    if (skill.toolType === 'pipeline') {
      return await executePipelineSkill(skill, input)
    }
    return await executeStepByType(skill.toolType, skill.toolConfig || {}, input)
  } catch (err: any) {
    return { success: false, output: '', error: err.message }
  }
}

async function executeStepByType(
  toolType: string,
  config: SkillToolConfig,
  input: string,
): Promise<SkillExecutionResult> {
  switch (toolType) {
    case 'llm':
      return executeLlmSkill(config, input)
    case 'mcp':
      return executeMcpSkill(config, input)
    case 'script':
      return executeScriptSkill(config, input)
    case 'code':
      return executeCodeSkill(config, input)
    case 'http':
      return executeHttpSkill(config, input)
    case 'file':
      return executeFileSkill(config, input)
    default:
      return { success: false, output: '', error: `未知的技能类型: ${toolType}` }
  }
}

// ==================== LLM Skill ====================

async function executeLlmSkill(config: SkillToolConfig, input: string): Promise<SkillExecutionResult> {
  const model = configManager.getActiveModel()
  if (!model) {
    return { success: false, output: '', error: '未配置活跃的 AI 模型' }
  }

  const adapter = getAdapter(model.providerType)
  const url = adapter.buildUrl(model.baseUrl, model.modelName)
  const headers = adapter.buildHeaders(model.apiKey)

  const userPrompt = config.llmUserPromptTemplate
    ? config.llmUserPromptTemplate.replace(/\{input\}/g, input)
    : input

  const messages: ChatRequestMessage[] = []
  if (config.llmSystemPrompt) {
    messages.push({ role: 'system', content: config.llmSystemPrompt })
  }
  messages.push({ role: 'user', content: userPrompt })

  const text = await adapter.nonStreamingRequest(url, headers, model.modelName, messages, {
    temperature: 0.7,
    maxTokens: 4096,
  })

  return { success: true, output: text || '' }
}

// ==================== MCP Skill ====================

async function executeMcpSkill(config: SkillToolConfig, input: string): Promise<SkillExecutionResult> {
  if (!config.mcpToolName) {
    return { success: false, output: '', error: 'MCP 技能未配置工具名称' }
  }

  const argsJson = config.mcpArgsTemplate
    ? config.mcpArgsTemplate.replace(/\{input\}/g, input)
    : JSON.stringify({ input })

  const result = await mcpService.executeTool(config.mcpToolName, argsJson)
  return { success: true, output: result }
}

// ==================== Script Skill ====================

async function executeScriptSkill(config: SkillToolConfig, input: string): Promise<SkillExecutionResult> {
  if (!config.scriptCommand) {
    return { success: false, output: '', error: '脚本技能未配置命令' }
  }

  const command = config.scriptCommand.replace(/\{input\}/g, input)
  const timeout = config.scriptTimeout || 30000
  const result = await runCommand(command, config.scriptCwd, timeout)

  try {
    const parsed = JSON.parse(result)
    if (parsed.exitCode === 0) {
      return { success: true, output: parsed.stdout || '' }
    }
    return { success: false, output: parsed.stdout || '', error: parsed.stderr || `Exit code: ${parsed.exitCode}` }
  } catch {
    return { success: true, output: result }
  }
}

// ==================== Code Skill ====================

async function executeCodeSkill(config: SkillToolConfig, input: string): Promise<SkillExecutionResult> {
  if (!config.codeContent) {
    return { success: false, output: '', error: '代码技能未配置代码内容' }
  }

  const code = config.codeContent.replace(/\{input\}/g, input)
  const lang = config.codeLanguage || 'javascript'

  let command: string
  if (lang === 'javascript') {
    command = `node -e "${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  } else {
    command = `python -c "${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }

  const result = await runCommand(command, undefined, 30000)

  try {
    const parsed = JSON.parse(result)
    if (parsed.exitCode === 0) {
      return { success: true, output: parsed.stdout || '' }
    }
    return { success: false, output: parsed.stdout || '', error: parsed.stderr || `Exit code: ${parsed.exitCode}` }
  } catch {
    return { success: true, output: result }
  }
}

// ==================== HTTP Skill ====================

async function executeHttpSkill(config: SkillToolConfig, input: string): Promise<SkillExecutionResult> {
  if (!config.httpUrl) {
    return { success: false, output: '', error: 'HTTP 技能未配置 URL' }
  }

  const url = config.httpUrl.replace(/\{input\}/g, encodeURIComponent(input))
  const method = config.httpMethod || 'GET'
  const headers: Record<string, string> = { ...config.httpHeaders }
  const body = config.httpBody ? config.httpBody.replace(/\{input\}/g, input) : undefined

  const fetchOptions: RequestInit = { method, headers }
  if (body && method !== 'GET') {
    fetchOptions.body = body
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  const response = await fetch(url, fetchOptions)
  const text = await response.text()

  if (response.ok) {
    return { success: true, output: text }
  }
  return { success: false, output: text, error: `HTTP ${response.status}: ${response.statusText}` }
}

// ==================== File Skill ====================

async function executeFileSkill(config: SkillToolConfig, input: string): Promise<SkillExecutionResult> {
  if (!config.filePath) {
    return { success: false, output: '', error: '文件技能未配置文件路径' }
  }

  const filePath = config.filePath.replace(/\{input\}/g, input)
  const operation = config.fileOperation || 'read'

  if (operation === 'read') {
    const result = await readFile(filePath)
    return { success: true, output: result }
  }

  if (operation === 'write') {
    const content = (config.fileContent || '').replace(/\{input\}/g, input)
    const result = await writeFile(filePath, content)
    return { success: true, output: result }
  }

  if (operation === 'template') {
    // Read template file, replace {input} placeholder, return rendered content
    const templateContent = await readFile(filePath)
    try {
      const parsed = JSON.parse(templateContent)
      const content = (parsed.content || templateContent).replace(/\{input\}/g, input)
      return { success: true, output: content }
    } catch {
      const content = templateContent.replace(/\{input\}/g, input)
      return { success: true, output: content }
    }
  }

  return { success: false, output: '', error: `未知的文件操作: ${operation}` }
}

// ==================== Pipeline Skill ====================

async function executePipelineSkill(skill: any, input: string): Promise<SkillExecutionResult> {
  if (!skill.steps || skill.steps.length === 0) {
    return { success: false, output: '', error: 'Pipeline 技能未配置步骤' }
  }

  let currentInput = input
  const stepResults: string[] = []

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i]
    console.log(`[Skill Pipeline] Step ${i + 1}/${skill.steps.length}: ${step.name} (${step.toolType})`)

    // Resolve input mapping
    let stepInput = currentInput
    if (step.inputMapping) {
      stepInput = step.inputMapping
        .replace(/\{prevOutput\}/g, currentInput)
        .replace(/\{input\}/g, input)
    }

    const result = await executeStepByType(step.toolType, step.config, stepInput)

    if (!result.success) {
      return {
        success: false,
        output: stepResults.join('\n---\n'),
        error: `Pipeline 步骤 ${i + 1} (${step.name}) 失败: ${result.error}`,
      }
    }

    currentInput = result.output
    stepResults.push(result.output)
  }

  return { success: true, output: currentInput }
}
