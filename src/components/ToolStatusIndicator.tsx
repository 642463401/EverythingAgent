import React from 'react'
import { motion } from 'framer-motion'
import {
  Search, Globe, FileText, Pencil, FolderOpen, BarChart3,
  Zap, Package, Rocket, FolderOpenDot, Monitor, FileEdit, Wrench,
  Cloud, TrainFront, Plane, Code, Building2,
} from 'lucide-react'

const TOOL_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  '本地搜索': { icon: Search, color: 'text-yellow-400' },
  '联网搜索': { icon: Globe, color: 'text-blue-400' },
  '读取网页': { icon: FileText, color: 'text-cyan-400' },
  '读取文件': { icon: FileText, color: 'text-green-400' },
  '写入文件': { icon: Pencil, color: 'text-orange-400' },
  '浏览目录': { icon: FolderOpen, color: 'text-yellow-300' },
  '分析数据': { icon: BarChart3, color: 'text-purple-400' },
  '执行命令': { icon: Zap, color: 'text-amber-400' },
  '管理文件': { icon: Package, color: 'text-teal-400' },
  '打开应用': { icon: Rocket, color: 'text-pink-400' },
  '打开文件': { icon: FolderOpenDot, color: 'text-green-300' },
  '桌面控制': { icon: Monitor, color: 'text-indigo-400' },
  '生成文档': { icon: FileEdit, color: 'text-rose-400' },
  '查询城市': { icon: Building2, color: 'text-amber-400' },
  // MCP 工具
  '天气查询': { icon: Cloud, color: 'text-sky-400' },
  '火车票查询': { icon: TrainFront, color: 'text-blue-500' },
  '机票查询': { icon: Plane, color: 'text-indigo-400' },
  '代码解释': { icon: Code, color: 'text-emerald-400' },
  'MCP工具': { icon: Wrench, color: 'text-gray-400' },
}

interface ToolStatusProps {
  label: string
  query: string
}

export function ToolStatusIndicator({ label, query }: ToolStatusProps) {
  const tool = TOOL_ICONS[label] || { icon: Wrench, color: 'text-muted-foreground' }
  const Icon = tool.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] my-1"
    >
      <div className={`flex-shrink-0 ${tool.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-[12px] text-muted-foreground">
        正在{label}:
      </span>
      <span className="text-[12px] text-foreground/70 truncate max-w-[300px]">
        {query}
      </span>
      <motion.div
        className="flex gap-0.5 ml-1"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <div className="w-1 h-1 rounded-full bg-primary/60" />
        <div className="w-1 h-1 rounded-full bg-primary/60" />
        <div className="w-1 h-1 rounded-full bg-primary/60" />
      </motion.div>
    </motion.div>
  )
}

/**
 * Parse tool status lines from the content stream.
 * Pattern: \n{emoji} 正在{label}: "{query}"...\n
 */
const TOOL_STATUS_REGEX = /\n?[\p{Emoji_Presentation}\p{Extended_Pictographic}️]\s*正在([^:：]+)[：:]\s*"([^"]*)"\.{3}\n?/gu
const TASK_PROGRESS_REGEX = /\n?📋\s*任务进度:\s*\[(\d+)\/(\d+)\]\s*(.+?)\.{3}\n?/g

export interface ContentPart {
  type: 'text' | 'tool_status' | 'task_progress'
  text: string
  label?: string
  query?: string
  completed?: number
  total?: number
  currentTask?: string
}

export function parseToolStatus(content: string): ContentPart[] {
  // Collect all matches with positions
  const matches: { index: number; length: number; part: ContentPart }[] = []

  // Tool status matches
  for (const match of content.matchAll(TOOL_STATUS_REGEX)) {
    matches.push({
      index: match.index!,
      length: match[0].length,
      part: {
        type: 'tool_status',
        text: match[0],
        label: match[1].trim(),
        query: match[2],
      },
    })
  }

  // Task progress matches
  for (const match of content.matchAll(TASK_PROGRESS_REGEX)) {
    matches.push({
      index: match.index!,
      length: match[0].length,
      part: {
        type: 'task_progress',
        text: match[0],
        completed: parseInt(match[1]),
        total: parseInt(match[2]),
        currentTask: match[3].trim(),
      },
    })
  }

  // Sort by position
  matches.sort((a, b) => a.index - b.index)

  // Build parts array interleaving text between matches
  const parts: ContentPart[] = []
  let lastIndex = 0

  for (const m of matches) {
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index)
      if (text.trim()) {
        parts.push({ type: 'text', text })
      }
    }
    parts.push(m.part)
    lastIndex = m.index + m.length
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text.trim()) {
      parts.push({ type: 'text', text })
    }
  }

  // If no matches found, return entire content as text
  if (parts.length === 0 && content.trim()) {
    parts.push({ type: 'text', text: content })
  }

  return parts
}
