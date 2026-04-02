# Tasks: Phase B — LSP 语义代码理解

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)

---

## 1. LSP JSON-RPC 客户端

- [x] 1.1 新增 `packages/core/src/tools/lsp/client.ts`
  - 实现 Content-Length 帧协议解析器（状态机：HEADER → BODY → 派发）
  - 实现 `LspClient` 类：`request(method, params, timeoutMs)` + `notify(method, params)`
  - pending Map 管理（id → resolve/reject/timeoutHandle）
  - 诊断通知监听：`textDocument/publishDiagnostics` → 更新 diagnostics 缓存
  - `dispose()`：发送 shutdown + exit，清理 pending
  - 进程意外退出处理：reject 所有 pending，标记 disposed
  - ⚠️ 审查修复：用原生 `Buffer.indexOf()` 替代手写 `bufferIndexOf`
  - ⚠️ 审查修复：`send()` 合并 header + body 为一次写入，避免分片

- [x] 1.2 新增 `packages/core/src/tools/lsp/types.ts`
  - `LspRequest`, `LspResponse`, `LspNotification` 接口
  - `Position`, `Range`, `Location`, `Diagnostic` 类型
  - `DiagnosticSeverity` 枚举（1=Error, 2=Warning, 3=Information, 4=Hint）

---

## 2. 语言服务器配置

- [x] 2.1 新增 `packages/core/src/tools/lsp/server-configs.ts`
  - `LspServerConfig` 接口（language / detect / command / initOptions）
  - TypeScript 配置：优先本地 `node_modules/.bin/typescript-language-server`
  - Python 配置：`pyright-langserver --stdio`（优先）或 `pylsp`（fallback）
  - Go 配置：`gopls`
  - `detectLanguage(workspaceDir, filePath)` 函数：根据文件扩展名 + 工作区文件自动选择语言
  - `ALL_CONFIGS: LspServerConfig[]` 导出

---

## 3. 会话级生命周期管理

- [x] 3.1 新增 `packages/core/src/tools/lsp/lifecycle.ts`
  - `LspLifecycle` 单例类
  - `getOrStart(workspaceDir, language): Promise<LspClient | MissingDependency | null>`
  - `startServer(workspaceDir, config)` 私有方法：
    - spawn 进程
    - 捕获 `ENOENT` 错误（命令不存在），返回 `MissingDependency` 对象（含 command、installCommand、guideUrl）
    - 发送 `initialize` 请求（含 rootUri、CLIENT_CAPABILITIES）
    - 发送 `initialized` 通知
    - 等待 15s，超时则 kill 进程返回 null
  - 启动锁（防并发重复启动同一 key）
  - `notInstalledLanguages: Set<string>` 缓存本会话已确认不可用的语言（快速路径）
  - `resetIdleTimer(key)`：5 分钟无调用后自动 dispose
  - `openFile(client, filePath)`：检查缓存，未打开则 `textDocument/didOpen`
  - 已打开文件 LRU 上限 100 个
  - ⚠️ 审查修复：Windows 下 `spawn` 始终用 `shell: true`（全局安装的 npm 包在 PATH 中但 spawn 找不到）

- [x] 3.2 新增 `packages/core/src/tools/lsp/types.ts` 中追加类型
  - `MissingDependency` 接口：{ missingCommand, installCommand, guideUrl }

---

## 4. lsp_hover 工具

- [x] 4.1 新增 `packages/core/src/tools/builtins/lsp-hover.ts`
  - 参数：`file`（string）、`line`（number，1-based）、`column`（number，1-based）
  - 通过 `LspLifecycle.getOrStart()` 获取客户端
  - 处理返回值：
    - 若是 `MissingDependency`：返回安装提示，metadata.actionable=true，metadata.suggestedCommand=install command
    - 若是 `null`：返回"LSP 服务器不可用"
    - 若是 `LspClient`：继续
  - 转换 1-based 行列为 LSP 0-based Position
  - 发送 `textDocument/hover` 请求
  - 格式化输出：类型签名 + 文档注释 + 位置
  - 结果为 null 时 → "该位置没有符号信息"

---

## 5. lsp_definition 工具

