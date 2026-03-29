/**
 * pythonHelper.ts
 * Locates the bundled Python interpreter packed inside app resources.
 * Used by commandRunner to inject bundled Python into PATH.
 */

import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

// Cached result — null means "not found", undefined means "not checked yet"
let _bundledPythonDir: string | null | undefined = undefined

/**
 * Returns the directory containing bundled python.exe, or null if not available.
 * Works in both development mode and packaged mode.
 */
export function getBundledPythonDir(): string | null {
  if (_bundledPythonDir !== undefined) return _bundledPythonDir

  try {
    let resourcesDir: string
    if (app.isPackaged) {
      // Packaged: resources extracted next to the app by electron-builder extraResources
      resourcesDir = process.resourcesPath
    } else {
      // Dev: resources/ folder in project root
      resourcesDir = path.join(app.getAppPath(), 'resources')
    }

    const pythonDir = path.join(resourcesDir, 'python')
    const pythonExe = path.join(pythonDir, 'python.exe')

    if (fs.existsSync(pythonExe)) {
      _bundledPythonDir = pythonDir
      console.log('[Python] Bundled Python found:', pythonDir)
    } else {
      _bundledPythonDir = null
      console.log('[Python] Bundled Python not found at:', pythonDir, '— will use system Python')
    }
  } catch (err) {
    console.warn('[Python] Error locating bundled Python:', err)
    _bundledPythonDir = null
  }

  return _bundledPythonDir
}
