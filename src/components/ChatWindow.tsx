import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bot, User, Loader2, Copy, Check, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { cn } from '@/lib/utils'
import { markdownComponents } from './MarkdownComponents'
import { ToolStatusIndicator, parseToolStatus } from './ToolStatusIndicator'
import { TaskProgressIndicator } from './TaskProgressIndicator'
import type { ChatMessage } from '@/types/config'

interface ChatWindowProps {
  messages: ChatMessage[]
  isLoading: boolean
  onRegenerate?: () => void
}

// Mode badge extraction
const MODE_REGEX = /^\[?(生活助手|工作助手|编程助手|文件管家)\]?\s*/

const MODE_STYLES: Record<string, string> = {
  '生活助手': 'bg-green-500/15 text-green-400',
  '工作助手': 'bg-blue-500/15 text-blue-400',
  '编程助手': 'bg-purple-500/15 text-purple-400',
  '文件管家': 'bg-orange-500/15 text-orange-400',
}

export function ChatWindow({ messages, isLoading, onRegenerate }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1"
    >
      <div className="flex flex-col gap-3 p-4">
        {messages.map((msg, i) => {
          // Skip empty assistant placeholders while streaming
          if (msg.role === 'assistant' && !msg.content && i === messages.length - 1 && isLoading) {
            return null
          }

          const isLast = i === messages.length - 1
          const isLastAssistant = msg.role === 'assistant' && isLast && !isLoading

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group flex gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}

              <div className="flex flex-col max-w-[85%]">
                <div
                  className={cn(
                    'rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-white/[0.05] text-foreground/90 rounded-bl-md'
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  ) : (
                    <MessageContent content={msg.content} />
                  )}
                </div>

                {/* Action buttons for messages */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyMessageButton content={msg.content} />
                    {isLastAssistant && onRegenerate && (
                      <button
                        onClick={onRegenerate}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground/50 hover:text-foreground/70 hover:bg-white/[0.06] transition-colors"
                        title="重新生成"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center mt-0.5">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          )
        })}

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 items-start"
          >
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
            <div className="bg-white/[0.05] rounded-xl rounded-bl-md px-3.5 py-2.5">
              <div className="flex gap-1.5">
                <motion.div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} />
                <motion.div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} />
                <motion.div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} />
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    // Strip tool status and task progress lines from copied content
    const clean = content
      .replace(/\n?[\p{Emoji_Presentation}\p{Extended_Pictographic}️]\s*正在[^:：]+[：:]\s*"[^"]*"\.{3}\n?/gu, '\n')
      .replace(/\n?📋\s*任务进度:\s*\[\d+\/\d+\]\s*.+?\.{3}\n?/g, '\n')
      .trim()
    navigator.clipboard.writeText(clean)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground/50 hover:text-foreground/70 hover:bg-white/[0.06] transition-colors"
      title="复制消息"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function MessageContent({ content }: { content: string }) {
  // Extract mode tag
  const modeMatch = content.match(MODE_REGEX)
  const mode = modeMatch?.[1]
  const textAfterMode = modeMatch ? content.slice(modeMatch[0].length) : content

  // Parse tool status lines from content
  const parts = parseToolStatus(textAfterMode)

  return (
    <div>
      {mode && (
        <span className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium mb-2',
          MODE_STYLES[mode] || 'bg-primary/15 text-primary'
        )}>
          {mode}
        </span>
      )}

      {parts.map((part, i) => {
        if (part.type === 'tool_status') {
          return (
            <ToolStatusIndicator
              key={`ts-${i}`}
              label={part.label!}
              query={part.query!}
            />
          )
        }

        if (part.type === 'task_progress') {
          return (
            <TaskProgressIndicator
              key={`tp-${i}`}
              completed={part.completed!}
              total={part.total!}
              currentTask={part.currentTask!}
            />
          )
        }

        return (
          <div key={`md-${i}`} className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {part.text}
            </ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}