- [x] 5.1 新增 `packages/core/src/tools/builtins/lsp-definition.ts`
  - 参数：`file`、`line`、`column`
  - 处理缺失依赖同 lsp_hover
  - 发送 `textDocument/definition` 请求
  - 处理单个 Location 和 Location[] 两种响应格式
  - 格式化输出：每个定义位置 + 该行代码预览（读文件对应行）

---

## 6. lsp_references 工具

- [x] 6.1 新增 `packages/core/src/tools/builtins/lsp-references.ts`
  - 参数：`file`、`line`、`column`、`include_declaration?`（默认 false）
  - 处理缺失依赖同 lsp_hover
  - 发送 `textDocument/references` 请求（含 context.includeDeclaration）
  - 格式化输出：每处引用位置 + 该行代码预览
  - 截断保护：最多返回 50 处，超出时提示总数

---

## 7. lsp_diagnostics 工具

- [x] 7.1 新增 `packages/core/src/tools/builtins/lsp-diagnostics.ts`
  - 参数：`file?`（省略则返回所有已缓存文件诊断）、`severity?`（默认 'error'）
  - 处理缺失依赖同 lsp_hover
  - 若指定 file：先调用 `openFile()` 触发诊断推送，等待最多 3s
  - 从 LspClient 的 diagnostics 缓存读取结果
  - 格式化输出：每条诊断含行号、消息、错误码
  - 等待超时 → "诊断加载中，请稍后重试"

---

## 8. 注册工具

- [x] 8.1 修改 `packages/core/src/tools/builtins/index.ts`
  - 导入并注册 `lspHoverTool`, `lspDefinitionTool`, `lspReferencesTool`, `lspDiagnosticsTool`

---

## 9. 单元测试

> 测试策略：使用 in-process `PassThrough` stream mock，无需真实语言服务器。详见 [design.md B14 节](./design.md#b14-单元测试设计)。

### 9.1 帧解析测试（`src/__tests__/lsp/frame-parser.test.ts`）

- [x] 9.1.1 T1 — 完整帧解析：单次 push 完整帧，resolve value 正确
- [x] 9.1.2 T2 — body 分片（chunkSize=1 字节逐字节 push），最终 resolve 正确
- [x] 9.1.3 T3 — body 分片（chunkSize=10 字节），最终 resolve 正确
- [x] 9.1.4 T4 — 多帧粘包（2 条消息 concat 后一次 push），两个 Promise 均 resolve
- [x] 9.1.5 T5 — 多帧粘包（3 条消息 concat 后一次 push），三个 Promise 均 resolve
- [x] 9.1.6 T6 — 跨边界分隔符（`\r\n\r\n` 拆为两个 chunk），正确识别 header 边界
- [x] 9.1.7 T7 — 超大消息体（128KB body，分 4KB chunk push），解析结果与原始一致
- [x] 9.1.8 T8 — 并发请求有序响应（id=3,1,2 顺序到达），每个 Promise 拿到自己的响应

### 9.2 客户端行为测试（`src/__tests__/lsp/client.test.ts`）

- [x] 9.2.1 T9 — request 超时（timeout=100ms，mock 不回复），Promise reject 含 'timeout'
- [x] 9.2.2 T10 — 进程意外退出后所有 pending Promise 均被 reject

### 9.3 类型工具测试（`src/__tests__/lsp/types.test.ts`）

- [x] 9.3.1 T11 — `detectLanguageId('foo.ts')` → `'typescript'`
- [x] 9.3.2 T12 — `detectLanguageId('bar.py')` → `'python'`
- [x] 9.3.3 T13 — `detectLanguageId('foo.xyz')` → `'plaintext'`

### 9.4 工具层行为测试（`src/__tests__/lsp/tools.test.ts`）

- [x] 9.4.1 T14 — lsp_hover：`getOrStart` 返回 `MissingDependency` 时，result 含 `suggestedCommand`，`metadata.actionable=true`
- [x] 9.4.2 T15 — lsp_diagnostics：预填 `client.diagnostics` Map，工具返回预填的诊断信息

---

## 10. 编译验证

- [x] 10.1 `npx tsc --noEmit` 通过，0 错误
- [x] 10.2 `pnpm --filter @equality/core test:lsp` 全部 26 个测试通过（T1-T15 + 附加，4 个测试文件）
