# Design: Phase Z5-pagination-search

## 通用方案

### 搜索

搜索框放在分类 tabs 上方（或右侧），输入时实时过滤：

```tsx
const [toolSearch, setToolSearch] = useState('')

// 过滤逻辑：名称 OR 描述 模糊匹配
const filteredTools = toolsList
  .filter(t => toolCategory === 'all' || getToolCategory(t.name) === toolCategory)
  .filter(t => {
    if (!toolSearch.trim()) return true
    const q = toolSearch.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
  })
```

### 分页

```tsx
const PAGE_SIZE = 20
const [toolPage, setToolPage] = useState(1)

const totalPages = Math.ceil(filteredTools.length / PAGE_SIZE)
const pagedTools = filteredTools.slice((toolPage - 1) * PAGE_SIZE, toolPage * PAGE_SIZE)

// 分类或搜索变化时重置页码
useEffect(() => { setToolPage(1) }, [toolCategory, toolSearch])
```

### 分页 UI

底部简洁页码导航：
```tsx
{totalPages > 1 && (
  <div className="pagination">
    <button disabled={toolPage === 1} onClick={() => setToolPage(p => p - 1)}>‹</button>
    <span>{toolPage} / {totalPages}</span>
    <button disabled={toolPage === totalPages} onClick={() => setToolPage(p => p + 1)}>›</button>
  </div>
)}
```

### 搜索框 UI

```tsx
<div className="search-bar">
  <input
    type="text"
    placeholder="Search tools by name or description..."
    value={toolSearch}
    onChange={e => setToolSearch(e.target.value)}
  />
  {toolSearch && <button className="search-clear" onClick={() => setToolSearch('')}>✕</button>}
</div>
```

## P1 + P2: 工具列表

搜索框放在 "已注册工具" 标题旁边（同行右对齐）。分页控件放在工具列表底部。

## P3 + P4: Skills 列表

同样模式：搜索按 `skill.name` + `skill.description` + `skill.body` 模糊匹配。分页逻辑复用同样的 `PAGE_SIZE = 20`。

### CSS

```css
.search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.search-bar input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
}
.search-bar input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(122,179,255,0.15);
}
.search-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.pagination button {
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}
.pagination button:disabled {
  opacity: 0.4;
  cursor: default;
}
```
