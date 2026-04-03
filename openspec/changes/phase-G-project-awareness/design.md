# Phase G: 设计文档

---

## G1 — 工作区引导文件

### 数据流

```
workspaceDir/
├── AGENTS.md     ← 项目级 Agent 行为指令
├── SOUL.md       ← Agent 身份/人格定义
├── TOOLS.md      ← 项目可用工具限制
├── IDENTITY.md   ← 项目身份标识
│
buildSystemPrompt()
  └── loadWorkspaceBootstrapFiles(workspaceDir)
        ├── 扫描 4 种文件
        ├── 安全检查（路径边界 + 2MB 上限）
        ├── mtime 缓存
        └── 返回 { name, content }[]
              │
              └── 注入到 system prompt 尾部
                    <workspace-context name="AGENTS.md">
                    ...内容...
                    </workspace-context>
```

### 类型定义

```typescript
// agent/workspace-bootstrap.ts

type BootstrapFileName = 'AGENTS.md' | 'SOUL.md' | 'TOOLS.md' | 'IDENTITY.md'

interface BootstrapFile {
  name: BootstrapFileName
  path: string
  content: string
}

interface BootstrapLoadResult {
  files: BootstrapFile[]
  errors: Array<{ name: string; reason: 'missing' | 'too_large' | 'security' | 'io' }>
}

function loadWorkspaceBootstrapFiles(workspaceDir: string): Promise<BootstrapLoadResult>
function formatBootstrapBlock(files: BootstrapFile[]): string
```

### 缓存策略

- key: `filePath`
- identity: `${mtime}:${size}` 
- 命中则跳过磁盘 I/O
- `invalidateBootstrapCache(workspaceDir)` 供测试用

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
| 新增 | `agent/workspace-bootstrap.ts` | G1: 引导文件加载 + 缓存 |
| 修改 | `agent/system-prompt.ts` | G1: 注入引导文件到 prompt |
| 修改 | `context/types.ts` | G1: AssembleParams 增加 bootstrapFiles |
| 新增 | `security/external-content.ts` | G2: 外部内容安全包装 |
| 修改 | `tools/builtins/web-search.ts` | G2: 包装搜索结果 |
| 修改 | `tools/builtins/web-fetch.ts` | G2: 包装抓取结果 |
| 新增 | `providers/context-window.ts` | G3: context window 解析 |
| 修改 | `context/default-engine.ts` | G3: 使用动态 context window |
| 新增 | `__tests__/phase-G.test.ts` | 全部测试 |
