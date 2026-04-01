# Proposal: Phase B — LSP 语义代码理解

> 优先级: 🔴 P1（原 P0 降级，Phase A 已补齐可靠性基础）
> 对标: OpenClaw `pi-bundle-lsp-runtime.ts`（310行）、`embedded-pi-lsp.ts`
> 依赖: engineering-parity-gap-analysis.md (GAP-2)

---

## 意图

Equality 当前所有代码理解能力依赖纯文本工具（`grep`、`glob`、`read_file`），无任何 AST/类型/引用层面的语义感知。Agent 在执行多文件重构任务时极容易出现以下问题：

1. **遗漏引用**：重命名一个函数时，用 grep 搜索字符串可能漏掉动态引用、类型约束中的用法
2. **类型误判**：不知道变量的实际类型，只能猜测或读完整文件
3. **诊断盲区**：Agent 无法主动查询"当前有哪些 TypeScript 错误"，只能靠执行 tsc 间接知晓
4. **定义跳转靠猜**：在大型代码库里找函数实现，grep 可能匹配到多个同名符号

OpenClaw 通过集成 LSP（Language Server Protocol）协议解决了这些问题：启动语言服务器（tsserver/pyright/gopls 等），复用编辑器级别的语义能力，提供 hover/definition/references/diagnostics 四个工具。

## 目标

为 Equality Agent 增加四个 LSP 语义工具：

1. **`lsp_hover`** — 获取符号的类型信息和文档注释（替代"读整个文件猜类型"）
2. **`lsp_definition`** — 跳转到符号定义（替代 grep 找函数体）
3. **`lsp_references`** — 查找符号所有引用（替代 grep 找调用方）
4. **`lsp_diagnostics`** — 获取文件/工作区的当前诊断信息（TypeScript 错误、未使用变量等）

底层通过会话级 LSP 客户端与语言服务器通信，使用 JSON-RPC over stdio。

## 范围

**包含**：
- `tools/lsp/client.ts`：LSP JSON-RPC 客户端（stdio 传输，Content-Length 帧协议）
- `tools/lsp/server-configs.ts`：语言服务器配置（tsserver、pyright、gopls 等）
- `tools/lsp/lifecycle.ts`：会话级 LSP 进程管理（按 workspaceDir 缓存、空闲超时关闭）
- `tools/builtins/lsp-hover.ts`：`lsp_hover` 工具
- `tools/builtins/lsp-definition.ts`：`lsp_definition` 工具
- `tools/builtins/lsp-references.ts`：`lsp_references` 工具
- `tools/builtins/lsp-diagnostics.ts`：`lsp_diagnostics` 工具
- 注册到 `builtins/index.ts`
- 单元测试（mock LSP 服务器）

**不包含**：
- 语义感知重构工具（`lsp_rename`、`lsp_code_action`）→ Phase B.1
- 补全工具（`lsp_completion`）→ 对 Agent 无意义，不实现
- 除 TypeScript/Python/Go 以外的语言 → 按需后续扩展
- LSP 服务器安装/下载管理 → 用户自行安装，工具检测是否可用

## 成功标准

1. Agent 能在 TypeScript 项目中调用 `lsp_hover` 获取变量类型，结果包含类型签名
2. Agent 能调用 `lsp_definition` 跳转到函数定义，结果包含文件路径和行号
3. Agent 能调用 `lsp_references` 找到函数的所有调用方
4. Agent 能调用 `lsp_diagnostics` 获取当前 TypeScript 错误列表（无需运行 tsc）
5. 同一 workspaceDir 的多次工具调用复用同一个 LSP 进程（不重复启动）
6. 空闲 5 分钟的 LSP 进程自动关闭（释放资源）
7. LSP 服务器未安装时，工具返回明确的安装提示，不崩溃
8. `npx tsc --noEmit` 编译通过
