# Delta Spec: Tools — Phase 3.2 工具对齐

> 变更：`phase-3.2-tool-parity`  
> 基线：`openspec/specs/tools/spec.md`

---

## ADDED Requirements

### Requirement: edit_file 精确文本替换

系统 SHALL 提供 `edit_file` 工具，支持在文件中精确替换一段文本。

行为规则：
- 系统 MUST 使用两级模糊匹配定位 `old_string`：
  1. 精确文本匹配
  2. Unicode 归一化后匹配（智能引号→ASCII、Unicode破折号→`-`、Unicode空格→普通空格）
- 匹配结果 MUST 通过唯一性检查：
  - 0 次匹配 → 降级到下一级；所有级别均失败 → 返回错误
  - 1 次匹配 → 执行替换
  - ≥2 次匹配 → 返回错误，提示"请提供更多上下文"
- `old_string` 为空字符串时 SHALL 切换到追加模式
- 替换前 MUST 创建 `.equality-bak` 备份
- 替换后 MUST 返回 unified diff 预览
- 系统 MUST 兼容 BOM 和 CRLF 行尾

#### Scenario: 精确替换文件中的一行
- GIVEN 文件 `app.ts` 包含 `const timeout = 30_000`（唯一出现）
- WHEN 调用 `edit_file(path="app.ts", old_string="const timeout = 30_000", new_string="const timeout = 60_000")`
- THEN 文件中该行被替换
- AND 返回包含 diff 的成功消息
- AND `.equality-bak` 备份已创建

#### Scenario: Unicode 模糊匹配
- GIVEN 文件包含 Unicode 智能引号 `"hello"`
- WHEN `old_string` 使用 ASCII 引号 `"hello"`
- THEN 第 1 级精确匹配失败
- AND 第 2 级 Unicode 归一化后匹配成功
- AND 替换正常执行

#### Scenario: 多次匹配报错
- GIVEN 文件中 `return true` 出现 3 次
- WHEN 调用 `edit_file(old_string="return true", new_string="return false")`
- THEN 返回错误："old_string 在文件中出现了 3 次，无法安全替换"

---

### Requirement: grep 文本搜索

系统 SHALL 提供 `grep` 工具，支持在工作区文件中搜索文本模式。

行为规则：
- 系统 MUST 支持正则表达式和字面量两种搜索模式
- 系统 MUST 支持大小写不敏感搜索
- 系统 MUST 支持上下文行显示（0-10 行）
- 系统 MUST 支持按 glob 模式过滤搜索文件
- 系统 MUST 自动跳过二进制文件（按扩展名 + null byte 检测）
- 系统 MUST 默认忽略 `node_modules/`、`.git/`、`dist/`、`build/`
- 输出 MUST 按文件分组，每条显示行号
- 单条匹配行超过 500 字符 MUST 截断
- 总匹配数默认上限 100 条，可配置至 500
- 当 `path` 指向文件时 SHALL 切换到单文件搜索模式

#### Scenario: 正则搜索 TypeScript 文件
- GIVEN 工作区包含多个 `.ts` 文件
- WHEN 调用 `grep(pattern="export\\s+function", include="*.ts")`
- THEN 返回所有匹配行（按文件分组）
- AND 每条包含文件路径和行号

#### Scenario: 字面量搜索带上下文
- GIVEN 文件 `runner.ts` 包含 "TODO" 注释
- WHEN 调用 `grep(pattern="TODO", literal=true, context_lines=2)`
- THEN 返回匹配行及前后各 2 行
- AND 匹配行前标记 `>`

---

### Requirement: list_dir 目录列表

系统 SHALL 提供 `list_dir` 工具，列出目录内容。

行为规则：
- 系统 MUST 使用 `readdirSync({ withFileTypes: true })` 读取
- 排序规则：目录在前，文件在后；同类型内按字母排序（大小写不敏感）
- 目录条目 MUST 显示 `📁` + `/` 后缀
- 文件条目 MUST 显示 `📄` + 文件大小（格式化为 B/KB/MB/GB）
- 符号链接 MUST 显示 `🔗`
- 不可访问的条目 MUST 显示 `❓`
- 条目上限 500 条

#### Scenario: 列出项目根目录
- GIVEN 工作区根目录包含 src/ 目录和 package.json 文件
- WHEN 调用 `list_dir()`
- THEN src/ 排在 package.json 前面（目录优先）
- AND 每个文件显示大小

---

### Requirement: web_search 网页搜索

系统 SHALL 提供 `web_search` 工具，通过搜索引擎搜索网页。

行为规则：
- 系统 MUST 支持至少两个搜索引擎：
  1. Brave Search API（主力，需 `BRAVE_SEARCH_API_KEY` 环境变量）
  2. DuckDuckGo HTML 抓取（回退，无需 API key）
