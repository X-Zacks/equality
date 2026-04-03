# Phase G: 设计文档

---

## G1 — 对话驱动的工作区引导

### 设计决策

**为什么不让用户手动放文件？**

Equality 的操作主体是对话框，不是命令行。要求用户在文件系统中手动创建 `AGENTS.md` 等文件违背了产品的交互哲学。参考 OpenClaw 的 `ensureAgentWorkspace()` + `BOOTSTRAP.md` 机制，采用**自动种子 + 对话引导**的方式。

**OpenClaw 的做法（我们对齐的）：**
1. `ensureAgentWorkspace()` 在首次启动时自动拷贝模板文件到 `~/.config/open-claw/workspace/`
2. 模板中包含 `BOOTSTRAP.md`——一个写给 Agent 的对话脚本
3. Agent 看到 `BOOTSTRAP.md` 后主动发起对话，通过聊天了解用户
4. Agent 用 `write_file` 填写 `IDENTITY.md`、`USER.md`、`SOUL.md`
5. 引导完成后 Agent 删除 `BOOTSTRAP.md`——一次性仪式

### 启动时序

```
Core 启动 (index.ts)
  │
  ├── ensureWorkspaceBootstrap(workspaceDir)
  │     ├── mkdir -p workspaceDir
  │     ├── 检测已有文件 → 判断 isNewWorkspace
  │     ├── 全新 → 种下 6 个模板（含 BOOTSTRAP.md）
  │     └── 已有 → 补种缺失（跳过 BOOTSTRAP.md）
  │
  └── Skills watcher / 其他初始化...
```

### 运行时数据流

```
DefaultContextEngine.assemble()
  │
  ├── loadWorkspaceBootstrapFiles(workspaceDir)
  │     ├── 遍历 6 个文件名
  │     ├── 路径边界检查 → 拒绝逃逸
  │     ├── stat() → 大小限制 (2MB)
  │     ├── mtime 缓存 → 跳过未变化文件
  │     └── 返回 { files, errors, isBootstrapping }
  │
  ├── formatBootstrapBlock(files)
  │     ├── BOOTSTRAP.md 存在？
  │     │   └── YES → <bootstrap-script> 高优先级注入
  │     └── 其他文件 → <workspace-context name="...">
  │
  └── buildSystemPrompt({ bootstrapBlock })
        └── 在 activeSkill 之后、task rules 之前注入
```

### 首次引导对话流程

```
┌─────────────────────────────────────────────────────────┐
│ 全新工作区                                                │
│                                                          │
│ ensureWorkspaceBootstrap() → 种下 BOOTSTRAP.md           │
│         ↓                                                │
│ assemble() → 检测 BOOTSTRAP.md → isBootstrapping=true    │
│         ↓                                                │
│ formatBootstrapBlock() → <bootstrap-script>              │
│         ↓                                                │
│ Agent 看到引导脚本 → 主动开场对话                          │
│         ↓                                                │
│ "你好！我是 Equality，在我们开始之前…"                      │
│         ↓                                                │
│ 通过对话收集：姓名、风格、emoji、偏好                       │
│         ↓                                                │
│ Agent → write_file IDENTITY.md / USER.md / SOUL.md       │
│         ↓                                                │
│ Agent → 删除 BOOTSTRAP.md                                 │
│         ↓                                                │
│ 后续 assemble() → isBootstrapping=false → 正常运行        │
└─────────────────────────────────────────────────────────┘
```

### 类型定义

```typescript
// agent/workspace-bootstrap.ts

type BootstrapFileName =
  | 'BOOTSTRAP.md'
  | 'AGENTS.md'
  | 'IDENTITY.md'
  | 'USER.md'
  | 'SOUL.md'
  | 'TOOLS.md'

interface BootstrapFile {
  name: BootstrapFileName
  path: string
  content: string
}

type BootstrapLoadErrorReason = 'missing' | 'too_large' | 'security' | 'io'

interface BootstrapLoadError {
  name: string
  reason: BootstrapLoadErrorReason
  detail?: string
}

interface BootstrapLoadResult {
  files: BootstrapFile[]
  errors: BootstrapLoadError[]
  isBootstrapping: boolean  // BOOTSTRAP.md 是否存在
}

// ─── 导出函数 ───

// 启动时调用：自动种下模板
function ensureWorkspaceBootstrap(workspaceDir: string): Promise<{
  seeded: string[]
  isNewWorkspace: boolean
}>

// 每次 assemble 时调用：加载引导文件
function loadWorkspaceBootstrapFiles(workspaceDir: string): Promise<BootstrapLoadResult>

// 格式化为 system prompt 注入块
function formatBootstrapBlock(files: BootstrapFile[]): string

// 测试用：清除 mtime 缓存
function invalidateBootstrapCache(workspaceDir?: string): void
```

