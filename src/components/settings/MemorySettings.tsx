import React, { useState, useEffect, useCallback } from 'react'
import { Trash2, Brain, AlertTriangle } from 'lucide-react'
import type { Memory } from '@/types/config'

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  preference: { label: '偏好', color: 'text-blue-400 bg-blue-400/10' },
  fact: { label: '事实', color: 'text-green-400 bg-green-400/10' },
  instruction: { label: '指令', color: 'text-amber-400 bg-amber-400/10' },
  context: { label: '上下文', color: 'text-purple-400 bg-purple-400/10' },
}

export function MemorySettings() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const loadMemories = useCallback(async () => {
    if (!window.electronAPI) return
    setLoading(true)
    const list = await window.electronAPI.memoryList()
    setMemories(list || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadMemories() }, [loadMemories])

  const handleDelete = useCallback(async (id: string) => {
    if (!window.electronAPI) return
    await window.electronAPI.memoryDelete(id)
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const handleClearAll = useCallback(async () => {
    if (!window.electronAPI) return
    await window.electronAPI.memoryClear()
    setMemories([])
    setShowClearConfirm(false)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">加载中...</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">AI 记忆</h3>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            AI 会自动从对话中提炼关键信息，并在未来对话中参考
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground/40 tabular-nums">
          {memories.length} / 200
        </span>
      </div>

      {/* Memory List */}
      {memories.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Brain className="w-10 h-10 text-muted-foreground/15 mb-3" />
          <p className="text-[12.5px] text-muted-foreground/50">暂无记忆</p>
          <p className="text-[11px] text-muted-foreground/30 mt-1">
            与 AI 对话后，关键信息会自动保存在这里
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
          {memories.map((memory) => {
            const cat = CATEGORY_LABELS[memory.category] || CATEGORY_LABELS.context
            return (
              <div
                key={memory.id}
                className="group flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cat.color}`}>
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                      {new Date(memory.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-foreground/80 leading-relaxed">
                    {memory.content}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(memory.id)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-all mt-0.5"
                  title="删除此记忆"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Clear All */}
      {memories.length > 0 && (
        <div className="pt-2 border-t border-white/[0.04]">
          {showClearConfirm ? (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-[11.5px] text-red-400/80 flex-1">确定清空所有记忆？此操作不可恢复。</p>
              <button
                onClick={handleClearAll}
                className="text-[11.5px] px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-medium"
              >
                确认清空
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="text-[11.5px] px-2.5 py-1 rounded-md text-muted-foreground hover:bg-white/[0.06] transition-colors"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-[11.5px] text-muted-foreground/50 hover:text-red-400 transition-colors"
            >
              清空所有记忆
            </button>
          )}
        </div>
      )}
    </div>
  )
}
