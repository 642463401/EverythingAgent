import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/hooks/useElectron'
import type { CustomMcpService } from '@/types/config'

/** Preset MCP services (must match IDs in electron/tools/mcpService.ts) */
const MCP_SERVICE_PRESETS = [
  { id: 'weather', name: '墨迹天气查询', description: '实时天气、天气预报', icon: '🌤️' },
  { id: 'railway', name: '12306火车票查询', description: '车次、余票、价格', icon: '🚄' },
  { id: 'code-interpreter', name: '代码解释器', description: '在线代码执行', icon: '💻' },
  { id: 'aviation', name: '飞常准机票查询', description: '航班、机票信息', icon: '✈️' },
  { id: 'doc-convert', name: 'md转文档', description: 'Markdown 转 Word/PDF 等格式', icon: '📄' },
  { id: 'amap', name: '高德地图', description: '地图、导航、POI搜索', icon: '🗺️' },
  { id: 'ai-ocr', name: 'AIOCR', description: '多格式文档识别，支持PDF/Office/图片等', icon: '🔍' },
  { id: 'how-to-cook', name: '今天吃什么', description: '菜谱查询、做法推荐', icon: '🍳' },
]

export function GeneralSettings() {
  const { settings, saveSettings } = useSettings()

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">加载中...</span>
      </div>
    )
  }

  const handleChange = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    saveSettings({ ...settings, [key]: value })
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground mb-3">通用设置</h3>

        {/* Global Shortcut */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[12.5px]">全局快捷键</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                激活 Spotlight 窗口的快捷键
              </p>
            </div>
            <Input
              value={settings.globalShortcut}
              onChange={(e) => handleChange('globalShortcut', e.target.value)}
              className="w-[160px] h-8 text-[12.5px] text-center font-mono bg-white/[0.03]"
              placeholder="Alt+Space"
            />
          </div>

          {/* Hide on Blur */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[12.5px]">失焦自动隐藏</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                窗口失去焦点时自动隐藏
              </p>
            </div>
            <Switch
              checked={settings.hideOnBlur}
              onCheckedChange={(val) => handleChange('hideOnBlur', val)}
            />
          </div>

          {/* Language */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[12.5px]">界面语言</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                界面显示语言
              </p>
            </div>
            <Select
              value={settings.language}
              onValueChange={(val) => handleChange('language', val as 'zh-CN' | 'en-US')}
            >
              <SelectTrigger className="w-[160px] h-8 text-[12.5px] bg-white/[0.03]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN" className="text-[12.5px]">简体中文</SelectItem>
                <SelectItem value="en-US" className="text-[12.5px]">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Projects Path */}
          <div className="space-y-1.5">
            <div>
              <Label className="text-[12.5px]">项目存储路径</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                Auto-Coder 生成的项目文件存储位置
              </p>
            </div>
            <Input
              value={settings.projectsPath}
              onChange={(e) => handleChange('projectsPath', e.target.value)}
              className="h-8 text-[12.5px] font-mono bg-white/[0.03]"
              placeholder="~/EverythingAgent/Projects"
            />
          </div>
        </div>
      </div>

      {/* Web Search Section */}
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground mb-3">联网搜索</h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div>
              <Label className="text-[12.5px]">秘塔 AI 搜索 API Key</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                配置后 AI 可自动联网搜索实时信息。
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI?.openExternal?.('https://metaso.cn/search-api/api-keys')
                  }}
                  className="text-blue-400 hover:text-blue-300 ml-1"
                >
                  获取 API Key
                </a>
              </p>
            </div>
            <Input
              type="password"
              value={settings.metasoApiKey || ''}
              onChange={(e) => handleChange('metasoApiKey', e.target.value)}
              className="h-8 text-[12.5px] font-mono bg-white/[0.03]"
              placeholder="输入秘塔 AI 搜索 API Key"
            />
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[11px] text-muted-foreground/60">
              <span className="text-[11.5px] font-medium text-muted-foreground/80">MCP 端点：</span>
              <code className="ml-1 text-blue-400/80 font-mono">https://metaso.cn/api/mcp</code>
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              秘塔 AI 搜索支持网页、学术、文库、图片、视频、播客多维搜索。
              AI 会在需要实时信息时自动调用联网搜索。
            </p>
          </div>
        </div>
      </div>

      {/* MCP Services Section */}
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground mb-3">MCP 扩展服务</h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div>
              <Label className="text-[12.5px]">DashScope API Key</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                配置 API Key 后，开启下方需要的 MCP 服务即可使用。
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI?.openExternal?.('https://dashscope.console.aliyun.com/apiKey')
                  }}
                  className="text-blue-400 hover:text-blue-300 ml-1"
                >
                  获取 API Key
                </a>
              </p>
            </div>
            <Input
              type="password"
              value={settings.dashscopeApiKey || ''}
              onChange={(e) => handleChange('dashscopeApiKey', e.target.value)}
              className="h-8 text-[12.5px] font-mono bg-white/[0.03]"
              placeholder="输入 DashScope API Key"
            />
          </div>

          {/* Amap API Key */}
          <div className="space-y-1.5">
            <div>
              <Label className="text-[12.5px]">高德地图 API Key</Label>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                配置后可使用高德地图 MCP 服务（地图、导航、POI搜索）。
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI?.openExternal?.('https://lbs.amap.com/dev/key/app')
                  }}
                  className="text-blue-400 hover:text-blue-300 ml-1"
                >
                  前往高德开放平台获取
                </a>
              </p>
            </div>
            <Input
              type="password"
              value={settings.amapApiKey || ''}
              onChange={(e) => handleChange('amapApiKey', e.target.value)}
              className="h-8 text-[12.5px] font-mono bg-white/[0.03]"
              placeholder="输入高德地图 API Key"
            />
          </div>

          {/* MCP Service Toggles */}
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2.5">
            <p className="text-[11.5px] font-medium text-muted-foreground/80 mb-2">
              选择启用的 MCP 服务：
            </p>
            {MCP_SERVICE_PRESETS.map((svc) => {
              const enabled = (settings.enabledMcpServices || []).includes(svc.id)
              const isAmap = svc.id === 'amap'
              const canToggle = isAmap ? !!settings.amapApiKey : !!settings.dashscopeApiKey
              return (
                <div key={svc.id} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] shrink-0">{svc.icon}</span>
                    <div className="min-w-0">
                      <span className="text-[12px] text-foreground/90">{svc.name}</span>
                      <span className="text-[10.5px] text-muted-foreground/50 ml-1.5">{svc.description}</span>
                    </div>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={!canToggle}
                    onCheckedChange={(checked) => {
                      const current = settings.enabledMcpServices || []
                      const next = checked
                        ? [...current, svc.id]
                        : current.filter((id: string) => id !== svc.id)
                      handleChange('enabledMcpServices', next)
                    }}
                  />
                </div>
              )
            })}
            {!settings.dashscopeApiKey && (
              <p className="text-[10.5px] text-amber-400/70 mt-1">
                请先配置 DashScope API Key 后再启用服务
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Custom MCP Services Section */}
      <CustomMcpSection settings={settings} onSave={saveSettings} />
    </div>
  )
}

