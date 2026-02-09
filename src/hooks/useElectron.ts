import { useEffect, useState, useCallback } from 'react'
import type { ModelConfig, AppSettings, AppConfig } from '../types/config'

const api = typeof window !== 'undefined' ? window.electronAPI : null

/** Hook for accessing app configuration */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const data = await api.getConfig()
      setConfig(data)
    } catch (err) {
      console.error('Failed to load config:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { config, loading, refresh }
}

/** Hook for managing model configurations */
export function useModels() {
  const [models, setModels] = useState<ModelConfig[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const data = await api.getModels()
      setModels(data)
    } catch (err) {
      console.error('Failed to load models:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveModels = useCallback(async (newModels: ModelConfig[]) => {
    if (!api) return
    try {
      const result = await api.setModels(newModels)
      setModels(result)
    } catch (err) {
      console.error('Failed to save models:', err)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { models, loading, saveModels, refresh }
}

/** Hook for managing app settings */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const data = await api.getSettings()
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    if (!api) return
    try {
      const result = await api.setSettings(newSettings)
      setSettings(result)
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { settings, loading, saveSettings, refresh }
}

/** Hook for window toggle events */
export function useWindowEvents(onToggle?: () => void, onShowSettings?: () => void) {
  useEffect(() => {
    if (!api) return
    const cleanups: (() => void)[] = []

    if (onToggle) {
      cleanups.push(api.onToggleWindow(onToggle))
    }
    if (onShowSettings) {
      cleanups.push(api.onShowSettings(onShowSettings))
    }

    return () => cleanups.forEach((fn) => fn())
  }, [onToggle, onShowSettings])
}
