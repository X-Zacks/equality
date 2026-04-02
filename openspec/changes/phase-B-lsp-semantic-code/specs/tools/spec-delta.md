# Delta Spec: Phase B — LSP 语义代码理解

> 目标规格文件: `openspec/specs/tools/spec.md`
> 变更类型: ADDED

---

## ADDED Requirements

### Requirement: LSP 语义工具

系统 SHALL 提供四个 LSP 语义工具，通过 Language Server Protocol 与语言服务器通信，为 Agent 提供编辑器级别的代码理解能力。

```
支持的语言服务器：
  - TypeScript/JavaScript: typescript-language-server
  - Python: pyright-langserver 或 pylsp
  - Go: gopls
```

#### Scenario: lsp_hover — 获取符号类型

- GIVEN Agent 需要了解某个变量或函数的类型
- WHEN Agent 调用 `lsp_hover(file, line, column)`
- THEN 系统 SHALL 返回该位置符号的类型签名和文档注释
- AND 返回格式包含类型信息、文档说明、源码位置

#### Scenario: lsp_hover — LSP 服务器未安装

- GIVEN 系统检测到 typescript-language-server 未安装
- WHEN Agent 调用 `lsp_hover`
- THEN 系统 SHALL 返回包含以下信息的结果：
  - 缺失的命令名 (`missingCommand`)
  - 推荐的安装命令 (`suggestedCommand`)
  - 文档链接 (`guideUrl`)
  - 标记 `actionable=true`
- AND **不抛异常、不崩溃**
- AND Agent 可以根据 `suggestedCommand` 调用 `bash` 工具自动执行安装：
  ```
  bash: npm install -g typescript-language-server typescript
  ```
- AND 安装完成后 Agent 可重试 `lsp_hover`（自动使用新安装的服务器）

#### Scenario: lsp_hover — 光标不在符号上

- GIVEN Agent 指定了一个空白位置或注释位置
- WHEN 语言服务器返回 null 响应
- THEN 系统 SHALL 返回 `"该位置没有符号信息"`
- AND 不返回错误，Agent 可正常继续

#### Scenario: lsp_definition — 跳转到定义

- GIVEN Agent 需要找到函数或类的定义位置
- WHEN Agent 调用 `lsp_definition(file, line, column)`
- THEN 系统 SHALL 返回所有定义位置（文件路径 + 行号 + 代码预览）
- AND 多个定义位置（如接口 + 实现）时全部列出

#### Scenario: lsp_definition — LSP 服务器未安装

- GIVEN 系统检测到 typescript-language-server 未安装
- WHEN Agent 调用 `lsp_definition`
- THEN 系统 SHALL 返回缺失依赖信息（同 lsp_hover）
- AND Agent 可调用 `bash` 工具安装，再重试 `lsp_definition`

#### Scenario: lsp_references — 查找所有引用

- GIVEN Agent 需要找到某符号的所有使用位置（例如重构前确认影响范围）
- WHEN Agent 调用 `lsp_references(file, line, column)`
- THEN 系统 SHALL 返回所有引用位置（文件路径 + 行号 + 代码预览）
- AND 结果超过 50 处时截断并提示总数

#### Scenario: lsp_references — LSP 服务器未安装

- GIVEN 系统检测到 typescript-language-server 未安装
- WHEN Agent 调用 `lsp_references`
- THEN 系统 SHALL 返回缺失依赖信息（同 lsp_hover）
- AND Agent 可调用 `bash` 工具安装，再重试 `lsp_references`

#### Scenario: lsp_diagnostics — 获取诊断信息

- GIVEN Agent 需要了解当前代码中的类型错误（无需运行 tsc）
- WHEN Agent 调用 `lsp_diagnostics(file?)`
- THEN 系统 SHALL 返回该文件（或所有已打开文件）的诊断信息
- AND 按 severity 过滤（默认只返回 error 级别）

#### Scenario: lsp_diagnostics — LSP 服务器未安装

- GIVEN 系统检测到 typescript-language-server 未安装
- WHEN Agent 调用 `lsp_diagnostics`
- THEN 系统 SHALL 返回缺失依赖信息（同 lsp_hover）
- AND Agent 可调用 `bash` 工具安装，再重试 `lsp_diagnostics`

---

### Requirement: LSP 进程生命周期管理

系统 SHALL 维护会话级 LSP 进程池，确保资源高效使用。

