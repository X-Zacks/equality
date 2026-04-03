import { useState, useCallback } from 'react'
import type { InteractivePayload, InteractiveElement, ButtonStyle } from './useGateway'
import './InteractiveBlock.css'

interface InteractiveBlockProps {
  payload: InteractivePayload
  onAction: (actionId: string, value: string) => void
  disabled?: boolean
}

const BUTTON_STYLE_MAP: Record<ButtonStyle, string> = {
  primary: 'ib-btn-primary',
  secondary: 'ib-btn-secondary',
  success: 'ib-btn-success',
  danger: 'ib-btn-danger',
}

function ButtonElement({ el, onAction, disabled }: {
  el: Extract<InteractiveElement, { type: 'button' }>
  onAction: (actionId: string, value: string) => void
  disabled?: boolean
}) {
  const cls = BUTTON_STYLE_MAP[el.style ?? 'primary']
  return (
    <button
      className={`ib-btn ${cls}`}
      onClick={() => onAction(el.actionId, 'clicked')}
      disabled={disabled}
      aria-label={el.label}
    >
      {el.label}
    </button>
  )
}

function SelectElement({ el, onAction, disabled }: {
  el: Extract<InteractiveElement, { type: 'select' }>
  onAction: (actionId: string, value: string) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')

  const handleConfirm = useCallback(() => {
    if (value) onAction(el.actionId, value)
  }, [value, el.actionId, onAction])

  return (
    <div className="ib-select-group">
      <select
        className="ib-select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-label={el.placeholder ?? '选择'}
      >
        <option value="" disabled>{el.placeholder ?? '请选择…'}</option>
        {el.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        className="ib-btn ib-btn-primary ib-select-confirm"
        onClick={handleConfirm}
        disabled={disabled || !value}
        aria-label="确认选择"
      >
        确认
      </button>
    </div>
  )
}

function TextElement({ el }: { el: Extract<InteractiveElement, { type: 'text' }> }) {
  return <p className="ib-text">{el.content}</p>
}

export default function InteractiveBlock({ payload, onAction, disabled }: InteractiveBlockProps) {
  return (
    <div className="interactive-block" role="group" aria-label="交互式操作">
      {payload.elements.map((el, i) => {
        switch (el.type) {
          case 'button':
            return <ButtonElement key={`btn-${el.actionId}-${i}`} el={el} onAction={onAction} disabled={disabled} />
          case 'select':
            return <SelectElement key={`sel-${el.actionId}-${i}`} el={el} onAction={onAction} disabled={disabled} />
          case 'text':
            return <TextElement key={`txt-${i}`} el={el} />
          default:
            return null
        }
      })}
    </div>
  )
}
