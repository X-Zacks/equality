# Tasks: Phase B — LSP 语义代码理解

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)

---

## 1. LSP JSON-RPC 客户端

- [ ] 1.1 新增 `packages/core/src/tools/lsp/client.ts`
  - 实现 Content-Length 帧协议解析器（状态机：HEADER → BODY → 派发）
  - 实现 `LspClient` 类：`request(method, params, timeoutMs)` + `notify(method, params)`
  - pending Map 管理（id → resolve/reject/timeoutHandle）
  - 诊断通知监听：`textDocument/publishDiagnostics` → 更新 diagnostics 缓存
  - `dispose()`：发送 shutdown + exit，清理 pending
  - 进程意外退出处理：reject 所有 pending，标记 disposed

- [ ] 1.2 新增 `packages/core/src/tools/lsp/types.ts`
  - `LspRequest`, `LspResponse`, `LspNotification` 接口
  - `Position`, `Range`, `Location`, `Diagnostic` 类型
  - `DiagnosticSeverity` 枚举（1=Error, 2=Warning, 3=Information, 4=Hint）

---

## 2. 语言服务器配置

- [ ] 2.1 新增 `packages/core/src/tools/lsp/server-configs.ts`
  - `LspServerConfig` 接口（language / detect / command / initOptions）
  - TypeScript 配置：优先本地 `node_modules/.bin/typescript-language-server`
  - Python 配置：`pyright-langserver --stdio`（优先）或 `pylsp`（fallback）
  - Go 配置：`gopls`
  - `detectLanguage(workspaceDir, filePath)` 函数：根据文件扩展名 + 工作区文件自动选择语言
  - `ALL_CONFIGS: LspServerConfig[]` 导出

---

## 3. 会话级生命周期管理

- [ ] 3.1 新增 `packages/core/src/tools/lsp/lifecycle.ts`
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

- [ ] 3.2 新增 `packages/core/src/tools/lsp/types.ts` 中追加类型
  - `MissingDependency` 接口：{ missingCommand, installCommand, guideUrl }

---

## 4. lsp_hover 工具

- [ ] 4.1 新增 `packages/core/src/tools/builtins/lsp-hover.ts`
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

- [ ] 5.1 新增 `packages/core/src/tools/builtins/lsp-definition.ts`
  - 参数：`file`、`line`、`column`
  - 处理缺失依赖同 lsp_hover
  - 发送 `textDocument/definition` 请求
  - 处理单个 Location 和 Location[] 两种响应格式
  - 格式化输出：每个定义位置 + 该行代码预览（读文件对应行）

---

## 6. lsp_references 工具

- [ ] 6.1 新增 `packages/core/src/tools/builtins/lsp-references.ts`
  - 参数：`file`、`line`、`column`、`include_declaration?`（默认 false）
  - 处理缺失依赖同 lsp_hover
  - 发送 `textDocument/references` 请求（含 context.includeDeclaration）
  - 格式化输出：每处引用位置 + 该行代码预览
  - 截断保护：最多返回 50 处，超出时提示总数

---

## 7. lsp_diagnostics 工具

- [ ] 7.1 新增 `packages/core/src/tools/builtins/lsp-diagnostics.ts`
  - 参数：`file?`（省略则返回所有已缓存文件诊断）、`severity?`（默认 'error'）
  - 处理缺失依赖同 lsp_hover
  - 若指定 file：先调用 `openFile()` 触发诊断推送，等待最多 3s
  - 从 LspClient 的 diagnostics 缓存读取结果
  - 格式化输出：每条诊断含行号、消息、错误码
  - 等待超时 → "诊断加载中，请稍后重试"

---

## 8. 注册工具

- [ ] 8.1 修改 `packages/core/src/tools/builtins/index.ts`
  - 导入并注册 `lspHoverTool`, `lspDefinitionTool`, `lspReferencesTool`, `lspDiagnosticsTool`

---

## 9. 单元测试

- [ ] 9.1 新增 `packages/core/src/__tests__/phase-B.test.ts`
  - Mock LSP 服务器（in-process 的 stdio mock）
  - 测试 Content-Length 帧协议解析（完整帧、分片帧、多帧粘包）
  - 测试 `request` 超时（mock 服务器不响应）
  - 测试 `detectLanguage`（ts 文件 → typescript；py 文件 → python）
  - 测试 lsp_hover 输出格式（mock hover 响应）
  - 测试 lsp_diagnostics 从缓存读取
  - 测试 LSP 不可用时返回安装指引（命令不存在）

---

## 10. 编译验证

- [ ] 10.1 `npx tsc --noEmit` 通过，0 错误
- [ ] 10.2 `npx tsx src/__tests__/phase-B.test.ts` 所有测试通过
