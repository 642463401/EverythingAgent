import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Eye, EyeOff, TestTube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ModelConfig, ProviderType } from '@/types/config'

interface ModelProviderFormProps {
  model?: ModelConfig
  onSave: (model: ModelConfig) => void
  onCancel: () => void
}

const providerOptions: { value: ProviderType; label: string; placeholder: string }[] = [
  {
    value: 'openai-compatible',
    label: 'OpenAI 兼容 (通用)',
    placeholder: 'https://api.openai.com/v1',
  },
  {
    value: 'aliyun',
    label: '阿里云百炼',
    placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    value: 'dashscope',
    label: '通义千问 DashScope',
    placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    placeholder: 'https://api.anthropic.com/v1',
  },
  {
    value: 'google',
    label: 'Google AI',
    placeholder: 'https://generativelanguage.googleapis.com/v1beta',
  },
]

const modelSuggestions: Record<ProviderType, string[]> = {
  'openai-compatible': ['gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo', 'deepseek-chat', 'deepseek-reasoner', 'qwen-max'],
  aliyun: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
  dashscope: ['qwen-max', 'qwen-max-latest', 'qwen-plus', 'qwen-plus-latest', 'qwen-turbo', 'qwen-turbo-latest', 'qwen-long', 'qwen-vl-max', 'qwen-vl-plus', 'qwen2.5-72b-instruct', 'qwen2.5-coder-32b-instruct'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  google: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
}

export function ModelProviderForm({ model, onSave, onCancel }: ModelProviderFormProps) {
  const isEdit = !!model

  const [formData, setFormData] = useState<Omit<ModelConfig, 'id' | 'isActive'>>({
    providerType: model?.providerType ?? 'openai-compatible',
    name: model?.name ?? '',
    baseUrl: model?.baseUrl ?? '',
    apiKey: model?.apiKey ?? '',
    modelName: model?.modelName ?? '',
  })

  const [showApiKey, setShowApiKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  const currentProvider = providerOptions.find((p) => p.value === formData.providerType)!

  const handleChange = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleProviderChange = (value: ProviderType) => {
    const provider = providerOptions.find((p) => p.value === value)!
    setFormData((prev) => ({
      ...prev,
      providerType: value,
      baseUrl: prev.baseUrl || provider.placeholder,
    }))
  }

  const handleTestConnection = async () => {
    setTestStatus('testing')

    try {
      // Simple connectivity test: hit the models endpoint
      const url = formData.baseUrl.replace(/\/+$/, '') + '/models'
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${formData.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok || response.status === 200) {
        setTestStatus('success')
      } else {
        setTestStatus('error')
      }
    } catch {
      setTestStatus('error')
    }

    // Reset after a few seconds
    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const config: ModelConfig = {
      id: model?.id ?? uuidv4(),
      ...formData,
      isActive: model?.isActive ?? false,
    }

    onSave(config)
  }

  const isValid =
    formData.name.trim() &&
    formData.baseUrl.trim() &&
    formData.apiKey.trim() &&
    formData.modelName.trim()

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-foreground">
          {isEdit ? '编辑模型配置' : '添加新模型'}
        </h3>
      </div>

      {/* Provider Type */}
      <div className="space-y-1.5">
        <Label className="text-[12.5px] text-muted-foreground">提供商类型</Label>
        <Select value={formData.providerType} onValueChange={handleProviderChange}>
          <SelectTrigger className="h-9 text-[13px] bg-white/[0.03]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-[13px]">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Display Name */}
      <div className="space-y-1.5">
        <Label className="text-[12.5px] text-muted-foreground">显示名称</Label>
        <Input
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="例如: 我的 OneAPI、DeepSeek Pro"
          className="h-9 text-[13px] bg-white/[0.03]"
        />
      </div>

      {/* Base URL - CRITICAL */}
      <div className="space-y-1.5">
        <Label className="text-[12.5px] text-muted-foreground">
          API 端点 (Base URL) <span className="text-primary">*关键配置*</span>
        </Label>
        <Input
          value={formData.baseUrl}
          onChange={(e) => handleChange('baseUrl', e.target.value)}
          placeholder={currentProvider.placeholder}
          className="h-9 text-[13px] bg-white/[0.03] font-mono"
        />
        <p className="text-[11px] text-muted-foreground/50">
          支持自定义端点，如 OneAPI/NewAPI 中转地址
        </p>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <Label className="text-[12.5px] text-muted-foreground">API Key</Label>
        <div className="relative">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={formData.apiKey}
            onChange={(e) => handleChange('apiKey', e.target.value)}
            placeholder="sk-..."
            className="h-9 text-[13px] bg-white/[0.03] font-mono pr-10"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showApiKey ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Model Name */}
      <div className="space-y-1.5">
        <Label className="text-[12.5px] text-muted-foreground">
          模型名称 (Model ID) <span className="text-primary">*关键配置*</span>
        </Label>
        <Input
          value={formData.modelName}
          onChange={(e) => handleChange('modelName', e.target.value)}
          placeholder="例如: gpt-4-turbo, claude-3-5-sonnet, qwen-max"
          className="h-9 text-[13px] bg-white/[0.03] font-mono"
        />
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {modelSuggestions[formData.providerType].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleChange('modelName', suggestion)}
              className="px-2 py-0.5 rounded-md text-[11px] bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleTestConnection}
          disabled={!formData.baseUrl || !formData.apiKey || testStatus === 'testing'}
          className="h-8 gap-1.5 text-[12.5px]"
        >
          <TestTube className="w-3.5 h-3.5" />
          {testStatus === 'testing'
            ? '测试中...'
            : testStatus === 'success'
            ? '连接成功!'
            : testStatus === 'error'
            ? '连接失败'
            : '测试连接'}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 text-[12.5px]"
          >
            取消
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!isValid}
            className="h-8 text-[12.5px]"
          >
            {isEdit ? '保存更改' : '添加模型'}
          </Button>
        </div>
      </div>
    </form>
  )
}
