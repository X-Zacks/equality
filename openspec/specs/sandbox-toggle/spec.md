# Sandbox Toggle & Workspace Dir Drawer Specification

> 控制沙箱访问权限的全局开关 + 工作目录设置改为右侧抽屉交互。
> 依赖：[tools/spec.md](../tools/spec.md)

---

## Background

当前 Equality 的 Agent 操作受 Workspace Dir 沙箱限制：`read_file`、`write_file`、`list_dir`、`edit_file`、`bash` 等工具只能访问 workspace 范围内的路径。这在大部分场景下提供安全保障，但在用户明确需要跨目录操作（如系统管理、多项目工作流）时造成不便。

需要：
1. 一个全局沙箱开关，关闭后 Agent 可访问任意路径
2. 将 Workspace Dir 设置从内联 input 改为右侧抽屉（与其他高级设置一致）
3. 开关与 Workspace Dir 放入同一个抽屉中，形成「工作空间与安全」面板

---

## Design

### D1: UI — 工作空间与安全抽屉

**交互流程：**

Advanced Config 区域新增一行 provider-card（类似 Performance / Agent Loop 的样式）：

```
┌────────────────────────────────────────────┐
│ 📁 Workspace & Security                   │
│   C:\software\workspace-equality       ›   │
└────────────────────────────────────────────┘
```

点击后弹出右侧抽屉，包含两部分：

**A. Workspace Dir（工作目录）**
- 文本输入框，placeholder 显示当前默认路径
- 保存按钮
- 说明文字

**B. Sandbox Mode（沙箱模式）开关**
- Toggle 开关，默认 ON（打开 = 启用沙箱）
- 开关说明（中英双语）：
  - ON: "Agent 的文件操作仅限 Workspace 目录内。推荐保持开启以防止误操作。"
  - OFF: "Agent 可访问系统任意路径。适用于系统管理、多项目等场景。请确保你信任当前 Agent 的行为。"
- 关闭沙箱时显示橙色警告图标

**抽屉布局（mock）：**
```
┌────────────────────────────────┐
│ 📁 Workspace & Security    ✕  │
│ ─────────────────────────────  │
│ Workspace Dir                  │
│ [________________________]     │
│ Default directory for scripts  │
│                                │
│ ─────────────────────────────  │
│ 🛡️ Sandbox Mode   [====ON]    │
│ File operations restricted to  │
│ workspace dir. Recommended.    │
│                                │
│         [ Save ]               │
└────────────────────────────────┘
```

### D2: 后端 — SANDBOX_ENABLED Secret

- 新增 Secret key `SANDBOX_ENABLED`，值为 `'on'` 或 `'off'`
- 默认值（未设置时）：`'on'`
- 通过已有 `saveApiKey` / `getSecret` / `hasSecret` 基础设施读写

### D3: 沙箱 bypass 逻辑

当 `SANDBOX_ENABLED === 'off'` 时：

| 工具 | 沙箱行为 | bypass 方式 |
|------|---------|------------|
| `read_file` | `guardPath()` 限制路径 | 跳过 `guardPath()` 检查 |
| `write_file` | `guardPath()` 限制路径 | 跳过 `guardPath()` 检查 |
| `edit_file` | `guardPath()` 限制路径 | 跳过 `guardPath()` 检查 |
| `list_dir` | `guardPath()` 限制路径 | 跳过 `guardPath()` 检查 |
| `read_image` | `guardPath()` 限制路径 | 跳过 `guardPath()` 检查 |
| `read_pdf` | `guardPath()` 限制路径 | 跳过 `guardPath()` 检查 |
| `bash` | `validateBashCommand()` 限制 | 跳过沙箱验证 |
| `image_generate` | 保存到 workspace 内 | 允许保存到任意路径 |

**实现方式：** 在 `ToolContext` 接口新增 `sandboxEnabled: boolean` 字段。各工具根据此字段决定是否执行路径检查。

### D4: Security Audit 联动

`/security-audit` 端点已有 `sandboxEnabled` 参数。改为从 `SANDBOX_ENABLED` Secret 读取，而非 `process.env.EQUALITY_SANDBOX`。

---

## Tasks

### T1: 前端 — 移除内联 Workspace Dir，新增抽屉入口
- 文件：`packages/desktop/src/Settings.tsx`
- 删除 advanced tab 中的内联 workspace dir input 区块
- 新增 `'workspace'` 抽屉类型
- 添加 Workspace & Security 的 provider-card 入口行

### T2: 前端 — AdvancedDrawer 增加 workspace panel
- 文件：`packages/desktop/src/Settings.tsx`
- `AdvancedDrawerProps.panel` 扩展为 `'performance' | 'agentLoop' | 'workspace'`
- workspace panel 包含：
  - Workspace Dir 文本输入 + 保存
  - Sandbox Mode toggle（读写 `SANDBOX_ENABLED`）
  - 状态说明文字

### T3: i18n — 添加沙箱相关文案
- 文件：`packages/desktop/src/locales/zh-CN.json`, `en.json`
- 新增 keys:
  - `workspace.title` / `workspace.sub`
  - `sandbox.label` / `sandbox.onDesc` / `sandbox.offDesc` / `sandbox.warning`

### T4: 后端 — ToolContext 增加 sandboxEnabled
- 文件：`packages/core/src/tools/types.ts`
- `ToolContext` 新增 `sandboxEnabled?: boolean`

### T5: 后端 — runner.ts 传递 sandboxEnabled
- 文件：`packages/core/src/agent/runner.ts`
- 从 `RunAttemptParams` 接收 `sandboxEnabled`，传入 `ToolContext`

### T6: 后端 — index.ts 读取 SANDBOX_ENABLED 并传给 runner
- 文件：`packages/core/src/index.ts`
- `getWorkspaceDir()` 旁新增 `isSandboxEnabled()` 函数
- `runAttempt` 调用处传入 `sandboxEnabled: isSandboxEnabled()`
- Security Audit 端点改用 `isSandboxEnabled()`

### T7: 工具 — path-guard.ts bypass
- 文件：`packages/core/src/tools/builtins/path-guard.ts`
- `guardPath()` 新增可选参数 `sandboxEnabled`
- 当 `sandboxEnabled === false` 时直接返回 `{ absPath }`

### T8: 工具 — 各文件工具传递 sandbox 标志
- 文件：`read_file.ts`, `write_file.ts`, `edit_file.ts`, `list_dir.ts`, `read_image.ts`, `read_pdf_vision.ts`
- 调用 `guardPath()` 时传入 `ctx.sandboxEnabled`

### T9: 工具 — bash sandbox bypass
- 文件：`packages/core/src/tools/builtins/bash.ts`
- 当 `ctx.sandboxEnabled === false` 时跳过 `validateBashCommand()`
