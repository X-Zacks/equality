/**
 * StatusBadge.tsx — 任务状态徽标组件
 *
 * Phase N4 (N4.2.4): 根据任务状态显示 emoji 指示器
 */

// Phase N4 (N4.2.4)

interface StatusInfo { icon: string; color: string; animate?: boolean }

const STATUS_MAP: Record<string, StatusInfo> = {
  running:    { icon: '🔄', color: '#3b82f6', animate: true },
  completed:  { icon: '✅', color: '#22c55e' },
  succeeded:  { icon: '✅', color: '#22c55e' },
  failed:     { icon: '❌', color: '#ef4444' },
  exhausted:  { icon: '❌', color: '#ef4444' },
  pending:    { icon: '⏳', color: '#9ca3af' },
  queued:     { icon: '⏳', color: '#9ca3af' },
  ready:      { icon: '⏳', color: '#9ca3af' },
  cancelled:  { icon: '🚫', color: '#6b7280' },
  skipped:    { icon: '⏭️', color: '#eab308' },
}

const DEFAULT_STATUS: StatusInfo = { icon: '⏳', color: '#9ca3af' }

interface StatusBadgeProps {
  state?: string
  size?: number
}

export default function StatusBadge({ state, size = 14 }: StatusBadgeProps) {
  const entry: StatusInfo = (state && STATUS_MAP[state]) ? STATUS_MAP[state] : DEFAULT_STATUS
  const { icon, color, animate } = entry

  return (
    <span
      className={animate ? 'status-badge-pulse' : undefined}
      style={{
        fontSize: size,
        color,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
      }}
      title={state ?? 'unknown'}
      aria-label={`status: ${state ?? 'unknown'}`}
    >
      {icon}
    </span>
  )
}
