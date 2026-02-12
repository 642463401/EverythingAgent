import React, { useState, useCallback } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import type { Components } from 'react-markdown'

/**
 * Copy button for code blocks.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground/60 hover:text-foreground/80 hover:bg-white/[0.08] transition-colors"
      title="复制代码"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

/**
 * Custom renderers for react-markdown, matching the dark chat theme.
 */
export const markdownComponents: Partial<Components> = {
  // Code blocks and inline code
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const codeString = String(children).replace(/\n$/, '')
    const isBlock = match || codeString.includes('\n')

    if (isBlock) {
      return (
        <div className="relative group my-2">
          <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.06] rounded-t-lg">
            <span className="text-[11px] text-muted-foreground/50 font-mono">
              {match?.[1] || 'code'}
            </span>
            <CopyButton text={codeString} />
          </div>
          <pre className="!mt-0 !rounded-t-none overflow-x-auto bg-white/[0.03] p-3">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        </div>
      )
    }

    return (
      <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[12.5px] font-mono text-primary/90" {...props}>
        {children}
      </code>
    )
  },

  // Links - open in external browser
  a({ href, children }) {
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault()
      if (href) {
        window.electronAPI?.openExternal(href)
      }
    }

    return (
      <a
        href={href}
        onClick={handleClick}
        className="text-primary hover:text-primary/80 underline underline-offset-2 inline-flex items-center gap-0.5 cursor-pointer"
      >
        {children}
        <ExternalLink className="w-3 h-3 inline-block" />
      </a>
    )
  },

  // Tables
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="w-full text-[12.5px] border-collapse">
          {children}
        </table>
      </div>
    )
  },

  thead({ children }) {
    return (
      <thead className="bg-white/[0.04]">
        {children}
      </thead>
    )
  },

  th({ children }) {
    return (
      <th className="px-3 py-1.5 text-left font-medium text-foreground/80 border-b border-white/[0.08]">
        {children}
      </th>
    )
  },

  td({ children }) {
    return (
      <td className="px-3 py-1.5 border-b border-white/[0.04] text-foreground/70">
        {children}
      </td>
    )
  },

  // Block quotes
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/70 italic">
        {children}
      </blockquote>
    )
  },

  // Lists
  ul({ children }) {
    return <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>
  },

  ol({ children }) {
    return <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>
  },

  li({ children }) {
    return <li className="text-foreground/85">{children}</li>
  },

  // Headings
  h1({ children }) {
    return <h1 className="text-lg font-bold mt-3 mb-1.5 text-foreground">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-base font-bold mt-2.5 mb-1 text-foreground">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h3>
  },

  // Paragraphs
  p({ children }) {
    return <p className="my-1 leading-relaxed">{children}</p>
  },

  // Horizontal rules
  hr() {
    return <hr className="my-3 border-white/[0.08]" />
  },

  // Images
  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full rounded-lg my-2"
        loading="lazy"
      />
    )
  },
}
