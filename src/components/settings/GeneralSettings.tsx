import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/hooks/useElectron'

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
    </div>
  )
}
