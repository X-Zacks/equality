/**
 * MemoryTab.tsx — 记忆管理 Tab（Settings 页）
 *
 * Phase M1: 记忆列表 + 搜索 + 过滤 + 分页 + 编辑/添加/删除 + 统计面板
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import { useT } from './i18n'
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
  const { t } = useT()
  if (!stats) return null
  return (
    <div className="memory-stats">
      <div className="stat-item">
        <span className="stat-label">{t('mem.total')}</span>
        <span className="stat-value">{stats.total}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">{t('mem.pinned')}</span>
        <span className="stat-value">{stats.pinned}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">{t('mem.archived')}</span>
        <span className="stat-value">{stats.archived}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">🔗 Embedding</span>
        <span className="stat-value">{(stats.embeddingCoverage * 100).toFixed(0)}%</span>
      </div>
      {Object.entries(stats.bySource).map(([src, cnt]) => (
        <div className="stat-item" key={src}>
          <span className="stat-label">{src === 'tool' ? t('mem.srcTool') : src === 'auto-capture' ? t('mem.srcAuto') : t('mem.srcManual')}</span>
          <span className="stat-value">{cnt}</span>
        </div>
      ))}
      <div className="stat-actions">
        <button className="stat-action-btn" onClick={onExport} disabled={busy} title="Export">{t('mem.export')}</button>
        <button className="stat-action-btn" onClick={onImport} disabled={busy} title="Import">{t('mem.import')}</button>
        <button className="stat-action-btn" onClick={onGC} disabled={busy} title="Cleanup">{t('mem.gc')}</button>
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
  const { t } = useT()

  const handleSave = () => {
    if (!text.trim()) return
    onSave({ text: text.trim(), category, importance, pinned })
  }

  return (
    <div className="memory-dialog-overlay" onClick={onClose}>
      <div className="memory-dialog" onClick={e => e.stopPropagation()}>
        <div className="memory-dialog-header">
          <h3>{entry ? t('mem.editTitle') : t('mem.addTitle')}</h3>
          <button className="memory-dialog-close" onClick={onClose}>✕</button>
        </div>
        <div className="memory-dialog-body">
          <label className="memory-dialog-label">
            {t('mem.content')}
            <textarea
              className="memory-dialog-textarea"
              value={text}
              onChange={e => { setText(e.target.value); setDupWarning(null) }}
              rows={4}
              maxLength={2000}
              placeholder={t('mem.contentPlaceholder')}
              autoFocus
            />
            <span className="memory-dialog-charcount">{text.length}/2000</span>
          </label>
          <div className="memory-dialog-row">
            <label className="memory-dialog-label memory-dialog-half">
              {t('mem.categoryLabel')}
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="general">{t('mem.general')}</option>
                <option value="preference">{t('mem.preference')}</option>
                <option value="decision">{t('mem.decision')}</option>
                <option value="fact">{t('mem.fact')}</option>
                <option value="project">{t('mem.project')}</option>
              </select>
            </label>
            <label className="memory-dialog-label memory-dialog-half">
              {t('mem.importance')}
              <input type="range" min={1} max={10} value={importance} onChange={e => setImportance(Number(e.target.value))} />
              <span>{importance}</span>
            </label>
          </div>
          <label className="memory-dialog-checkbox">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            {t('mem.pinLabel')}
          </label>
          {dupWarning && <div className="memory-dialog-warning">⚠️ {dupWarning}</div>}
          {entry && (
            <div className="memory-dialog-meta">
              <span>{t('mem.source')}: {entry.source}</span>
              <span>{t('mem.agent')}: {entry.agentId}</span>
              <span>{t('mem.created')}: {new Date(entry.createdAt).toLocaleString()}</span>
              {entry.updatedAt && <span>{t('mem.updated')}: {new Date(entry.updatedAt).toLocaleString()}</span>}
            </div>
          )}
        </div>
        <div className="memory-dialog-footer">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-save" onClick={handleSave} disabled={!text.trim()}>
            {entry ? t('save') : t('mem.add')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MemoryTab() {
  const { listMemories, createMemory, updateMemory, deleteMemory, deleteMemories, getMemoryStats, exportMemories, importMemories, triggerMemoryGC } = useGateway()
  const { t, locale } = useT()

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
  const [confirmDialog, setConfirmDialog] = useState<{ text: string; onConfirm: () => void } | null>(null)
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

  const handleDelete = (id: string) => {
    setConfirmDialog({
      text: t('mem.confirmDelete'),
      onConfirm: async () => {
        setConfirmDialog(null)
        await deleteMemory(id)
        setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
        refresh()
      },
    })
  }

  const handleBulkDelete = () => {
    if (selected.size === 0) return
    setConfirmDialog({
      text: t('mem.confirmBulkDelete').replace('{n}', String(selected.size)),
      onConfirm: async () => {
        setConfirmDialog(null)
        await deleteMemories([...selected])
        setSelected(new Set())
        refresh()
      },
    })
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
      if (!data) { showToast(t('mem.exportFail'), 'error'); return }
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
      showToast(t('mem.exported', { n: data.count }), 'success')
    } catch {
      showToast(t('mem.exportFail'), 'error')
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
        showToast(t('mem.importJsonError'), 'error')
        return
      }

      // 支持 { items: [...] } 和直接 [...] 两种格式
      const items = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed)
      if (!Array.isArray(items)) {
        showToast(t('mem.importFormatError'), 'error')
        return
      }

      // 确认对话框
      const ok = confirm(t('mem.importConfirm', { n: items.length }))
      if (!ok) return

      const result = await importMemories(items, 'merge')
      if (!result) { showToast(t('mem.importFail'), 'error'); return }

      const parts: string[] = []
      if (result.imported > 0) parts.push(t('mem.imported', { n: result.imported }))
      if (result.skipped > 0) parts.push(t('mem.skipped', { n: result.skipped }))
      if (result.blocked > 0) parts.push(t('mem.blocked', { n: result.blocked }))
      showToast(parts.length > 0 ? `✅ ${parts.join(', ')}` : t('mem.noNewMemories'), parts.length > 0 ? 'success' : 'info')
      refresh()
    } catch {
      showToast(t('mem.importFail'), 'error')
    } finally {
      setActionBusy(false)
    }
  }, [importMemories, showToast, refresh])

  // ─── 手动 GC（M3/T34）──────────────────────────────────────────────────
  const handleGC = useCallback(async () => {
    setActionBusy(true)
    try {
      const result = await triggerMemoryGC()
      if (!result) { showToast(t('mem.gcFail'), 'error'); return }
      if (result.archived === 0 && result.deleted === 0) {
        showToast(t('mem.gcNone'), 'info')
      } else {
        const parts: string[] = []
        if (result.archived > 0) parts.push(t('mem.gcArchived', { n: result.archived }))
        if (result.deleted > 0) parts.push(t('mem.gcDeleted', { n: result.deleted }))
        showToast(`🧹 ${parts.join(', ')}`, 'success')
        refresh()
      }
    } catch {
      showToast(t('mem.gcFail'), 'error')
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
          placeholder={t('mem.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <select className="memory-filter" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}>
          <option value="">{t('mem.allCategories')}</option>
          <option value="general">{t('mem.general')}</option>
          <option value="preference">{t('mem.preference')}</option>
          <option value="decision">{t('mem.decision')}</option>
          <option value="fact">{t('mem.fact')}</option>
          <option value="project">{t('mem.project')}</option>
        </select>
        <select className="memory-filter" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }}>
          <option value="">{t('mem.allSources')}</option>
          <option value="tool">{t('mem.srcTool')}</option>
          <option value="auto-capture">{t('mem.srcAuto')}</option>
          <option value="manual">{t('mem.srcManual')}</option>
        </select>
        <label className="memory-archive-toggle">
          <input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setPage(1) }} />
          {t('mem.showArchived')}
        </label>
        <div className="memory-toolbar-actions">
          <button className="btn-save" onClick={() => setEditingEntry('new')}>+ {t('mem.add')}</button>
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
          <div className="memory-empty">{t('mem.loading')}</div>
        ) : memories.length === 0 ? (
          <div className="memory-empty">{t('mem.empty')}</div>
        ) : (
          <>
            <div className="memory-list-header">
              <input type="checkbox" checked={selected.size === memories.length && memories.length > 0} onChange={selectAll} />
              <span className="memory-col-text">{t('mem.colContent')}</span>
              <span className="memory-col-category">{t('mem.colCategory')}</span>
              <span className="memory-col-source">{t('mem.colSource')}</span>
              <span className="memory-col-date">{t('mem.colDate')}</span>
              <span className="memory-col-actions">{t('mem.colActions')}</span>
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
                <span className="memory-col-date" title={new Date(m.createdAt).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}>
                  {formatRelativeTime(m.createdAt, t, locale)}
                </span>
                <span className="memory-col-actions">
                  <button className="memory-action-btn" onClick={() => handleTogglePin(m)} title={m.pinned ? t('mem.unpin') : t('mem.pin')}>
                    {m.pinned ? '📌' : '📍'}
                  </button>
                  <button className="memory-action-btn" onClick={() => setEditingEntry(m)} title={t('mem.edit')}>✏️</button>
                  <button className="memory-action-btn" onClick={() => handleToggleArchive(m)} title={m.archived ? t('mem.restore') : t('mem.archive')}>
                    {m.archived ? '📤' : '📦'}
                  </button>
                  <button className="memory-action-btn danger" onClick={() => handleDelete(m.id)} title={t('delete')}>🗑️</button>
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="memory-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← {t('pagination.prev')}</button>
          <span>{page} / {totalPages}（{t('mem.totalItems').replace('{n}', String(total))}）</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('pagination.next')} →</button>
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

      {/* 删除确认弹窗 */}
      {confirmDialog && (
        <div className="memory-dialog-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="memory-dialog" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
            <div className="memory-dialog-header">
              <h3>{t('mem.confirmAction')}</h3>
              <button className="memory-dialog-close" onClick={() => setConfirmDialog(null)}>✕</button>
            </div>
            <div className="memory-dialog-body" style={{ padding: '20px 18px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14 }}>{confirmDialog.text}</p>
            </div>
            <div className="memory-dialog-footer">
              <button className="btn-secondary" onClick={() => setConfirmDialog(null)}>{t('cancel')}</button>
              <button className="btn-danger" onClick={confirmDialog.onConfirm}>{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number, t: (key: string, vars?: Record<string, string | number> | string) => string, locale: string): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('mem.justNow')
  if (minutes < 60) return t('mem.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('mem.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('mem.daysAgo', { n: days })
  return new Date(ts).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
}
