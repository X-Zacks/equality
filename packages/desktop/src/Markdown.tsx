import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { memo, useState, useCallback, type ReactNode, type ReactElement } from 'react'

interface MarkdownProps {
  content: string
}

/** 从 <code> 子元素提取语言名（class="language-xxx" → "xxx"） */
function extractLanguage(children: ReactNode): string | null {
  if (!children) return null
  const arr = Array.isArray(children) ? children : [children]
  for (const child of arr) {
    if (child && typeof child === 'object' && 'props' in (child as ReactElement)) {
      const el = child as ReactElement<{ className?: string }>
      const cls = el.props?.className ?? ''
      const match = cls.match(/language-(\S+)/)
      if (match) return match[1]
    }
  }
  return null
}

/** 从 <pre> 的子 <code> 中提取纯文本 */
function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    const el = node as ReactElement<{ children?: ReactNode }>
    return extractText(el.props?.children)
  }
  return ''
}

/** 代码块头部 — 语言标签 + 复制按钮 */
function CodeBlockHeader({ language, children }: { language: string | null; children: ReactNode }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = extractText(children)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [children])

  return (
    <div className="md-code-header">
      <span className="md-code-lang">{language ?? ''}</span>
      <button
        className={`md-code-copy ${copied ? 'copied' : ''}`}
        onClick={handleCopy}
        title="复制代码"
      >
        {copied ? '✓ 已复制' : '复制'}
      </button>
    </div>
  )
}

/** Markdown 渲染组件，支持 GFM（表格/删除线/任务列表）和代码高亮 */
const Markdown = memo(function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // 代码块：语言标签 + 复制按钮
        pre({ children, ...props }) {
          const lang = extractLanguage(children)
          return (
            <div className="md-code-block">
              <CodeBlockHeader language={lang}>{children}</CodeBlockHeader>
              <pre {...props}>{children}</pre>
            </div>
          )
        },
        // 链接在新窗口打开
        a({ href, children, ...props }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

export default Markdown
