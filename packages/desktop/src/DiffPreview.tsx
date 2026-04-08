/**
 * DiffPreview.tsx — Diff 预览组件
 *
 * Phase N6 (N6.4.1): 在文件写入前展示变更差异
 * - 简单文本 diff 展示（统一差异格式）
 * - Accept / Reject 按钮
 * - 新文件全绿展示
 */

import { useMemo } from 'react'

interface DiffPreviewProps {
  /** 文件路径 */
  filePath: string
  /** 原始内容（null = 新文件） */
  originalContent: string | null
  /** 新内容 */
  newContent: string
  /** 接受回调 */
  onAccept: () => void
  /** 拒绝回调 */
  onReject: () => void
}

// ─── 简单 diff 算法 ─────────────────────────────────────────────────────────

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  lineNum?: number
}

/**
 * 简单行级 diff。
 * 不使用外部库，适用于中小文件预览。
 */
function computeDiff(original: string | null, updated: string): DiffLine[] {
  if (original === null) {
    // 新文件：全部是新增
    return updated.split('\n').map((line, i) => ({
      type: 'add' as const,
      content: line,
      lineNum: i + 1,
    }))
  }

  const oldLines = original.split('\n')
  const newLines = updated.split('\n')
  const result: DiffLine[] = []

  // 简单行级 diff（适用于 <1000 行的预览）
  let oi = 0
  let ni = 0

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'context', content: oldLines[oi], lineNum: ni + 1 })
      oi++
      ni++
    } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.slice(oi).includes(newLines[ni]))) {
      result.push({ type: 'add', content: newLines[ni], lineNum: ni + 1 })
      ni++
    } else if (oi < oldLines.length) {
      result.push({ type: 'remove', content: oldLines[oi] })
      oi++
    }
  }

  return result
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export default function DiffPreview({
  filePath,
  originalContent,
  newContent,
  onAccept,
  onReject,
}: DiffPreviewProps) {
  const diffLines = useMemo(
    () => computeDiff(originalContent, newContent),
    [originalContent, newContent],
  )

  const addCount = diffLines.filter(l => l.type === 'add').length
  const removeCount = diffLines.filter(l => l.type === 'remove').length
  const isNewFile = originalContent === null

  return (
    <div style={{
      border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: 8,
      overflow: 'hidden',
      margin: '8px 0',
      fontSize: 13,
    }}>
      {/* 标题栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        backgroundColor: 'var(--panel-bg, #f8f9fa)',
        borderBottom: '1px solid var(--border-color, #e2e8f0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📄</span>
          <span style={{ fontWeight: 600 }}>{filePath}</span>
          {isNewFile && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 500 }}>NEW</span>}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          <span style={{ color: '#22c55e' }}>+{addCount}</span>
          {' '}
          <span style={{ color: '#ef4444' }}>-{removeCount}</span>
        </div>
      </div>

      {/* Diff 内容 */}
      <div style={{
        maxHeight: 400,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: '20px',
      }}>
        {diffLines.map((line, i) => (
          <div
            key={i}
            style={{
              padding: '0 12px',
              backgroundColor:
                line.type === 'add' ? 'rgba(34, 197, 94, 0.1)' :
                line.type === 'remove' ? 'rgba(239, 68, 68, 0.1)' :
                'transparent',
              borderLeft: `3px solid ${
                line.type === 'add' ? '#22c55e' :
                line.type === 'remove' ? '#ef4444' :
                'transparent'
              }`,
              whiteSpace: 'pre',
            }}
          >
            <span style={{ color: '#9ca3af', width: 40, display: 'inline-block', textAlign: 'right', marginRight: 8 }}>
              {line.lineNum ?? ''}
            </span>
            <span style={{
              color: line.type === 'add' ? '#22c55e' :
                     line.type === 'remove' ? '#ef4444' :
                     'inherit',
            }}>
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              {line.content}
            </span>
          </div>
        ))}
      </div>

      {/* Accept / Reject 按钮 */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        padding: '8px 12px',
        borderTop: '1px solid var(--border-color, #e2e8f0)',
        backgroundColor: 'var(--panel-bg, #f8f9fa)',
      }}>
        <button
          onClick={onReject}
          style={{
            padding: '4px 16px',
            borderRadius: 4,
            border: '1px solid #e2e8f0',
            backgroundColor: 'white',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Reject ❌
        </button>
        <button
          onClick={onAccept}
          style={{
            padding: '4px 16px',
            borderRadius: 4,
            border: '1px solid #22c55e',
            backgroundColor: '#22c55e',
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Accept ✅
        </button>
      </div>
    </div>
  )
}
