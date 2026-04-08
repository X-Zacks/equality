/**
 * TaskProgressBar.tsx — Plan 整体进度面板
 *
 * Phase N4 (N4.2.3): 显示 Plan 执行进度
 */

// Phase N4 (N4.2.3)

interface TaskProgressBarProps {
  title: string
  completedNodes: number
  totalNodes: number
  runningNodeName?: string
  estimatedRemainingMs?: number
}

export default function TaskProgressBar({
  title,
  completedNodes,
  totalNodes,
  runningNodeName,
  estimatedRemainingMs,
}: TaskProgressBarProps) {
  const percent = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0
  const isComplete = completedNodes === totalNodes && totalNodes > 0

  const remainingText = estimatedRemainingMs != null
    ? estimatedRemainingMs > 60_000
      ? `~${Math.ceil(estimatedRemainingMs / 60_000)} min`
      : `~${Math.ceil(estimatedRemainingMs / 1000)}s`
    : undefined

  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 8,
      backgroundColor: 'var(--panel-bg, #f8f9fa)',
      border: '1px solid var(--border-color, #e2e8f0)',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>📋</span>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>
        {isComplete && <span style={{ fontSize: 12, color: '#22c55e' }}>已完成 ✅</span>}
      </div>

      {/* 进度条 */}
      <div style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: 'var(--progress-bg, #e2e8f0)',
        overflow: 'hidden',
        marginBottom: 4,
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 3,
          backgroundColor: isComplete ? '#22c55e' : '#3b82f6',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* 文字信息 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
        <span>{percent}% ({completedNodes}/{totalNodes})</span>
        <span>
          {runningNodeName && `运行中: ${runningNodeName}`}
          {runningNodeName && remainingText && ' | '}
          {remainingText && `预计剩余: ${remainingText}`}
        </span>
      </div>
    </div>
  )
}
