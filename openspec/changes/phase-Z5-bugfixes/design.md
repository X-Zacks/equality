# Design: Phase Z5-bugfixes

## B1: 工具配置卡布局

### 问题

当前 `Settings.tsx` 中 `tab === 'tools'` 的 JSX 结构：

```
<Fragment>
  ├── Brave Search 配置卡 (provider-card)    ← 始终在顶部
  ├── Chrome 路径配置卡 (provider-card)       ← 始终在顶部
  ├── "已注册工具" title
  ├── 分类筛选 tabs (skill-category-tabs)
  ├── toolsList.filter().map()               ← 受分类筛选
  └── ToolDetailDrawer
</Fragment>
```

当用户选"全部"时，配置卡和工具列表都显示。当用户选"文件"时，工具列表被筛选，但配置卡消失——因为截图显示选非全部时配置卡不可见。

### 方案

配置卡始终显示，与分类筛选无关。将配置卡放在独立区域，分类 tabs 和工具列表在其下方。同时确保选"全部"时配置卡 + 全部工具都可见：

```
<Fragment>
  ├── 工具配置区（始终可见）
  │   ├── Brave Search 配置卡
  │   └── Chrome 路径配置卡
  ├── <hr/> 分隔线
  ├── "已注册工具" title + 搜索框（Z5-pagination-search）
  ├── 分类筛选 tabs
  └── 工具列表（受分类筛选）
</Fragment>
```

## B2: 黑色主题 className

### 问题

`App.tsx:189`:
```tsx
<div className={`app-root ${effectiveTheme === 'purple' ? 'theme-purple' : 'theme-dark'}`}>
```
当 `effectiveTheme === 'black'` 时 fallback 到 `theme-dark`。

### 方案

```tsx
<div className={`app-root theme-${effectiveTheme}`}>
```

这样 `effectiveTheme` 值直接映射为 `theme-dark`、`theme-purple`、`theme-black`，与 CSS 类名一致。

## B3: 沙箱路径规范化

### 问题

`sandbox.ts` 中 `validatePath()`:
```ts
const normalizedWorkspace = normalizePath(workspaceDir)  // 未经 realpathSync
```

而 `inputPath` 经过了 `realpathSync`，导致 symlink/junction/大小写差异时比较失败。

### 方案

```ts
let realWorkspace: string
try { realWorkspace = fs.realpathSync(workspaceDir) } catch { realWorkspace = workspaceDir }
const normalizedWorkspace = normalizePath(realWorkspace)
```
