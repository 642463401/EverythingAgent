import React, { useState, useCallback } from 'react'
import { SpotlightBar } from './components/SpotlightBar'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { useWindowEvents } from './hooks/useElectron'

function App() {
  const [showSettings, setShowSettings] = useState(false)

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false)
  }, [])

  // Listen for window toggle (close settings on re-show) and settings open from tray
  useWindowEvents(handleCloseSettings, handleOpenSettings)

  return (
    <div className="w-full h-full overflow-hidden">
      {/* Spotlight Input Bar - hidden when settings are open */}
      <SpotlightBar onOpenSettings={handleOpenSettings} hidden={showSettings} />

      {/* Settings Panel - replaces the whole window content */}
      <SettingsPanel open={showSettings} onClose={handleCloseSettings} />
    </div>
  )
}

export default App
