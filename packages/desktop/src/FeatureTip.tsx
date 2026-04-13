import { useState, useEffect, useRef } from 'react'
import './FeatureTip.css'

interface FeatureTipProps {
  messageCount: number
  hasUsedSkill: boolean
  hasUsedAttachment: boolean
}

interface TipDef {
  id: string
  condition: (props: FeatureTipProps) => boolean
  text: string
}

const TIPS: TipDef[] = [
  {
    id: 'tip-drag-file',
    condition: (p) => p.messageCount === 0,
    text: '💡 试试拖放文件到对话框，可以分析图片、PDF、代码等',
  },
  {
    id: 'tip-at-skill',
    condition: (p) => p.messageCount >= 3 && !p.hasUsedSkill,
    text: '💡 输入 @ 可选择 20+ 内置技能，如 @git、@python、@coding',
  },
  {
    id: 'tip-attach',
    condition: (p) => p.messageCount >= 5 && !p.hasUsedAttachment,
    text: '💡 点击 📎 添加文件，支持图片 / PDF / 代码等多种格式',
  },
]

const STORAGE_PREFIX = 'equality_tip_dismissed_'

function isDismissed(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === '1'
  } catch {
    return false
  }
}

function dismiss(id: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, '1')
  } catch {
    // ignore
  }
}

export default function FeatureTip(props: FeatureTipProps) {
  const [visible, setVisible] = useState(false)
  const [activeTip, setActiveTip] = useState<TipDef | null>(null)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 找第一个匹配且未 dismiss 的提示
    const tip = TIPS.find(t => t.condition(props) && !isDismissed(t.id))
    if (tip && (!activeTip || tip.id !== activeTip.id)) {
      setActiveTip(tip)
      setVisible(true)
      setFading(false)

      // 8 秒后自动消失
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setFading(true)
        setTimeout(() => {
          setVisible(false)
          setActiveTip(null)
          dismiss(tip.id)
        }, 300) // fade-out 动画时长
      }, 8000)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [props.messageCount, props.hasUsedSkill, props.hasUsedAttachment])

  const handleClose = () => {
    if (activeTip) dismiss(activeTip.id)
    setFading(true)
    setTimeout(() => {
      setVisible(false)
      setActiveTip(null)
    }, 300)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  if (!visible || !activeTip) return null

  return (
    <div className={`feature-tip${fading ? ' feature-tip-fade-out' : ''}`}>
      <span className="feature-tip-text">{activeTip.text}</span>
      <button className="feature-tip-close" onClick={handleClose}>✕</button>
    </div>
  )
}
