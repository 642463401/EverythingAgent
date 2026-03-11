import React from 'react'
import { motion } from 'framer-motion'
import {
  File,
  Folder,
  FolderOpen,
  ExternalLink,
  Image,
  FileText,
  FileCode,
  FileAudio,
  FileVideo,
  FileArchive,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SearchResult } from '@/types/config'

interface SearchResultsProps {
  results: SearchResult[]
  isLoading: boolean
  query: string
  selectedIndex: number
  onSelect: (result: SearchResult) => void
  onReveal: (result: SearchResult) => void
}

/** File extension to icon mapping */
function getFileIcon(fileName: string, isDirectory: boolean) {
  if (isDirectory) return Folder

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'rs', 'go', 'rb', 'php', 'vue', 'svelte', 'css', 'scss', 'html', 'json', 'yaml', 'yml', 'toml', 'xml', 'sql', 'sh', 'bat', 'ps1']
  const docExts = ['txt', 'md', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx', 'csv']
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma']
  const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm']
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']

  if (imageExts.includes(ext)) return Image
  if (codeExts.includes(ext)) return FileCode
  if (docExts.includes(ext)) return FileText
  if (audioExts.includes(ext)) return FileAudio
  if (videoExts.includes(ext)) return FileVideo
  if (archiveExts.includes(ext)) return FileArchive

  return File
}

/** Get accent color based on file type */
function getFileColor(fileName: string, isDirectory: boolean): string {
  if (isDirectory) return 'text-yellow-400'

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'rs', 'go']
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']

  if (codeExts.includes(ext)) return 'text-blue-400'
  if (imageExts.includes(ext)) return 'text-green-400'
  return 'text-muted-foreground'
}

/** Highlight matching portions of the filename */
function highlightMatch(text: string, query: string) {
  if (!query) return text

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
  const lowerText = text.toLowerCase()

  // Find all match ranges
  const ranges: { start: number; end: number }[] = []
  for (const kw of keywords) {
    let idx = 0
    while ((idx = lowerText.indexOf(kw, idx)) !== -1) {
      ranges.push({ start: idx, end: idx + kw.length })
      idx += kw.length
    }
  }

  if (ranges.length === 0) return text

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = [ranges[0]]
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1]
    if (ranges[i].start <= last.end) {
      last.end = Math.max(last.end, ranges[i].end)
    } else {
      merged.push(ranges[i])
    }
  }

  // Build highlighted parts
  const parts: React.ReactNode[] = []
  let cursor = 0
  merged.forEach((range, i) => {
    if (cursor < range.start) {
      parts.push(text.slice(cursor, range.start))
    }
    parts.push(
      <span key={i} className="text-primary font-semibold">
        {text.slice(range.start, range.end)}
      </span>
    )
    cursor = range.end
  })
  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return <>{parts}</>
}

export function SearchResults({
  results,
  isLoading,
  query,
  selectedIndex,
  onSelect,
  onReveal,
}: SearchResultsProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="py-1">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-1.5">
          <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider">
            本地文件搜索
          </span>
          {!isLoading && results.length > 0 && (
            <span className="text-[11px] text-muted-foreground/40">
              {results.length} 个结果
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 px-4 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-[12.5px] text-muted-foreground">搜索中...</span>
          </div>
        )}

        {/* No results */}
        {!isLoading && results.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <File className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-[12.5px] text-muted-foreground/50">
              未找到匹配的文件
            </p>
            <p className="text-[11px] text-muted-foreground/30 mt-0.5">
              尝试使用通配符搜索，如 *.pdf
            </p>
          </div>
        )}

        {/* Results */}
        {!isLoading &&
          results.map((result, index) => {
            const Icon = getFileIcon(result.fileName, result.isDirectory)
            const color = getFileColor(result.fileName, result.isDirectory)
            const isSelected = index === selectedIndex

            return (
              <motion.div
                key={result.fullPath}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.1, delay: Math.min(index * 0.02, 0.3) }}
                className={cn(
                  'group flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-primary/10'
                    : 'hover:bg-white/[0.04]'
                )}
                onClick={() => onSelect(result)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onReveal(result)
                }}
              >
                {/* Icon */}
                <div className={cn('flex-shrink-0', color)}>
                  {result.isDirectory ? (
                    isSelected ? <FolderOpen className="w-4.5 h-4.5" /> : <Folder className="w-4.5 h-4.5" />
                  ) : (
                    <Icon className="w-4.5 h-4.5" />
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-foreground truncate leading-tight">
                    {highlightMatch(result.fileName, query)}
                  </div>
                  <div className="text-[11px] text-muted-foreground/40 truncate mt-0.5 leading-tight">
                    {result.directory}
                  </div>
                </div>

                {/* Action hint */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onReveal(result)
                    }}
                    className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-white/[0.06] transition-colors"
                    title="在资源管理器中显示"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="flex-shrink-0">
                    <span className="text-[10px] text-muted-foreground/30 font-mono">Enter</span>
                  </div>
                )}
              </motion.div>
            )
          })}
      </div>
    </div>
  )
}