function CustomMcpSection({ settings, onSave }: { settings: any; onSave: (s: any) => void }) {
  const [name, setName] = useState('')
  const [endpoint, setEndpoint] = useState('')

  const customServices: CustomMcpService[] = settings.customMcpServices || []

  const handleAdd = () => {
    if (!name.trim() || !endpoint.trim()) return
    const newService: CustomMcpService = {
      id: crypto.randomUUID(),
      name: name.trim(),
      endpoint: endpoint.trim(),
    }
    onSave({ ...settings, customMcpServices: [...customServices, newService] })
    setName('')
    setEndpoint('')
  }

  const handleDelete = (id: string) => {
    onSave({
      ...settings,
      customMcpServices: customServices.filter((s) => s.id !== id),
    })
  }

  return (
    <div>
      <h3 className="text-[13.5px] font-semibold text-foreground mb-3">自定义 MCP 服务</h3>
      <div className="space-y-3">
        <p className="text-[11px] text-muted-foreground/60">
          添加自定义 MCP 服务端点（SSE 协议），URL 中需包含所需的认证参数。
        </p>

        {/* Existing custom services */}
        {customServices.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
            {customServices.map((svc) => (
              <div key={svc.id} className="flex items-center justify-between gap-2 py-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] shrink-0">🔌</span>
                    <span className="text-[12px] text-foreground/90 truncate">{svc.name}</span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground/40 font-mono truncate ml-[21px]">
                    {svc.endpoint}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(svc.id)}
                  className="shrink-0 text-[11px] text-muted-foreground/50 hover:text-destructive transition-colors px-1.5 py-0.5 rounded hover:bg-destructive/10"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new service */}
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-[12.5px] bg-white/[0.03] flex-shrink-0 w-[120px]"
              placeholder="服务名称"
            />
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="h-8 text-[12.5px] font-mono bg-white/[0.03] flex-1"
              placeholder="SSE 端点地址，如 https://example.com/sse?key=xxx"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!name.trim() || !endpoint.trim()}
              className="h-8 text-[12px] shrink-0"
            >
              添加
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
