import { useState, useEffect, useCallback } from 'react'
import { useGateway } from './useGateway'
import Chat from './Chat'
import SessionPanel from './SessionPanel'
import Settings from './Settings'
import './App.css'

type Page = 'chat' | 'settings'
type ThemePreference = 'system' | 'light' | 'dark'
type EffectiveTheme = 'light' | 'dark'

const ZOOM_KEY = 'equality-zoom'
const THEME_KEY = 'equality-theme'
const ZOOM_MIN = 50
const ZOOM_MAX = 200
const ZOOM_STEP = 10

const MAX_OPENED_SESSIONS = 10

/** 将 newKey 加入已打开列表；超出上限时移除最早加入的非当前会话 */
function addToOpenedSessions(prev: string[], newKey: string): string[] {
  if (prev.includes(newKey)) return prev
  const next = [...prev, newKey]
  if (next.length <= MAX_OPENED_SESSIONS) return next
  const removeIdx = next.findIndex(k => k !== newKey)
  return removeIdx === -1 ? next : next.filter((_, i) => i !== removeIdx)
}

/** 生成新的 session key */
function newSessionKey(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `agent:main:desktop:default:direct:${ts}-${rand}`
}

function App() {
  const [page, setPage] = useState<Page>('chat')
  const [panelOpen, setPanelOpen] = useState(() => {
    return localStorage.getItem('equality-panel-open') !== 'false'
  })
  const [sessionKey, setSessionKey] = useState<string>(() => {
    return localStorage.getItem('equality-session-key') || newSessionKey()
  })
  const [openedSessions, setOpenedSessions] = useState<string[]>(() => {
    const initial = localStorage.getItem('equality-session-key') || newSessionKey()
    return [initial]
  })
  const [currentStreaming, setCurrentStreaming] = useState(false)
  const { coreOnline, loadSettings } = useGateway()
  const [providerInfo, setProviderInfo] = useState('')
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem(ZOOM_KEY)
    return saved ? Number(saved) : 100
  })
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const effectiveTheme: EffectiveTheme = themePreference === 'system' ? systemTheme : themePreference

  // 应用缩放
  useEffect(() => {
    document.body.style.zoom = `${zoom}%`
    localStorage.setItem(ZOOM_KEY, String(zoom))
  }, [zoom])

  useEffect(() => {
    document.body.style.background = effectiveTheme === 'light' ? '#ffffff' : '#1c1c1e'
  }, [effectiveTheme])

  // 跟随系统主题变化
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }
    setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  // 持久化主题偏好（system 模式移除键以保持默认跟随）
  useEffect(() => {
    if (themePreference === 'system') {
      localStorage.removeItem(THEME_KEY)
      return
    }
    localStorage.setItem(THEME_KEY, themePreference)
  }, [themePreference])

  // 持久化 sessionKey 和 panelOpen；切换会话时重置 streaming 显示（新会话的 Chat 会通过 onStreamingChange 上报真实状态）
  useEffect(() => {
    localStorage.setItem('equality-session-key', sessionKey)
    setCurrentStreaming(false)
  }, [sessionKey])
  useEffect(() => {
    localStorage.setItem('equality-panel-open', String(panelOpen))
  }, [panelOpen])

  const handleNewChat = useCallback(() => {
    const newKey = newSessionKey()
    setSessionKey(newKey)
    setOpenedSessions(prev => addToOpenedSessions(prev, newKey))
    setPage('chat')
  }, [])

  const handleSelectSession = useCallback((key: string) => {
    setSessionKey(key)
    setOpenedSessions(prev => addToOpenedSessions(prev, key))
    setPage('chat')
  }, [])

  // 加载 provider 信息
  useEffect(() => {
    loadSettings().then(s => {
      if (s.activeProvider) {
        // manual 模式下显示用户选择的模型，否则显示实际连接的模型
        const isManual = s.modelRouting === 'manual'
        const displayModel = (isManual && s.selectedModel) ? s.selectedModel : s.configured.find(c => c.key === 'COPILOT_MODEL' || c.key === 'CUSTOM_MODEL')?.masked
        setProviderInfo(`${s.activeProvider}${displayModel ? ` (${displayModel})` : ''}`)
      } else {
        setProviderInfo('未配置')
      }
    })
  }, [loadSettings, page])

  // 全局快捷键
  const handleKeyboard = useCallback((e: globalThis.KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    // 缩放
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))
    } else if (e.key === '-') {
      e.preventDefault()
      setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))
    } else if (e.key === '0') {
      e.preventDefault()
      setZoom(100)
    }
    // Ctrl+N 新对话
    else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      handleNewChat()
    }
    // Ctrl+B 折叠/展开面板
    else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault()
      setPanelOpen(p => !p)
    }
  }, [handleNewChat])

  // Ctrl+鼠标滚轮缩放
  const handleWheel = useCallback((e: globalThis.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (e.deltaY < 0) {
      setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))
    } else {
      setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard)
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', handleKeyboard)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [handleKeyboard, handleWheel])

  return (
    <div className={`app-root ${effectiveTheme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {/* 侧边栏 */}
      <nav className="sidebar">
        <button
          className={`sidebar-btn ${page === 'chat' ? 'active' : ''}`}
          onClick={() => {
            if (page === 'chat') {
              setPanelOpen(p => !p)  // 已在 chat 页面则 toggle 面板
            } else {
              setPage('chat')        // 从其他页面切回 chat
            }
          }}
          title="对话 (Ctrl+B 切换面板)"
        >💬</button>
        <button
          className={`sidebar-btn ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
          title="设置"
        >⚙️</button>
      </nav>

      {/* 主内容区 */}
      <div className="main-content">
        <div className="page-container">
          <div style={{ display: page === 'chat' ? 'contents' : 'none' }}>
            <div className="chat-with-panel">
              {panelOpen && (
                <SessionPanel
                  activeKey={sessionKey}
                  onSelect={handleSelectSession}
                  onNewChat={handleNewChat}
                  disabled={currentStreaming}
                  streaming={currentStreaming}
                />
              )}
              {openedSessions.map(key => (
                <div key={key} style={{ display: key === sessionKey ? 'contents' : 'none' }}>
                  <Chat
                    sessionKey={key}
                    onStreamingChange={key === sessionKey ? setCurrentStreaming : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
          {page === 'settings' && (
            <Settings
              themePreference={themePreference}
              effectiveTheme={effectiveTheme}
              onThemeChange={setThemePreference}
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="status-bar">
          <div className="status-left">
            <span className={`status-dot ${coreOnline ? 'online' : 'offline'}`} />
            <span className="status-text">
              {coreOnline === null ? 'Core 检测中…' : coreOnline ? 'Core 在线' : 'Core 离线'}
            </span>
            {providerInfo && (
              <>
                <span className="status-sep">|</span>
                <span className="status-text">{providerInfo}</span>
              </>
            )}
          </div>
          <div className="status-right">
            {zoom !== 100 && (
              <span className="status-zoom" title="Ctrl+0 重置缩放">{zoom}%</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
