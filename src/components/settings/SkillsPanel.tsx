import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, ArrowLeft, Wrench, Check, Upload, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSkills, useModels, useConfig } from '@/hooks/useElectron'
import type { Skill, SkillToolType, SkillToolItem } from '@/types/skill'

const api = typeof window !== 'undefined' ? (window as any).electronAPI : null

const toolTypeLabels: Record<SkillToolType, string> = {
  llm: 'LLM 模型',
  mcp: 'MCP 服务',
  script: '脚本',
  code: '代码',
  http: 'HTTP 请求',
  file: '文件操作',
}

const toolTypeDescriptions: Record<SkillToolType, string> = {
  llm: '选择已配置的 AI 模型进行推理',
  mcp: '调用已启用的 MCP 服务工具',
  script: '上传或指定可执行脚本文件',
  code: '编写内联代码执行',
  http: '发送 HTTP 请求到指定接口',
  file: '读取、写入或渲染文件',
}

const toolTypeColors: Record<SkillToolType, { active: string; inactive: string; badge: string }> = {
  llm: { active: 'bg-purple-500/20 border-purple-500/40', inactive: 'bg-white/[0.03] border-white/[0.08]', badge: 'bg-purple-500/25 text-purple-300' },
  mcp: { active: 'bg-blue-500/20 border-blue-500/40', inactive: 'bg-white/[0.03] border-white/[0.08]', badge: 'bg-blue-500/25 text-blue-300' },
  script: { active: 'bg-green-500/20 border-green-500/40', inactive: 'bg-white/[0.03] border-white/[0.08]', badge: 'bg-green-500/25 text-green-300' },
  code: { active: 'bg-yellow-500/20 border-yellow-500/40', inactive: 'bg-white/[0.03] border-white/[0.08]', badge: 'bg-yellow-500/25 text-yellow-300' },
  http: { active: 'bg-orange-500/20 border-orange-500/40', inactive: 'bg-white/[0.03] border-white/[0.08]', badge: 'bg-orange-500/25 text-orange-300' },
  file: { active: 'bg-cyan-500/20 border-cyan-500/40', inactive: 'bg-white/[0.03] border-white/[0.08]', badge: 'bg-cyan-500/25 text-cyan-300' },
}

const allToolTypes: SkillToolType[] = ['mcp', 'llm', 'script', 'code', 'http', 'file']

/** Dark-themed select + option styling */
const selectClass = 'w-full px-3 py-2 bg-[#1a1a2e] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 focus:outline-none focus:border-primary/50 [&>option]:bg-[#1a1a2e] [&>option]:text-white/80'

// Known MCP presets (mirrors electron/tools/mcpService.ts)
const MCP_PRESETS = [
  { id: 'weather', name: '墨迹天气查询', icon: '🌤️' },
  { id: 'railway', name: '12306火车票查询', icon: '🚄' },
  { id: 'code-interpreter', name: '代码解释器', icon: '💻' },
  { id: 'aviation', name: '飞常准机票查询', icon: '✈️' },
  { id: 'doc-convert', name: 'md转文档', icon: '📄' },
  { id: 'amap', name: '高德地图', icon: '🗺️' },
  { id: 'ai-ocr', name: 'AIOCR', icon: '🔍' },
  { id: 'how-to-cook', name: '今天吃什么', icon: '🍳' },
]

function createEmptySkill(): Skill {
  return {
    id: crypto.randomUUID(),
    name: '',
    usageRule: '',
    tools: [],
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    enabled: true,
  }
}

// ==================== Tool Config Panels ====================

function McpToolConfig({ item, onChange, enabledMcpIds, customMcpServices }: {
  item: SkillToolItem
  onChange: (item: SkillToolItem) => void
  enabledMcpIds: string[]
  customMcpServices: { id: string; name: string }[]
}) {
  const selectedIds = item.mcpServerIds || []
  // Show only enabled MCP servers
  const availableServers = [
    ...MCP_PRESETS.filter(s => enabledMcpIds.includes(s.id)),
    ...customMcpServices.map(s => ({ id: s.id, name: s.name, icon: '🔧' })),
  ]

  const toggleServer = (id: string) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter(s => s !== id)
      : [...selectedIds, id]
    onChange({ ...item, mcpServerIds: newIds })
  }

  if (availableServers.length === 0) {
    return (
      <p className="text-[11.5px] text-white/30 py-2">
        尚未启用任何 MCP 服务，请在「通用设置」中启用
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {availableServers.map((server) => {
        const selected = selectedIds.includes(server.id)
        return (
          <button
            key={server.id}
            onClick={() => toggleServer(server.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] transition-all',
              selected
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60'
            )}
          >
            <span>{server.icon}</span>
            <span>{server.name}</span>
            {selected && <Check className="w-3 h-3" />}
          </button>
        )
      })}
    </div>
  )
}