#### Scenario: 复用已启动的语言服务器

- GIVEN 同一 workspaceDir 的第一次 lsp_* 工具调用已启动了 typescript-language-server
- WHEN Agent 再次调用任意 lsp_* 工具（相同 workspaceDir）
- THEN 系统 SHALL 复用已有进程，不重新启动
- AND 重置空闲超时计时器

#### Scenario: 空闲超时自动关闭

- GIVEN 一个 LSP 服务器进程空闲超过 5 分钟（无任何工具调用）
- WHEN 空闲计时器触发
- THEN 系统 SHALL 发送 `shutdown` 请求后发送 `exit` 通知
- AND 从进程池中移除该条目
- AND 下次工具调用时重新启动

#### Scenario: 语言服务器未安装时的快速路径

- GIVEN 本会话内已检测到某个语言服务器不可用（缺失依赖）
- WHEN Agent 再次调用该语言的任意 lsp_* 工具
- THEN 系统 SHALL 立即返回缺失依赖信息，**不再尝试启动**
- AND 避免重复的启动超时等待（>15s）

#### Scenario: 语言服务器启动超时

- GIVEN 语言服务器启动耗时超过 15 秒（初始化未完成）
- WHEN 启动超时触发
- THEN 系统 SHALL kill 进程，返回超时提示
- AND 本次会话内该语言标记为不可用，不再重试（避免每次调用都等 15s）

---

### Requirement: JSON-RPC 帧协议

系统 SHALL 使用 Content-Length 帧协议与 LSP 服务器通信（HTTP header 风格）。

```
Content-Length: <N>\r\n
\r\n
<N bytes of UTF-8 JSON>
```

#### Scenario: 请求超时

- GIVEN 发出 LSP 请求后 10 秒内未收到响应
- WHEN 超时触发
- THEN 系统 SHALL reject 该请求（返回超时错误）
- AND 客户端 **不** 关闭（其他进行中的请求不受影响）

#### Scenario: 完整帧解析

- GIVEN 一个完整的 LSP 消息（header + body）在单次 `data` 事件中到达
- WHEN 解析器处理该 chunk
- THEN 系统 SHALL 正确提取 Content-Length 值，读取对应字节数的 body
- AND 将 body 解析为 JSON-RPC 对象并派发

#### Scenario: 分片帧 — body 跨多个 chunk

- GIVEN stdout 数据分多个 chunk 到达（body 被拆分）
- WHEN 解析器依次接收到各个不完整的 chunk
- THEN 系统 SHALL 将数据缓冲到 `rawBuffer`，等待 `rawBuffer.length >= Content-Length` 后再解析
- AND 解析后将消费的字节从缓冲区移除，剩余数据保留

#### Scenario: 多帧粘包 — 单次 chunk 含多条完整消息

- GIVEN 两条或更多完整的 LSP 消息在同一次 `data` 事件中连续到达（粘包）
- WHEN 解析器处理该 chunk
- THEN 系统 SHALL 解析并派发第一条消息后，**继续**解析缓冲区剩余数据
- AND 所有消息均被正确解析，无消息丢失、无消息重复

#### Scenario: 跨边界分隔符 — `\r\n\r\n` 被拆分到两个 chunk

- GIVEN header 中的 `\r\n\r\n` 分隔符前两字节（`\r\n`）在第一个 chunk，后两字节（`\r\n`）在第二个 chunk
- WHEN 解析器依次处理这两个 chunk
- THEN 系统 SHALL 在第二个 chunk 到达后正确识别出完整 header 边界
- AND 继续等待 body 数据，不产生误解析

#### Scenario: 超大消息体（>64KB）

- GIVEN 一条 LSP 消息的 body 超过 64KB（如大型文件的 `didOpen` 通知）
- WHEN 消息被分成若干个 chunk 到达
- THEN 系统 SHALL 正确累积所有 chunk 直到 Content-Length 满足
- AND 解析结果与完整消息一致

#### Scenario: 并发请求有序响应

- GIVEN 连续发出 3 个 LSP 请求（id=1, id=2, id=3）
- WHEN 响应以不同顺序到达（如 id=3, id=1, id=2）
- THEN 系统 SHALL 通过 pending Map 将每个响应路由到对应的 Promise
- AND 每个 `request()` 调用收到其对应的响应，互不干扰
