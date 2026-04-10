/**
 * MemoryTab.tsx — 记忆管理 Tab（Settings 页）
 *
 * Phase M1: 记忆列表 + 搜索 + 过滤 + 分页 + 编辑/添加/删除 + 统计面板
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import './MemoryTab.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string
  text: string
  category: string
  importance: number
  createdAt: number
  sessionKey?: string
  agentId: string
  workspaceDir?: string
  source: 'tool' | 'auto-capture' | 'manual'
  updatedAt?: number
  archived: boolean
  pinned: boolean
}

interface MemoryStats {
  total: number
  byCategory: Record<string, number>
  byAgent: Record<string, number>
  bySource: Record<string, number>
  byWorkspace: Record<string, number>
  archived: number
  pinned: number
  oldestAt: number | null
  newestAt: number | null
  embeddingCoverage: number
}

// ─── Stats Panel ──────────────────────────────────────────────────────────────

function StatsPanel({ stats, busy, onExport, onImport, onGC }: {
  stats: MemoryStats | null
  busy?: boolean
  onExport: () => void
  onImport: () => void
  onGC: () => void
}) {
  if (!stats) return null
  return (
    <div className="memory-stats">
      <div className="stat-item">
        <span className="stat-label">总计</span>
        <span className="stat-value">{stats.total}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">📌 置顶</span>
        <span className="stat-value">{stats.pinned}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">📦 已归档</span>
        <span className="stat-value">{stats.archived}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">🔗 Embedding</span>
        <span className="stat-value">{(stats.embeddingCoverage * 100).toFixed(0)}%</span>
      </div>
      {Object.entries(stats.bySource).map(([src, cnt]) => (
        <div className="stat-item" key={src}>
          <span className="stat-label">{src === 'tool' ? '🔧 工具' : src === 'auto-capture' ? '🤖 自动' : '✍️ 手动'}</span>
          <span className="stat-value">{cnt}</span>
        </div>
      ))}
      <div className="stat-actions">
        <button className="stat-action-btn" onClick={onExport} disabled={busy} title="导出所有记忆为 JSON 文件">⬇️ 导出</button>
        <button className="stat-action-btn" onClick={onImport} disabled={busy} title="从 JSON 文件导入记忆">⬆️ 导入</button>
        <button className="stat-action-btn" onClick={onGC} disabled={busy} title="清理低重要性旧记忆">🧹 清理</button>
      </div>
    </div>
  )
}

// ─── Edit / Add Dialog ────────────────────────────────────────────────────────

function MemoryDialog({
  entry,
  onSave,
  onClose,
}: {
  entry: MemoryEntry | null   // null = 添加模式
  onSave: (data: { text: string; category: string; importance: number; pinned: boolean }) => void
  onClose: () => void
}) {
  const [text, setText] = useState(entry?.text ?? '')
  const [category, setCategory] = useState(entry?.category ?? 'general')
  const [importance, setImportance] = useState(entry?.importance ?? 5)
  const [pinned, setPinned] = useState(entry?.pinned ?? false)
  const [dupWarning, setDupWarning] = useState<string | null>(null)

  const handleSave = () => {
    if (!text.trim()) return
    onSave({ text: text.trim(), category, importance, pinned })
  }

  return (
    <div className="memory-dialog-overlay" onClick={onClose}>
      <div className="memory-dialog" onClick={e => e.stopPropagation()}>
        <div className="memory-dialog-header">
          <h3>{entry ? '编辑记忆' : '添加记忆'}</h3>
          <button className="memory-dialog-close" onClick={onClose}>✕</button>
        </div>
        <div className="memory-dialog-body">
          <label className="memory-dialog-label">
            内容
            <textarea
              className="memory-dialog-textarea"
              value={text}
              onChange={e => { setText(e.target.value); setDupWarning(null) }}
              rows={4}
              maxLength={2000}
              placeholder="输入记忆内容…"
              autoFocus
            />
            <span className="memory-dialog-charcount">{text.length}/2000</span>
          </label>
          <div className="memory-dialog-row">
            <label className="memory-dialog-label memory-dialog-half">
              分类
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="general">通用</option>
                <option value="preference">偏好</option>
                <option value="decision">决策</option>
                <option value="fact">事实</option>
                <option value="project">项目</option>
              </select>
            </label>
            <label className="memory-dialog-label memory-dialog-half">
              重要性
              <input type="range" min={1} max={10} value={importance} onChange={e => setImportance(Number(e.target.value))} />
              <span>{importance}</span>
            </label>
          </div>
          <label className="memory-dialog-checkbox">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            📌 置顶（始终包含在上下文中）
          </label>
          {dupWarning && <div className="memory-dialog-warning">⚠️ {dupWarning}</div>}
          {entry && (
            <div className="memory-dialog-meta">
              <span>来源: {entry.source}</span>
              <span>Agent: {entry.agentId}</span>
              <span>创建: {new Date(entry.createdAt).toLocaleString('zh-CN')}</span>
              {entry.updatedAt && <span>修改: {new Date(entry.updatedAt).toLocaleString('zh-CN')}</span>}
            </div>
          )}
        </div>
        <div className="memory-dialog-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={handleSave} disabled={!text.trim()}>
            {entry ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MemoryTab() {
  const { listMemories, createMemory, updateMemory, deleteMemory, deleteMemories, getMemoryStats, exportMemories, importMemories, triggerMemoryGC } = useGateway()

  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingEntry, setEditingEntry] = useState<MemoryEntry | null | 'new'>(null)
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listMemories({
        page,
        pageSize,
        search: search || undefined,
        category: categoryFilter || undefined,
        source: sourceFilter || undefined,
        archived: showArchived,
      })
      setMemories(result.items ?? [])
      setTotal(result.total ?? 0)
      const s = await getMemoryStats()
      setStats(s)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, categoryFilter, sourceFilter, showArchived, listMemories, getMemoryStats])

  useEffect(() => { refresh() }, [refresh])

  const totalPages = Math.ceil(total / pageSize) || 1

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条记忆？')) return
    await deleteMemory(id)
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    refresh()
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定删除 ${selected.size} 条记忆？`)) return
    await deleteMemories([...selected])
    setSelected(new Set())
    refresh()
  }

  const handleTogglePin = async (entry: MemoryEntry) => {
    await updateMemory(entry.id, { pinned: !entry.pinned })
    refresh()
  }

  const handleToggleArchive = async (entry: MemoryEntry) => {
    await updateMemory(entry.id, { archived: !entry.archived })
    refresh()
  }

  const handleSaveDialog = async (data: { text: string; category: string; importance: number; pinned: boolean }) => {
    if (editingEntry === 'new') {
      const result = await createMemory({ text: data.text, category: data.category, importance: data.importance, pinned: data.pinned })
      if (result?.duplicate) {
        alert(`检测到近似记忆 (相似度: ${(result.similarity * 100).toFixed(0)}%)\n已有: ${result.existingText}`)
        return
      }
      if (result?.error) {
        alert(`保存失败: ${result.error}`)
        return
      }
    } else if (editingEntry && typeof editingEntry === 'object') {
      await updateMemory(editingEntry.id, data)
    }
    setEditingEntry(null)
    refresh()
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { setPage(1); refresh() }
  }

  // ─── 导出记忆（M3/T34）──────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setActionBusy(true)
    try {
      const data = await exportMemories()
      if (!data) { showToast('导出失败', 'error'); return }
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `equality-memories-${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast(`已导出 ${data.count} 条记忆`, 'success')
    } catch {
      showToast('导出失败', 'error')
    } finally {
      setActionBusy(false)
    }
  }, [exportMemories, showToast])

  // ─── 导入记忆（M3/T34）──────────────────────────────────────────────────
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 重置 input（允许再次选择同一文件）
    e.target.value = ''

    setActionBusy(true)
    try {
      const text = await file.text()
      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        showToast('JSON 格式错误，无法解析', 'error')
        return
      }

      // 支持 { items: [...] } 和直接 [...] 两种格式
      const items = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed)
      if (!Array.isArray(items)) {
        showToast('无效的导入格式（需要包含 items 数组）', 'error')
        return
      }

      // 确认对话框
      const ok = confirm(`即将导入 ${items.length} 条记忆（合并模式，重复将跳过）。\n\n确定继续？`)
      if (!ok) return

      const result = await importMemories(items, 'merge')
      if (!result) { showToast('导入失败', 'error'); return }

      const parts: string[] = []
      if (result.imported > 0) parts.push(`导入 ${result.imported} 条`)
      if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条重复`)
      if (result.blocked > 0) parts.push(`拦截 ${result.blocked} 条`)
      showToast(parts.length > 0 ? `✅ ${parts.join('，')}` : '无新记忆可导入', parts.length > 0 ? 'success' : 'info')
      refresh()
    } catch {
      showToast('导入失败', 'error')
    } finally {
      setActionBusy(false)
    }
  }, [importMemories, showToast, refresh])

  // ─── 手动 GC（M3/T34）──────────────────────────────────────────────────
  const handleGC = useCallback(async () => {
    setActionBusy(true)
    try {
      const result = await triggerMemoryGC()
      if (!result) { showToast('清理失败', 'error'); return }
      if (result.archived === 0 && result.deleted === 0) {
        showToast('没有需要清理的记忆', 'info')
      } else {
        const parts: string[] = []
        if (result.archived > 0) parts.push(`归档 ${result.archived} 条`)
        if (result.deleted > 0) parts.push(`永删 ${result.deleted} 条`)
        showToast(`🧹 ${parts.join('，')}`, 'success')
        refresh()
      }
    } catch {
      showToast('清理失败', 'error')
    } finally {
      setActionBusy(false)
    }
  }, [triggerMemoryGC, showToast, refresh])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const selectAll = () => {
    if (selected.size === memories.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(memories.map(m => m.id)))
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="memory-tab">
      {/* 隐藏文件输入（导入用） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* 操作反馈 Toast */}
      {toast && (
        <div className={`memory-toast memory-toast-${toast.type}`}>
          {toast.text}
          <button className="memory-toast-close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* 统计面板 */}
      <StatsPanel stats={stats} busy={actionBusy} onExport={handleExport} onImport={handleImportClick} onGC={handleGC} />

      {/* 工具栏 */}
      <div className="memory-toolbar">
        <input
          className="memory-search"
          type="text"
          placeholder="🔍 搜索记忆…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <select className="memory-filter" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}>
          <option value="">全部分类</option>
          <option value="general">通用</option>
          <option value="preference">偏好</option>
          <option value="decision">决策</option>
          <option value="fact">事实</option>
          <option value="project">项目</option>
        </select>
        <select className="memory-filter" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }}>
          <option value="">全部来源</option>
          <option value="tool">🔧 工具</option>
          <option value="auto-capture">🤖 自动</option>
          <option value="manual">✍️ 手动</option>
        </select>
        <label className="memory-archive-toggle">
          <input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setPage(1) }} />
          已归档
        </label>
        <div className="memory-toolbar-actions">
          <button className="btn-save" onClick={() => setEditingEntry('new')}>+ 添加</button>
          {selected.size > 0 && (
            <button className="btn-danger" onClick={handleBulkDelete}>
              🗑️ 删除 ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* 记忆列表 */}
      <div className="memory-list">
        {loading && memories.length === 0 ? (
          <div className="memory-empty">加载中…</div>
        ) : memories.length === 0 ? (
          <div className="memory-empty">暂无记忆</div>
        ) : (
          <>
            <div className="memory-list-header">
              <input type="checkbox" checked={selected.size === memories.length && memories.length > 0} onChange={selectAll} />
              <span className="memory-col-text">内容</span>
              <span className="memory-col-category">分类</span>
              <span className="memory-col-source">来源</span>
              <span className="memory-col-date">时间</span>
              <span className="memory-col-actions">操作</span>
            </div>
            {memories.map(m => (
              <div key={m.id} className={`memory-row ${m.pinned ? 'pinned' : ''} ${m.archived ? 'archived' : ''}`}>
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} />
                <span className="memory-col-text" title={m.text}>
                  {m.pinned && '📌 '}
                  {m.text.length > 80 ? m.text.slice(0, 80) + '…' : m.text}
                </span>
                <span className="memory-col-category">
                  <span className={`memory-badge cat-${m.category}`}>{m.category}</span>
                </span>
                <span className="memory-col-source">
                  {m.source === 'tool' ? '🔧' : m.source === 'auto-capture' ? '🤖' : '✍️'}
                </span>
                <span className="memory-col-date" title={new Date(m.createdAt).toLocaleString('zh-CN')}>
                  {formatRelativeTime(m.createdAt)}
                </span>
                <span className="memory-col-actions">
                  <button className="memory-action-btn" onClick={() => handleTogglePin(m)} title={m.pinned ? '取消置顶' : '置顶'}>
                    {m.pinned ? '📌' : '📍'}
                  </button>
                  <button className="memory-action-btn" onClick={() => setEditingEntry(m)} title="编辑">✏️</button>
                  <button className="memory-action-btn" onClick={() => handleToggleArchive(m)} title={m.archived ? '恢复' : '归档'}>
                    {m.archived ? '📤' : '📦'}
                  </button>
                  <button className="memory-action-btn danger" onClick={() => handleDelete(m.id)} title="删除">🗑️</button>
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="memory-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← 上一页</button>
          <span>{page} / {totalPages}（共 {total} 条）</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页 →</button>
        </div>
      )}

      {/* 编辑/添加弹窗 */}
      {editingEntry !== null && (
        <MemoryDialog
          entry={editingEntry === 'new' ? null : editingEntry}
          onSave={handleSaveDialog}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}
