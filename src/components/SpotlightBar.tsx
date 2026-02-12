import React, { useCallback, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Settings, Loader2, Send, HardDrive, GripHorizontal, Plus, History, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatWindow } from './ChatWindow'
import { SearchResults } from './SearchResults'
import type { ChatMessage, SearchResult, Conversation } from '@/types/config'

interface SpotlightBarProps {
  onOpenSettings: () => void
  hidden?: boolean
}

// ==================== Constants ====================
const COMPACT_HEIGHT = 84   // Must match main.ts
const EXPANDED_HEIGHT = 520 // Must match main.ts
const WINDOW_WIDTH = 720

// ==================== Search Helpers ====================
function isFileSearchQuery(q: string): boolean {
  const t = q.trim()
  return t.startsWith('>') || t.toLowerCase().startsWith('find:') || t.toLowerCase().startsWith('search:')
}
function extractSearchTerm(q: string): string {
  const t = q.trim()
  if (t.startsWith('>')) return t.slice(1).trim()
  if (t.toLowerCase().startsWith('find:')) return t.slice(5).trim()
  if (t.toLowerCase().startsWith('search:')) return t.slice(7).trim()
  return t
}

// ==================== Main Component ====================
export function SpotlightBar({ onOpenSettings, hidden }: SpotlightBarProps) {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Conversation state
  const [conversationId, setConversationId] = useState<string>(crypto.randomUUID())
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])

  // Streaming
  const currentRequestId = useRef<string | null>(null)

  const isInSearchMode = isFileSearchQuery(query)

  // ==================== Window Sizing (Fixed heights, no ResizeObserver) ====================
  const expandWindow = useCallback(async () => {
    await window.electronAPI?.resizeWindow(WINDOW_WIDTH, EXPANDED_HEIGHT)
  }, [])

  const compactWindow = useCallback(async () => {
    await window.electronAPI?.resizeWindow(WINDOW_WIDTH, COMPACT_HEIGHT)
  }, [])

  // ==================== Focus ====================
  useEffect(() => {
    if (hidden) return
    const t = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [hidden])

  useEffect(() => {
    if (!window.electronAPI) return undefined
    const cleanup = window.electronAPI.onToggleWindow(() => {
      setTimeout(() => inputRef.current?.focus(), 150)
    })
    return () => { cleanup() }
  }, [])

  // ==================== Search ====================
  useEffect(() => {
    if (!isInSearchMode) {
      setSearchResults([])
      setIsSearching(false)
      setSelectedIndex(0)
      return
    }
    const term = extractSearchTerm(query)
    if (!term) { setSearchResults([]); setIsSearching(false); return }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    setIsSearching(true)

    searchTimerRef.current = setTimeout(async () => {
      // Expand window for search results
      await expandWindow()

      try {
        if (!window.electronAPI) return
        const result = await window.electronAPI.everythingSearch({ query: term, maxResults: 30 })
        if (result.success) setSearchResults(result.data)
        else setSearchResults([])
      } catch { setSearchResults([]) }
      finally { setIsSearching(false) }
    }, 250)

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [query, isInSearchMode, expandWindow])

  useEffect(() => { setSelectedIndex(0) }, [searchResults])

  // Compact when search closes
  const showSearchPanel = isInSearchMode && (isSearching || searchResults.length > 0 || extractSearchTerm(query).length > 0)
  const showChatPanel = !isInSearchMode && isExpanded && messages.length > 0
  const hasExpandedContent = showSearchPanel || showChatPanel

  useEffect(() => {
    if (!hasExpandedContent && !hidden && !showHistory) {
      compactWindow()
    }
  }, [hasExpandedContent, hidden, compactWindow, showHistory])

  // ==================== Streaming Events ====================
  useEffect(() => {
    if (!window.electronAPI) return undefined

    const c1 = window.electronAPI.onChatStreamChunk((rid, chunk) => {
      if (rid !== currentRequestId.current) return
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === `stream-${rid}`) {
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
        }
        return prev
      })
    })

    const c2 = window.electronAPI.onChatStreamEnd((rid) => {
      if (rid !== currentRequestId.current) return
      currentRequestId.current = null
      setIsLoading(false)
    })

    const c3 = window.electronAPI.onChatStreamError((rid, error) => {
      if (rid !== currentRequestId.current) return
      currentRequestId.current = null
      setIsLoading(false)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.id === `stream-${rid}`) {
          return [...prev.slice(0, -1), { ...last, content: last.content ? `${last.content}\n\n⚠️ ${error}` : `⚠️ ${error}` }]
        }
        return [...prev, { id: `stream-${rid}`, role: 'assistant' as const, content: `⚠️ ${error}`, timestamp: Date.now() }]
      })
    })

    return () => { c1(); c2(); c3() }
  }, [])

  // ==================== Auto-save conversation ====================
  useEffect(() => {
    if (messages.length === 0 || !window.electronAPI) return
    const firstUserMsg = messages.find((m) => m.role === 'user')
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 50) : '新对话'

    window.electronAPI.conversationsSave({
      id: conversationId,
      title,
      messages,
      createdAt: messages[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
    })
  }, [messages, conversationId])

  // ==================== Handlers ====================
  const handleOpenResult = useCallback((r: SearchResult) => { window.electronAPI?.everythingOpen(r.fullPath) }, [])
  const handleRevealResult = useCallback((r: SearchResult) => { window.electronAPI?.everythingReveal(r.fullPath) }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (isInSearchMode && searchResults.length > 0) { handleOpenResult(searchResults[selectedIndex]); return }

    const trimmed = query.trim()
    if (!trimmed || isLoading) return

    // Expand window FIRST, then update state
    await expandWindow()

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setQuery('')
    setIsExpanded(true)
    setIsLoading(true)
    setShowHistory(false)

    const allMessages = [...messages, userMsg]
    const apiMessages = allMessages.map((m) => ({ role: m.role, content: m.content }))

    const requestId = crypto.randomUUID()
    currentRequestId.current = requestId
    setMessages((prev) => [...prev, { id: `stream-${requestId}`, role: 'assistant', content: '', timestamp: Date.now() }])

    try { await window.electronAPI?.chatSend(requestId, apiMessages) } catch { /* handled by events */ }
  }, [query, isLoading, isInSearchMode, searchResults, selectedIndex, handleOpenResult, expandWindow, messages])

  const handleNewChat = useCallback(async () => {
    setMessages([])
    setIsExpanded(false)
    setConversationId(crypto.randomUUID())
    setShowHistory(false)
    setQuery('')
    await compactWindow()
    inputRef.current?.focus()
  }, [compactWindow])

  const handleLoadConversation = useCallback(async (conv: Conversation) => {
    setMessages(conv.messages)
    setConversationId(conv.id)
    setIsExpanded(true)
    setShowHistory(false)
    await expandWindow()
  }, [expandWindow])

  const handleToggleHistory = useCallback(async () => {
    if (showHistory) {
      setShowHistory(false)
      if (!hasExpandedContent) await compactWindow()
    } else {
      const convs = await window.electronAPI?.conversationsList()
      setConversations(convs || [])
      setShowHistory(true)
      await expandWindow()
    }
  }, [showHistory, hasExpandedContent, compactWindow, expandWindow])

  const handleDeleteConversation = useCallback(async (id: string) => {
    await window.electronAPI?.conversationsDelete(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const handleRegenerate = useCallback(async () => {
    if (isLoading || messages.length < 2) return

    // Remove last assistant message
    const newMessages = messages.slice(0, -1)
    setMessages(newMessages)
    setIsLoading(true)

    const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }))
    const requestId = crypto.randomUUID()
    currentRequestId.current = requestId
    setMessages((prev) => [...prev, { id: `stream-${requestId}`, role: 'assistant', content: '', timestamp: Date.now() }])

    try { await window.electronAPI?.chatSend(requestId, apiMessages) } catch { /* handled by events */ }
  }, [messages, isLoading])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isInSearchMode && searchResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((p) => Math.min(p + 1, searchResults.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((p) => Math.max(p - 1, 0)); return }
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleRevealResult(searchResults[selectedIndex]); return }
    }
    if (e.key === 'Escape') {
      if (showHistory) { setShowHistory(false); if (!hasExpandedContent) compactWindow(); }
      else if (isInSearchMode && searchResults.length > 0) { setQuery(''); setSearchResults([]) }
      else if (isExpanded) { handleNewChat() }
      else { window.electronAPI?.hideWindow() }
    }
  }, [isExpanded, isInSearchMode, searchResults, selectedIndex, handleRevealResult, showHistory, hasExpandedContent, compactWindow, handleNewChat])

  if (hidden) return null

  // ==================== Render ====================
  return (
    <div className="w-full h-full flex flex-col">
      <div className="w-full max-w-[720px] mx-auto flex flex-col h-full">
        {/* Drag handle */}
        <div className="h-5 flex items-center justify-center select-none shrink-0 drag-region cursor-default">
          <GripHorizontal className="w-5 h-3.5 text-white/10" />
        </div>

        {/* Main card - fills remaining height */}
        <div className="flex-1 min-h-0 rounded-2xl border border-white/[0.08] bg-[#1a1a1a] overflow-hidden flex flex-col">
          {/* Input Bar */}
          <div className="flex items-center h-14 shrink-0">
            <div className="flex items-center justify-center w-12 h-14 text-muted-foreground">
              {isLoading || isSearching ? <Loader2 className="w-5 h-5 animate-spin text-primary" />
                : isInSearchMode ? <HardDrive className="w-5 h-5 text-yellow-400" />
                : <Search className="w-5 h-5" />}
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入指令... (> 搜索文件, Esc 关闭)"
                className="flex-1 h-14 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none border-none"
                autoComplete="off"
                spellCheck={false}
              />
            </form>

            <div className="flex items-center gap-0.5 pr-2">
              {query.trim() && !isInSearchMode && (
                <button type="button" onClick={handleSubmit as any} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors" title="发送">
                  <Send className="w-4 h-4" />
                </button>
              )}
              {isExpanded && (
                <button type="button" onClick={handleNewChat} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors" title="新对话">
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={handleToggleHistory} className={cn("flex items-center justify-center w-8 h-8 rounded-lg transition-colors", showHistory ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]")} title="历史会话">
                <History className="w-4 h-4" />
              </button>
              <button type="button" onClick={onOpenSettings} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors" title="设置">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content area - fills remaining card space */}
          {(hasExpandedContent || showHistory) && (
            <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.06]">
              {/* History panel */}
              {showHistory && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="px-4 py-2">
                    <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider">历史会话</span>
                  </div>
                  {conversations.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <History className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-[12.5px] text-muted-foreground/50">暂无历史会话</p>
                    </div>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          'group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.04]',
                          conv.id === conversationId && 'bg-primary/10'
                        )}
                        onClick={() => handleLoadConversation(conv)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-foreground truncate">{conv.title}</div>
                          <div className="text-[11px] text-muted-foreground/40 mt-0.5">
                            {conv.messages.length} 条消息 · {new Date(conv.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id) }}
                          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Search results */}
              {!showHistory && showSearchPanel && (
                <SearchResults
                  results={searchResults}
                  isLoading={isSearching}
                  query={extractSearchTerm(query)}
                  selectedIndex={selectedIndex}
                  onSelect={handleOpenResult}
                  onReveal={handleRevealResult}
                />
              )}

              {/* Chat */}
              {!showHistory && showChatPanel && (
                <ChatWindow messages={messages} isLoading={isLoading} onRegenerate={handleRegenerate} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
