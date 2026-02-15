import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bot, Sliders, ArrowLeft, GripHorizontal, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModelProviderList } from './ModelProviderList'
import { GeneralSettings } from './GeneralSettings'
import { MemorySettings } from './MemorySettings'

type SettingsTab = 'models' | 'general' | 'memory'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const SETTINGS_WIDTH = 660
const SETTINGS_HEIGHT = 540
const COMPACT_WIDTH = 720
const COMPACT_HEIGHT = 84 // Must match main.ts INITIAL_HEIGHT

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'models', label: '模型配置', icon: <Bot className="w-4 h-4" /> },
  { id: 'general', label: '通用设置', icon: <Sliders className="w-4 h-4" /> },
  { id: 'memory', label: 'AI 记忆', icon: <Brain className="w-4 h-4" /> },
]

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models')

  // Resize window when settings opens/closes
  useEffect(() => {
    if (!window.electronAPI) return

    if (open) {
      ;(async () => {
        const bounds = await window.electronAPI.getWindowBounds()
        if (!bounds) return
        const newX = Math.round(bounds.x + (bounds.width - SETTINGS_WIDTH) / 2)
        const newY = Math.round(bounds.screen.y + (bounds.screen.height - SETTINGS_HEIGHT) / 2)
        await window.electronAPI.setWindowBounds({
          x: Math.max(bounds.screen.x, newX),
          y: Math.max(bounds.screen.y, newY),
          width: SETTINGS_WIDTH,
          height: SETTINGS_HEIGHT,
        })
      })()
    } else {
      ;(async () => {
        const bounds = await window.electronAPI.getWindowBounds()
        if (!bounds) return
        const newX = Math.round(bounds.screen.x + (bounds.screen.width - COMPACT_WIDTH) / 2)
        await window.electronAPI.setWindowBounds({
          x: newX,
          y: bounds.screen.y + 180,
          width: COMPACT_WIDTH,
          height: COMPACT_HEIGHT,
        })
      })()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="w-full h-screen flex flex-col bg-[#1a1a1a] rounded-2xl overflow-hidden">
      {/* Drag handle - uses native drag-region to avoid setPosition bugs on Windows */}
      <div className="flex items-center justify-center h-5 select-none drag-region cursor-default">
        <GripHorizontal className="w-5 h-3.5 text-muted-foreground/20" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-[15px] font-semibold text-foreground">设置</h2>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 px-4 py-2 border-b border-white/[0.04]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-white/[0.08] text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">
          {activeTab === 'models' && (
            <motion.div
              key="models"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <ModelProviderList />
            </motion.div>
          )}
          {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <GeneralSettings />
            </motion.div>
          )}
          {activeTab === 'memory' && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <MemorySettings />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
