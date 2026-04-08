/**
 * RoleIcon.tsx — 角色图标组件
 *
 * Phase N4 (N4.2.4): 根据角色显示对应 emoji 图标
 */

// Phase N4 (N4.2.4)

const ROLE_ICONS: Record<string, { icon: string; color: string }> = {
  supervisor: { icon: '📋', color: '#3b82f6' },  // blue
  architect:  { icon: '📐', color: '#a855f7' },  // purple
  developer:  { icon: '💻', color: '#22c55e' },  // green
  tester:     { icon: '🧪', color: '#f97316' },  // orange
  reviewer:   { icon: '📝', color: '#6b7280' },  // gray
}

const DEFAULT_ICON = { icon: '💬', color: '#9ca3af' }

interface RoleIconProps {
  role?: string
  size?: number
}

export default function RoleIcon({ role, size = 16 }: RoleIconProps) {
  const { icon, color } = (role && ROLE_ICONS[role]) ? ROLE_ICONS[role] : DEFAULT_ICON

  return (
    <span
      style={{ fontSize: size, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}
      title={role ?? 'chat'}
      aria-label={`${role ?? 'chat'} role`}
    >
      {icon}
    </span>
  )
}
