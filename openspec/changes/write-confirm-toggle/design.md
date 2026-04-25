# Design: Write Confirm Toggle

## 配置键

| 键名 | 类型 | 默认值 | 含义 |
|------|------|--------|------|
| `WRITE_CONFIRM_ENABLED` | `'on' \| 'off'` | `'on'` | 写工具执行前是否需要用户确认 |

## 前端改动

### 1. ToolDetailDrawer（Settings.tsx）

为 `CONFIRM_TOOLS` 中的工具（write_file / edit_file / replace_in_file / apply_patch）在右侧抽屉中显示一个开关：

```
┌─────────────────────────────────┐
│ ✏️ write_file              ✕   │
│─────────────────────────────────│
│ 描述                           │
│ 写入文件内容到指定路径...       │
│                                 │
│ ⚙️ 写入确认                    │
│ ┌───────────────────────────┐   │
│ │ 写入前需要确认    [████] │   │ ← toggle，样式同沙箱开关
│ │ 开启后每次写文件都需要     │   │
│ │ 点击 Accept 才能继续      │   │
│ └───────────────────────────┘   │
│                                 │
│ 参数                           │
│ ...                            │
└─────────────────────────────────┘
```

开关样式复用 sandbox toggle 的样式（圆形滑块，开=绿色，关=灰色）。

### 2. SecretKey 类型（useGateway.ts）

新增 `'WRITE_CONFIRM_ENABLED'` 到 SecretKey 联合类型。

### 3. i18n

| Key | zh-CN | en |
|-----|-------|----|
| `writeConfirm.label` | 写入前需要确认 | Confirm before write |
| `writeConfirm.onDesc` | 每次写文件前会弹出 Diff 预览，需要点击 Accept 才能继续 | Shows Diff preview before each write, requires Accept to proceed |
| `writeConfirm.offDesc` | 写文件时自动执行，不弹出确认 | Writes are executed automatically without confirmation |

## 后端改动

### index.ts — enhancedBeforeToolCall

在步骤 2（写操作确认）前，读取 `WRITE_CONFIRM_ENABLED` 配置：

```typescript
// 2. 写操作确认（仅当 WRITE_CONFIRM_ENABLED !== 'off'）
if (CONFIRM_TOOLS.has(info.name) && info.args.content) {
  // 检查是否启用了写入确认
  const confirmEnabled = !hasSecret('WRITE_CONFIRM_ENABLED' as SecretKey)
    || getSecret('WRITE_CONFIRM_ENABLED' as SecretKey) !== 'off'
  
  if (confirmEnabled) {
    // ... 现有确认流程
  }
}
```

当 `WRITE_CONFIRM_ENABLED === 'off'` 时，直接跳过确认，工具立即执行。

## 影响分析

| 组件 | 影响 | 风险 |
|------|------|------|
| DiffPreview.tsx | 无改动 | 无 |
| Chat.tsx | 无改动（pending_confirm 状态不会出现） | 无 |
| enhancedBeforeToolCall | 添加条件判断 | 低 — 仅多一个 if |
| ToolDetailDrawer | 新增配置区域 | 低 — 复用现有 toggle 样式 |
| 安全检查 | 不受影响（step 1 安全检查独立于 step 2） | 无 |