- Brave API 不可用时 MUST 自动回退到 DuckDuckGo
- 系统 MUST 支持企业代理穿透（undici ProxyAgent）
- 系统 SHOULD 实现内存缓存（TTL 5 分钟）
- 每条结果 MUST 包含：标题、URL、摘要
- 超时 MUST 为 15 秒

#### Scenario: 使用 Brave Search 搜索
- GIVEN `BRAVE_SEARCH_API_KEY` 已设置
- WHEN 调用 `web_search(query="TypeScript generics")`
- THEN 通过 Brave API 搜索
- AND 返回格式化的结果列表

#### Scenario: 回退到 DuckDuckGo
- GIVEN `BRAVE_SEARCH_API_KEY` 未设置
- WHEN 调用 `web_search(query="TypeScript generics")`
- THEN 通过 DuckDuckGo HTML 抓取搜索
- AND 返回格式化的结果列表

---

### Requirement: bash 后台进程支持

系统 MUST 增强 `bash` 工具以支持后台进程执行。

行为规则：
- 新增 `background` 参数（boolean）
- `background: true` 时：
  - 系统 MUST 立即返回进程 ID（8 位 hex）
  - 进程在后台继续运行
  - stdout/stderr MUST 持续收集
  - 后台进程默认超时 5 分钟，超时后自动 SIGTERM → SIGKILL
- 后台进程 MUST 可通过 `process` 工具管理

#### Scenario: 后台执行长时间命令
- GIVEN 用户需要运行一个长时间命令
- WHEN 调用 `bash(command="npm run build", background=true)`
- THEN 立即返回 sessionId
- AND 进程在后台继续运行

---

### Requirement: process 后台进程管理

系统 SHALL 提供 `process` 工具管理后台进程。

行为规则：
- 系统 MUST 支持以下操作：
  - `list` — 列出所有后台进程
  - `poll` — 等待新增输出（增量，默认等待 5 秒）
  - `log` — 查看完整日志
  - `write` — 向 stdin 写入数据
  - `kill` — 终止进程
- `poll` MUST 返回自上次 poll 以来的增量输出
- `kill` MUST 先发送 SIGTERM，500ms 后发送 SIGKILL

#### Scenario: 管理后台构建进程
- GIVEN bash 后台启动了 `npm run build`，返回 id="abc12345"
- WHEN 调用 `process(action="poll", id="abc12345")`
- THEN 返回自上次以来的新输出
- AND 状态指示 "running" 或 "exited"

---

### Requirement: apply_patch 多文件补丁

系统 SHALL 提供 `apply_patch` 工具，支持一次性修改多个文件。

行为规则：
- 补丁格式 MUST 使用 `*** Begin Patch` / `*** End Patch` 边界标记
- 系统 MUST 支持三种操作：
  - `*** Add File: path` — 创建新文件
  - `*** Update File: path` — 修改已有文件
  - `*** Delete File: path` — 删除文件
- Update 操作 MUST 使用四级回退匹配（seekSequence）：
  1. 精确匹配
  2. trimEnd（忽略行尾空白）
  3. trim（忽略首尾空白）
  4. trim + normalizePunctuation（Unicode 标点归一化）
- 所有路径 MUST 在 workspace 范围内
- Update 前 MUST 创建备份

#### Scenario: 多文件补丁
- GIVEN 工作区有 `a.ts` 和 `b.ts`
- WHEN 调用 apply_patch 同时修改两个文件
- THEN 两个文件都被正确修改
- AND 各自创建了 `.equality-bak` 备份

---

## MODIFIED Requirements

### Requirement: 工具注册（修改）

Phase 2 的内置工具列表从 5 个扩展为 11+：

| 工具名 | 功能 | 引入 Phase |
|--------|------|-----------|
| `bash` | Shell 命令执行（含后台进程支持） | Phase 2 + 3.2 增强 |
| `read_file` | 读取文件内容 | Phase 2 |
| `write_file` | 写入文件内容 | Phase 2 |
| `edit_file` | 精确文本替换 | **Phase 3.2** |
| `glob` | 文件路径模式匹配 | Phase 2 |
| `grep` | 文本搜索 | **Phase 3.2** |
| `list_dir` | 目录列表 | **Phase 3.2** |
| `web_fetch` | 抓取网页内容 | Phase 2 |
| `web_search` | 网页搜索 | **Phase 3.2** |
| `read_image` | 图片视觉分析 | Phase 3.1 |
| `read_pdf` | PDF 文本提取 | Phase 3.1 |
| `process` | 后台进程管理 | **Phase 3.2** |
| `apply_patch` | 多文件补丁 | **Phase 3.2** |