function LlmToolConfig({ item, onChange, models }: {
  item: SkillToolItem
  onChange: (item: SkillToolItem) => void
  models: { id: string; name: string; modelName: string }[]
}) {
  if (models.length === 0) {
    return (
      <p className="text-[11.5px] text-white/30 py-2">
        尚未配置任何模型，请在「模型配置」中添加
      </p>
    )
  }

  return (
    <select
      value={item.modelId || ''}
      onChange={(e) => onChange({ ...item, modelId: e.target.value })}
      className={selectClass}
    >
      <option value="">选择模型...</option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>{m.name} ({m.modelName})</option>
      ))}
    </select>
  )
}

function ScriptToolConfig({ item, onChange }: {
  item: SkillToolItem
  onChange: (item: SkillToolItem) => void
}) {
  const handlePickFile = async () => {
    if (!api?.showOpenDialog) return
    const result = await api.showOpenDialog({
      title: '选择脚本文件',
      filters: [
        { name: '脚本文件', extensions: ['py', 'js', 'ts', 'sh', 'bat', 'cmd', 'ps1', 'exe'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (!result.canceled && result.filePaths?.length > 0) {
      onChange({ ...item, scriptPath: result.filePaths[0] })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={item.scriptPath || ''}
          onChange={(e) => onChange({ ...item, scriptPath: e.target.value })}
          className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-primary/50"
          placeholder="脚本文件路径"
        />
        <button
          onClick={handlePickFile}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          选择
        </button>
      </div>
      <input
        value={item.scriptCommand || ''}
        onChange={(e) => onChange({ ...item, scriptCommand: e.target.value })}
        className="w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 font-mono placeholder:text-white/25 focus:outline-none focus:border-primary/50"
        placeholder="执行命令（可选），例如：python {scriptPath} {input}"
      />
    </div>
  )
}

function HttpToolConfig({ item, onChange }: {
  item: SkillToolItem
  onChange: (item: SkillToolItem) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={item.httpMethod || 'GET'}
          onChange={(e) => onChange({ ...item, httpMethod: e.target.value as any })}
          className={cn(selectClass, 'w-24')}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          value={item.httpUrl || ''}
          onChange={(e) => onChange({ ...item, httpUrl: e.target.value })}
          className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 placeholder:text-white/25 font-mono focus:outline-none focus:border-primary/50"
          placeholder="https://api.example.com/endpoint"
        />
      </div>
      <input
        value={item.httpHeaders || ''}
        onChange={(e) => onChange({ ...item, httpHeaders: e.target.value })}
        className="w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 font-mono placeholder:text-white/25 focus:outline-none focus:border-primary/50"
        placeholder='请求头 JSON（可选），如 {"Authorization": "Bearer xxx"}'
      />
      <textarea
        value={item.httpBody || ''}
        onChange={(e) => onChange({ ...item, httpBody: e.target.value })}
        className="w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 font-mono placeholder:text-white/25 resize-none h-16 focus:outline-none focus:border-primary/50"
        placeholder='请求体（可选），如 {"query": "{input}"}'
      />
    </div>
  )
}

function FileToolConfig({ item, onChange }: {
  item: SkillToolItem
  onChange: (item: SkillToolItem) => void
}) {
  const handlePickFile = async () => {
    if (!api?.showOpenDialog) return
    const result = await api.showOpenDialog({
      title: '选择文件',
      properties: ['openFile'],
    })
    if (!result.canceled && result.filePaths?.length > 0) {
      onChange({ ...item, filePath: result.filePaths[0] })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={item.filePath || ''}
          onChange={(e) => onChange({ ...item, filePath: e.target.value })}
          className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-primary/50"
          placeholder="文件路径"
        />
        <button
          onClick={handlePickFile}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          选择
        </button>
      </div>
      <select
        value={item.fileOperation || 'read'}
        onChange={(e) => onChange({ ...item, fileOperation: e.target.value as any })}
        className={selectClass}
      >
        <option value="read">读取文件</option>
        <option value="write">写入文件</option>
        <option value="template">模板渲染</option>
      </select>
    </div>
  )
}

function CodeToolConfig({ item, onChange }: {
  item: SkillToolItem
  onChange: (item: SkillToolItem) => void
}) {
  return (
    <div className="space-y-2">
      <select
        value={item.codeLanguage || 'javascript'}
        onChange={(e) => onChange({ ...item, codeLanguage: e.target.value as any })}
        className={selectClass}
      >
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
      </select>
      <textarea
        value={item.codeContent || ''}
        onChange={(e) => onChange({ ...item, codeContent: e.target.value })}
        className="w-full px-3 py-2 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[12.5px] text-white/80 font-mono placeholder:text-white/25 resize-none h-24 focus:outline-none focus:border-primary/50"
        placeholder="// 在此编写代码，使用 {input} 作为输入占位符"
      />
    </div>
  )
}

// ==================== Tool Card ====================

function ToolCard({ toolType, item, isActive, onToggle, onUpdate, models, enabledMcpIds, customMcpServices }: {
  toolType: SkillToolType
  item?: SkillToolItem
  isActive: boolean
  onToggle: () => void
  onUpdate: (item: SkillToolItem) => void
  models: { id: string; name: string; modelName: string }[]
  enabledMcpIds: string[]
  customMcpServices: { id: string; name: string }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const colors = toolTypeColors[toolType]

  const handleToggle = () => {
    onToggle()
    if (!isActive) setExpanded(true)
    else setExpanded(false)
  }

  const currentItem = item || { type: toolType }

  return (
    <div className={cn(
      'rounded-xl border transition-all overflow-hidden',
      isActive ? colors.active : colors.inactive,
    )}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        onClick={handleToggle}
      >
        <div className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0',
          isActive ? 'border-current bg-current/20' : 'border-white/20'
        )}>
          {isActive && <Check className="w-3 h-3 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <span className={cn('text-[13px] font-medium', isActive ? 'text-white/90' : 'text-white/50')}>
            {toolTypeLabels[toolType]}
          </span>
          <span className={cn('text-[11px] ml-2', isActive ? 'text-white/40' : 'text-white/25')}>
            {toolTypeDescriptions[toolType]}
          </span>
        </div>
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="p-1 text-white/40 hover:text-white/70 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Config panel */}
      <AnimatePresence>
        {isActive && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-white/[0.06]">
              {toolType === 'mcp' && (
                <McpToolConfig item={currentItem} onChange={onUpdate} enabledMcpIds={enabledMcpIds} customMcpServices={customMcpServices} />
              )}
              {toolType === 'llm' && (
                <LlmToolConfig item={currentItem} onChange={onUpdate} models={models} />
              )}
              {toolType === 'script' && (
                <ScriptToolConfig item={currentItem} onChange={onUpdate} />
              )}
              {toolType === 'http' && (
                <HttpToolConfig item={currentItem} onChange={onUpdate} />
              )}
              {toolType === 'file' && (
                <FileToolConfig item={currentItem} onChange={onUpdate} />
              )}
              {toolType === 'code' && (
                <CodeToolConfig item={currentItem} onChange={onUpdate} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ==================== Skill Form ====================

function SkillForm({ skill, onSave, onCancel }: {
  skill?: Skill
  onSave: (skill: Skill) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Skill>(skill ? { ...skill, tools: [...(skill.tools || [])] } : createEmptySkill())
  const { models } = useModels()
  const { config } = useConfig()

  const enabledMcpIds = config?.settings?.enabledMcpServices || []
  const customMcpServices = config?.settings?.customMcpServices || []

  const handleSave = () => {
    if (!form.name.trim()) return
    onSave({ ...form, updatedAt: Date.now() })
  }

  const isToolActive = (type: SkillToolType) => form.tools.some(t => t.type === type)
  const getToolItem = (type: SkillToolType) => form.tools.find(t => t.type === type)

  const toggleTool = (type: SkillToolType) => {
    if (isToolActive(type)) {
      setForm({ ...form, tools: form.tools.filter(t => t.type !== type) })
    } else {
      setForm({ ...form, tools: [...form.tools, { type }] })
    }
  }

  const updateToolItem = (type: SkillToolType, item: SkillToolItem) => {
    const newTools = form.tools.map(t => t.type === type ? { ...item, type } : t)
    setForm({ ...form, tools: newTools })
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onCancel}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-white/50 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="text-[14px] font-semibold text-white/90">
          {skill ? '编辑技能' : '创建技能'}
        </h3>
      </div>

      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
        {/* Skill Name */}
        <div>
          <label className="text-[12px] font-medium text-white/70 mb-1.5 block">技能名称</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[13px] text-white/90 placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors"
            placeholder="例如：网络信息整合报告"
          />
        </div>

        {/* Usage Rule */}
        <div>
          <label className="text-[12px] font-medium text-white/70 mb-1 block">使用规则</label>
          <p className="text-[11px] text-white/35 mb-2">
            描述何时触发此技能及执行流程，用 {'{工具名}'} 引用下方已启用的工具
          </p>
          <textarea
            value={form.usageRule}
            onChange={(e) => setForm({ ...form, usageRule: e.target.value })}
            className="w-full px-3 py-3 bg-white/[0.06] border border-white/[0.1] rounded-lg text-[13px] text-white/90 placeholder:text-white/25 resize-none h-28 leading-relaxed focus:outline-none focus:border-primary/50 transition-colors"
            placeholder={`例如：当需要整合网络信息搜索报告时，调用{MCP}获取信息后返回Markdown，整合信息后，调用{脚本}转换为PDF文档。`}
          />
        </div>

        {/* Tool Selection with Configs */}
        <div>
          <label className="text-[12px] font-medium text-white/70 mb-1 block">可用工具</label>
          <p className="text-[11px] text-white/35 mb-3">
            勾选工具并配置参数，供上方使用规则调用
          </p>
          <div className="space-y-2">
            {allToolTypes.map((type) => (
              <ToolCard
                key={type}
                toolType={type}
                item={getToolItem(type)}
                isActive={isToolActive(type)}
                onToggle={() => toggleTool(type)}
                onUpdate={(item) => updateToolItem(type, item)}
                models={models || []}
                enabledMcpIds={enabledMcpIds}
                customMcpServices={customMcpServices}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-white/[0.06]">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 text-[12.5px] text-white/60 hover:text-white/90">
          取消
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!form.name.trim()} className="h-8 text-[12.5px]">
          保存
        </Button>
      </div>
    </div>
  )
}

// ==================== Skills Panel (Main) ====================

export function SkillsPanel() {
  const { skills, saveSkill, deleteSkill } = useSkills()
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = (skill: Skill) => {
    saveSkill(skill)
    setIsCreating(false)
  }

  const handleUpdate = (updated: Skill) => {
    saveSkill(updated)
    setEditingSkill(null)
  }

  const handleToggleEnabled = (skill: Skill) => {
    saveSkill({ ...skill, enabled: !skill.enabled, updatedAt: Date.now() })
  }

  const showForm = isCreating || editingSkill !== null

  return (
    <div className="p-4">
      <AnimatePresence mode="wait">
        {showForm ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <SkillForm
              skill={editingSkill ?? undefined}
              onSave={editingSkill ? handleUpdate : handleCreate}
              onCancel={() => {
                setEditingSkill(null)
                setIsCreating(false)
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[14px] font-semibold text-white/90">技能配置</h3>
                <p className="text-[12px] text-white/50 mt-0.5">
                  创建自定义技能，扩展 Agent 的能力
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="h-8 gap-1.5 text-[12.5px]"
              >
                <Plus className="w-3.5 h-3.5" />
                新建技能
              </Button>
            </div>

            {/* Skill List */}
            {skills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center mb-3">
                  <Wrench className="w-6 h-6 text-white/30" />
                </div>
                <p className="text-[13px] text-white/60">
                  尚未创建任何技能
                </p>
                <p className="text-[12px] text-white/35 mt-1">
                  点击上方「新建技能」开始创建
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {skills.map((skill) => (
                  <motion.div
                    key={skill.id}
                    layout
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className={cn(
                      'group flex items-center gap-3 p-3 rounded-xl border transition-colors',
                      skill.enabled
                        ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]'
                        : 'border-white/[0.04] bg-white/[0.01] opacity-50'
                    )}
                  >
                    {/* Enable toggle */}
                    <button
                      onClick={() => handleToggleEnabled(skill)}
                      className={cn(
                        'flex-shrink-0 w-8 h-[18px] rounded-full transition-colors relative',
                        skill.enabled ? 'bg-primary' : 'bg-white/[0.15]'
                      )}
                    >
                      <div className={cn(
                        'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform',
                        skill.enabled ? 'translate-x-[16px]' : 'translate-x-[2px]'
                      )} />
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-white/90 truncate">
                          {skill.name}
                        </span>
                        <div className="flex gap-1 flex-shrink-0">
                          {(skill.tools || []).map((tool) => (
                            <span
                              key={typeof tool === 'string' ? tool : tool.type}
                              className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                                toolTypeColors[typeof tool === 'string' ? tool as SkillToolType : tool.type]?.badge || 'bg-white/10 text-white/40'
                              )}
                            >
                              {toolTypeLabels[typeof tool === 'string' ? tool as SkillToolType : tool.type] || (typeof tool === 'string' ? tool : tool.type)}
                            </span>
                          ))}
                        </div>
                      </div>
                      {skill.usageRule && (
                        <p className="text-[11.5px] text-white/40 truncate mt-0.5">
                          {skill.usageRule}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingSkill(skill)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-colors"
                        title="编辑"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSkill(skill.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
