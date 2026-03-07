import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModelProviderForm } from './ModelProviderForm'
import { useModels } from '@/hooks/useElectron'
import type { ModelConfig, ProviderType } from '@/types/config'

const providerLabels: Record<ProviderType, string> = {
  'openai-compatible': 'OpenAI 兼容',
  aliyun: '阿里云百炼',
  dashscope: '通义千问',
  anthropic: 'Anthropic',
  google: 'Google AI',
  zhipu: '智谱 AI',
}

const providerColors: Record<ProviderType, string> = {
  'openai-compatible': 'bg-green-500/20 text-green-400',
  aliyun: 'bg-orange-500/20 text-orange-400',
  dashscope: 'bg-purple-500/20 text-purple-400',
  anthropic: 'bg-amber-500/20 text-amber-400',
  google: 'bg-blue-500/20 text-blue-400',
  zhipu: 'bg-cyan-500/20 text-cyan-400',
}

export function ModelProviderList() {
  const { models, saveModels } = useModels()
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = (model: ModelConfig) => {
    saveModels([...models, model])
    setIsCreating(false)
  }

  const handleUpdate = (updated: ModelConfig) => {
    saveModels(models.map((m) => (m.id === updated.id ? updated : m)))
    setEditingModel(null)
  }

  const handleDelete = (id: string) => {
    saveModels(models.filter((m) => m.id !== id))
  }

  const handleToggleActive = (id: string) => {
    saveModels(
      models.map((m) => ({
        ...m,
        isActive: m.id === id,
      }))
    )
  }

  const showForm = isCreating || editingModel !== null

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
            <ModelProviderForm
              model={editingModel ?? undefined}
              onSave={editingModel ? handleUpdate : handleCreate}
              onCancel={() => {
                setEditingModel(null)
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
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[13.5px] font-semibold text-foreground">模型提供商</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  配置 AI 模型端点，支持 OneAPI / NewAPI 等中转平台
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setIsCreating(true)}
                className="h-8 gap-1.5 text-[12.5px]"
              >
                <Plus className="w-3.5 h-3.5" />
                添加模型
              </Button>
            </div>

            {/* Model List */}
            {models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mb-3">
                  <ExternalLink className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-[13px] text-muted-foreground">
                  尚未配置任何模型
                </p>
                <p className="text-[12px] text-muted-foreground/60 mt-1">
                  点击上方「添加模型」开始配置你的 AI 模型
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {models.map((model) => (
                  <motion.div
                    key={model.id}
                    layout
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className={cn(
                      'group flex items-center gap-3 p-3 rounded-xl border transition-colors',
                      model.isActive
                        ? 'border-primary/30 bg-primary/[0.04]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    )}
                  >
                    {/* Active indicator */}
                    <button
                      onClick={() => handleToggleActive(model.id)}
                      className="flex-shrink-0"
                      title={model.isActive ? '当前激活' : '点击设为激活'}
                    >
                      {model.isActive ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" />
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-foreground truncate">
                          {model.name}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10.5px] font-medium',
                            providerColors[model.providerType]
                          )}
                        >
                          {providerLabels[model.providerType]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11.5px] text-muted-foreground/60 truncate">
                          {model.modelName}
                        </span>
                        <span className="text-[10px] text-muted-foreground/30">·</span>
                        <span className="text-[11px] text-muted-foreground/40 truncate max-w-[200px]">
                          {model.baseUrl}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingModel(model)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors"
                        title="编辑"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(model.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