### 模板内容设计

6 个模板均为中文本地化，风格参考 OpenClaw 的 `docs/reference/templates/` 但适配 Equality 的对话驱动模式：

| 模板 | 内容概要 |
|------|---------|
| `BOOTSTRAP_TEMPLATE` | 对话引导脚本：温暖开场 → 收集 5 项信息 → write_file 更新 → 删除自身 |
| `IDENTITY_TEMPLATE` | 占位模板：名字/性格/风格/Emoji，提示在首次对话中填写 |
| `USER_TEMPLATE` | 占位模板：姓名/称呼/时区/备注，提示通过对话了解 |
| `SOUL_TEMPLATE` | 行为准则模板：真正有用/有自己观点/先想再问/隐私保密 |
| `AGENTS_TEMPLATE` | 工作区规则：会话启动读什么文件/记忆机制/红线 |
| `TOOLS_TEMPLATE` | 环境备注占位：常用路径/SSH 别名/开发偏好 |

### 缓存策略

- key: 文件绝对路径
- identity: `${mtimeMs}:${size}` 
- 命中则跳过磁盘 I/O
- `invalidateBootstrapCache(workspaceDir?)` 供测试用
- 无参调用清除全部缓存

---

## G2 — 外部内容安全包装

### 数据流

```
web_search / web_fetch 工具
  └── 原始结果
        │
        └── wrapExternalContent(content, source)
              ├── detectSuspiciousPatterns(content)  → string[]
              ├── 生成 randomBoundaryId (16 hex chars)
              ├── 包装:
              │     <<<EXTERNAL_UNTRUSTED_CONTENT id="abc123">>>
              │     SECURITY NOTICE: ...
              │     ---内容---
              │     <<<END_EXTERNAL_UNTRUSTED_CONTENT id="abc123">>>
              └── 返回包装后文本
```

### 类型定义

```typescript
// security/external-content.ts

type ExternalContentSource = 'web_search' | 'web_fetch' | 'api' | 'unknown'

interface WrapResult {
  content: string
  suspiciousPatterns: string[]
  boundaryId: string
}

function wrapExternalContent(content: string, source: ExternalContentSource): WrapResult
function detectSuspiciousPatterns(content: string): string[]
```

---

## G3 — Context Window Guard

### 数据流

```
provider.modelId (e.g. "gpt-4o")
  │
  └── resolveContextWindow({ provider, modelId, configOverride? })
        ├── configOverride > 0  → 使用配置值
        ├── MODEL_CONTEXT_WINDOWS[modelId] → 查表
        ├── provider.getCapabilities().contextWindow → provider 报告
        └── DEFAULT_CONTEXT_WINDOW → 兜底 128K
              │
              └── ContextWindowInfo { tokens, source }
                    │
                    ├── DefaultContextEngine.assemble() — 替换硬编码
                    └── calcMaxToolResultChars() — 动态截断
```

### 模型查表

```typescript
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'claude-4-sonnet': 200_000,
  'claude-4-opus': 200_000,
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.5-pro': 1_048_576,
  'deepseek-chat': 64_000,
  'deepseek-reasoner': 64_000,
  'qwen-max': 32_768,
}
```

---

## 文件变更清单

| 操作 | 文件 | 描述 |
|------|------|------|
| 新增 | `agent/workspace-bootstrap.ts` | G1: 对话驱动引导 — 自动种子 + 加载 + 格式化 + 6 模板 |
| 修改 | `agent/system-prompt.ts` | G1: `SystemPromptOptions.bootstrapBlock` 字段 + 注入点 |
| 修改 | `context/default-engine.ts` | G1: assemble() 加载引导文件并注入 prompt；G3: 使用动态 context window |
| 修改 | `index.ts` | G1: 启动时调用 `ensureWorkspaceBootstrap()` |
| 新增 | `security/external-content.ts` | G2: 外部内容安全包装 + prompt injection 检测 |
| 修改 | `tools/builtins/web-search.ts` | G2: 包装搜索结果 |
| 修改 | `tools/builtins/web-fetch.ts` | G2: 包装抓取结果 |
| 新增 | `providers/context-window.ts` | G3: context window 解析 + 模型查表 + guard |
| 新增 | `__tests__/phase-G.test.ts` | 全部测试（64 断言） |
