# Tasks: Phase 3.2 — 内置工具全面对齐 OpenClaw

## Section 1: edit_file — 精确文本替换工具 [P0]

- [x] 1.1 创建 `tools/builtins/edit-file.ts`
  - 两级模糊匹配（精确 → Unicode 归一化）
  - Unicode 归一化函数 `normalizeUnicode()`：智能引号、Unicode 破折号、Unicode 空格
  - 唯一性检查（0 次→降级，1 次→替换，≥2 次→报错）
  - BOM 剥离、CRLF 兼容（读取归一化 LF，写入还原）
  - 追加模式（old_string 为空）
  - 写入前 `.equality-bak` 备份
  - 返回 unified diff 反馈
- [x] 1.2 注册到 `builtinTools` 数组
- [ ] 1.3 测试：替换文件中的一行代码

## Section 2: grep — 文本搜索工具 [P0]

- [x] 2.1 创建 `tools/builtins/grep.ts`
  - 纯 JS 实现（fast-glob + fs.readFileSync + RegExp）
  - 支持 regex / literal 两种模式
  - 大小写不敏感选项
  - 上下文行显示（context_lines，最大 10）
  - 文件过滤（include glob 模式）
  - 单文件搜索模式（path 指向文件时）
  - 二进制文件跳过（30+ 扩展名 + null byte 检测）
  - 长行截断（500 字符）
  - 默认忽略 node_modules/.git/dist/build/*.min.*
  - 输出按文件分组 + 行号
  - 最大 100 条匹配（可配置至 500）
  - 输出截断保护（truncateToolResult）
- [x] 2.2 注册到 `builtinTools` 数组
- [ ] 2.3 测试：搜索工作区中的代码模式

## Section 3: list_dir — 目录列表工具 [P0]

- [x] 3.1 创建 `tools/builtins/list-dir.ts`
  - `fs.readdirSync({ withFileTypes: true })`
  - 排序：目录在前 + 字母排序（localeCompare，大小写不敏感）
  - 目录加 `📁` + `/` 后缀
  - 文件显示 `📄` + 大小（B/KB/MB/GB）
  - 符号链接显示 `🔗`
  - 无法访问的条目显示 `❓`
  - 最大 500 条
- [x] 3.2 注册到 `builtinTools` 数组
- [ ] 3.3 测试：列出工作区根目录

## Section 4: web_search — 网页搜索工具 [P0]

- [x] 4.1 创建 `tools/builtins/web-search.ts`
  - 双 Provider 架构（Brave Search API + DuckDuckGo HTML 回退）
  - Brave Search：`GET /res/v1/web/search`，`X-Subscription-Token` 认证
  - DuckDuckGo：HTML 抓取 `html.duckduckgo.com`，解析 result 块
  - DDG 链接去重定向（uddg= 参数解码）
  - HTML 标签剥离（stripHtml）
  - 企业代理穿透（undici ProxyAgent）
  - 内存缓存（key=query|count|lang，TTL 5 分钟）
  - 15 秒超时
  - 格式化输出：编号 + 标题粗体 + URL + 摘要 + 日期
- [x] 4.2 注册到 `builtinTools` 数组
- [ ] 4.3 测试：搜索 "TypeScript generics"

## Section 5: bash 增强 — 后台进程支持 [P1]

- [x] 5.1 创建 `tools/builtins/process-manager.ts` — 后台进程状态管理
  - `BackgroundProcess` 接口定义
  - `ProcessManager` 类（Map 存储，进程级生命周期）
  - `spawn()` — 启动后台进程，分配 8 位 hex ID
  - `get()` / `list()` / `poll()` / `write()` / `kill()`
  - poll 增量输出（记录 offset，等待 timeout_ms）
  - 超时自动清理（默认 5 分钟后 SIGTERM → SIGKILL）
  - 最大 20 个并发后台进程
  - 单进程最大输出收集 500K 字符
- [x] 5.2 增强 `tools/builtins/bash.ts`
  - 新增 `background` 参数
  - background=true 时：用 ProcessManager.spawn()，立即返回 sessionId
  - 后台模式默认超时 300s
  - 返回格式含 ID/PID/命令/超时信息 + process 工具使用提示
- [ ] 5.3 测试：后台启动 `ping -t localhost`，用 process 查看

## Section 6: process — 后台进程管理工具 [P1]

- [x] 6.1 创建 `tools/builtins/process-tool.ts`
  - `action: "list"` — 列出所有后台进程（id + command + status + 运行时长 + PID）
  - `action: "poll"` — 等待新增输出（增量，timeout_ms 默认 5s，200ms 轮询间隔）
  - `action: "log"` — 查看完整日志（truncateToolResult 截断保护）
  - `action: "write"` — 向 stdin 写入数据
  - `action: "kill"` — 终止进程（SIGTERM → 500ms → SIGKILL）
  - 友好的状态图标（🟢 running / ⚫ exited）
- [x] 6.2 注册到 `builtinTools` 数组
- [ ] 6.3 测试：bash 后台启动 → process list → process poll → process kill

## Section 7: apply_patch — 多文件补丁工具 [P1]

- [x] 7.1 创建 `tools/builtins/apply-patch.ts`
  - 补丁格式解析器（parsePatch）
    - `*** Begin Patch` / `*** End Patch` 边界
    - `*** Add File: path` → 收集 `+` 行
    - `*** Delete File: path` → 标记删除
    - `*** Update File: path` → 解析 `@@` hunks + `-/+/空格` 行
  - 四级回退匹配（seekSequence）
    - 精确 → trimEnd → trim → trim + normalizePunctuation
    - normalizePunctuation：Unicode 智能引号→ASCII、Unicode 破折号→`-`、Unicode 空格→普通空格
  - Update 操作：逆序 splice 应用替换（避免索引偏移）
  - 安全限制：workspace 边界检查、备份机制
  - Add 操作：不覆盖已存在文件
  - Delete 操作：确认文件存在后删除
  - BOM 剥离 + CRLF 兼容
- [x] 7.2 注册到 `builtinTools` 数组
- [ ] 7.3 测试：应用一个包含 Add + Update + Delete 的多文件补丁

## Section 8: 更新 Tools Spec（Delta Spec）

- [x] 8.1 创建 Delta Spec: `phase-3.2-tool-parity/specs/tools/spec.md`
  - ADDED: edit_file, grep, list_dir, web_search, bash 后台, process, apply_patch
  - MODIFIED: 工具注册列表从 5 → 13 个
- [ ] 8.2 归档时将 Delta 合并入 `openspec/specs/tools/spec.md`

## 验收

- [x] V1 所有新工具注册到 builtinTools 且类型检查通过（13 个工具，0 个 TS 错误）
- [ ] V2 LLM 能自动选择 edit_file 替代 write_file 进行小改动
- [ ] V3 LLM 能自动选择 grep 搜索代码
- [ ] V4 LLM 能自动选择 list_dir 浏览目录
- [ ] V5 web_search 能返回搜索结果
- [ ] V6 bash background + process 协作完成后台任务
- [ ] V7 apply_patch 能一次修改多个文件
