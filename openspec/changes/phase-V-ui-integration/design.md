# Phase V: UI 集成与增强 — 技术设计

## 1. Skills 详情展开

### 1.1 后端 `/skills` API 改动

```typescript
// index.ts GET /skills
app.get('/skills', async (_req, reply) => {
  const skills = skillsWatcher.getSkills()
  return reply.send(skills.map(e => ({
    name: e.skill.name,
    description: e.skill.description,
    source: e.source,
    filePath: e.skill.filePath,
    body: e.skill.body.slice(0, 2000),  // 新增：前 2000 字符
  })))
})
```

### 1.2 前端 Skills Tab

```tsx
// 状态：记录展开的 skill 名
const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

// 渲染
<div className="skill-item" onClick={() => setExpandedSkill(s.name === expandedSkill ? null : s.name)}>
  <div className="skill-header">
    <span className="skill-expand">{s.name === expandedSkill ? '▼' : '▶'}</span>
    <span className="skill-name">{s.name}</span>
    <span className="skill-source">{s.source}</span>
  </div>
  <div className="skill-desc">{s.description}</div>
  {s.name === expandedSkill && s.body && (
    <pre className="skill-body">{s.body}</pre>
  )}
</div>
```

### 1.3 CSS

```css
.skill-expand {
  font-size: 10px;
  margin-right: 6px;
  color: rgba(255,255,255,0.4);
}
.skill-body {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  color: rgba(255,255,255,0.7);
}
```

## 2. 紫色主题

### 2.1 CSS 变量 (App.css)

```css
.app-root.theme-purple {
  --bg-app: #1a0a2e;
  --bg-sidebar: #140822;
  --bg-status: #140822;
  --bg-hover: rgba(168,85,247,0.12);
  --bg-selected: rgba(168,85,247,0.18);
  --border-default: rgba(168,85,247,0.15);
  --text-primary: #e8dff5;
  --text-secondary: rgba(232,223,245,0.65);
  --text-muted: rgba(232,223,245,0.5);
  --text-dim: rgba(232,223,245,0.25);
  --status-online: #a855f7;
  --status-offline: #ff453a;
  --accent: #a855f7;
  --tag-neutral: rgba(232,223,245,0.5);
  --tag-faint: rgba(232,223,245,0.3);
}
```

### 2.2 类型系统

App.tsx 和 Settings.tsx:
```typescript
type ThemePreference = 'system' | 'purple' | 'dark'
type EffectiveTheme = 'purple' | 'dark'
```

### 2.3 主题按钮

Settings.tsx 高级 Tab:
```tsx
<button className={`theme-btn ${themePreference === 'purple' ? 'active' : ''}`}
        onClick={() => onThemeChange('purple')}>
  紫色
</button>
```

### 2.4 CSS 适配

将所有 `.theme-light` 选择器改为 `.theme-purple`，调整为紫色系配色。

## 3. DiffPreview 集成

### 3.1 Chat.tsx 工具卡片展开体

在 write_file/edit_file 工具卡片的展开 body 中，如果有 `args.content`（写入内容），
额外渲染 DiffPreview 组件。由于流式执行中无法获取原始文件内容（需要额外 API），
简化为：仅展示新文件内容的绿色 diff 预览。

```tsx
{expanded && isWriteTool && tc.args?.content && (
  <DiffPreview
    filePath={String(tc.args.path || tc.args.file_path || '')}
    originalContent={null}
    newContent={String(tc.args.content)}
    onAccept={() => {}}  // 已写入，Accept 仅为 UI 确认
    onReject={() => {}}
  />
)}
```

## 4. Phase U 前端配额 UI

### 4.1 设置页配额区（U8）

模型 Tab 底部新增 `QuotaSection` 组件：
- `GET /quota` 获取数据
- 每行：provider 名 + tier + 进度条（used/limit） + 输入框修改 limit
- 保存按钮 → `PUT /quota`

### 4.2 Chat 预警条（U9）

```tsx
// done 事件已有 quotaWarning 字段
// 在对话末尾渲染彩色提示条
{quotaWarning && (
  <div className={`quota-warning ${quotaWarning.startsWith('🚫') ? 'exhausted' : quotaWarning.startsWith('🔴') ? 'critical' : 'warn'}`}>
    {quotaWarning}
  </div>
)}
```

## 5. TaskProgressBar SSE 绑定

### 5.1 后端

runner.ts 在 PlanDAG 节点状态变化时发送 SSE:
```typescript
send({ type: 'plan_progress', completed, total, runningNode: node.label, estimatedMs })
```

### 5.2 前端

Chat.tsx 监听 plan_progress 事件更新状态，渲染 TaskProgressBar。
