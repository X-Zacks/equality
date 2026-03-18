# Tasks: Phase 2 — Tools + Skills

## 前置条件
- Phase 1 完成，Agent Core 可流式对话
- Copilot Provider 已实现（带代理支持）
- pnpm monorepo 已配置

---

## 1. Tools 基础框架

- [x] 1.1 创建 `tools/types.ts`：定义 `ToolDefinition`、`ToolResult`、`ToolContext`、`ToolPolicy` 类型
- [x] 1.2 实现 `tools/registry.ts`：ToolRegistry 类
  - `register()` / `unregister()` / `resolve()` / `getToolSchemas()` / `list()`
  - 容错匹配：精确 → 标准化 → 命名空间剥离 → 大小写不敏感
  - 重复注册检测（同名抛错）
- [x] 1.3 实现 `tools/truncation.ts`：Tool Result 截断
  - 上限 30,000 字符（实际实施时从 400K 降至 30K，防止撑爆上下文窗口）
  - head + tail 策略（各取一半）
  - 截断标记：`[...内容已截断...]`
- [x] 1.4 实现 `tools/policy.ts`：工具策略过滤
  - 全局 allow / deny 名单
  - deny 优先于 allow
  - 从配置文件读取

## 2. 内置工具实现

- [x] 2.1 实现 `tools/builtins/bash.ts`：Shell 命令执行
  - Windows 默认 PowerShell（`powershell.exe -NoProfile -NonInteractive -Command`）
  - 可配置切换 `cmd.exe /c`
  - 超时控制（默认 30s，最大 120s）
  - 环境变量继承（含 HTTPS_PROXY / HTTP_PROXY）
  - stdout + stderr 合并
  - AbortSignal 取消支持
  - 退出码非零 → `isError: true`
- [x] 2.2 实现 `tools/builtins/read-file.ts`：文件读取
  - 支持行范围（`start_line` / `end_line`，1-based）
  - 输出带行号前缀（`  1 | code`）
  - 400K 字符截断保护
  - 文件不存在 → 友好错误
  - 相对路径基于 `workspaceDir`
- [x] 2.3 实现 `tools/builtins/write-file.ts`：文件写入
  - 自动创建目录（`mkdirSync recursive`）
  - UTF-8 编码
  - 写入前备份（`*.equality-bak`）
  - 返回写入字节数 + 绝对路径
- [x] 2.4 实现 `tools/builtins/glob.ts`：文件搜索
  - 使用 `fast-glob`
  - 默认忽略 `node_modules`、`.git`、`dist`、`build`
  - 结果最多 500 条
  - 返回相对路径列表
- [x] 2.5 实现 `tools/builtins/web-fetch.ts`：网页抓取
  - Node.js 原生 `fetch` + `undici.ProxyAgent`（实际实施改用 undici dispatcher，Node 22 原生 fetch 不读 HTTPS_PROXY）
  - 自动使用全局 HTTPS_PROXY
  - TLS 选项继承全局配置
  - HTML → cheerio 提取纯文本
  - 非 HTML 直接返回
  - 15 秒超时
  - User-Agent 伪装
  - 默认 50K 字符上限

## 3. Provider 接口扩展

- [x] 3.1 扩展 `providers/types.ts`
  - `StreamChatOptions` 添加 `tools?: OpenAIToolSchema[]`
  - `ChatDelta` 添加 `toolCalls?: ToolCallDelta[]` 和 `finishReason`
  - 新增 `ToolCallDelta` 类型（id, name, arguments）
- [x] 3.2 升级 `providers/copilot.ts`：支持 tools 参数（改用 OpenAI SDK）
  - `streamChat()` 透传 tools 到 OpenAI 兼容 API
  - 解析 stream 中的 tool_calls delta
  - 累积 arguments JSON 片段，组装完整 tool_call
  - finishReason 正确识别 `'tool_calls'` vs `'stop'`
- [x] 3.3 确保未来 DeepSeek / Qwen Provider 添加时接口一致（base.ts OpenAICompatProvider 统一）

## 4. Agent Runner 升级（Tool Loop）

- [x] 4.1 重构 `agent/runner.ts`：实现 Tool Call Loop（含上下文裁剪 trimMessages）
  - 循环：LLM → tool_calls → 执行 → 注入结果 → 再调 LLM
  - 终止条件：finishReason == 'stop'（纯文本回复）
  - 全局断路器：totalToolCalls >= 30 时强制终止
  - 每轮 token 累加到总 cost
  - AbortSignal 在循环每轮检查
- [x] 4.2 工具调用中间态推送（tool_start + tool_result，tool_update 留后续）（三阶段事件，参考 OpenClaw ACP start/update/result 模式）
  - 新增 SSE 事件：`tool_start`（工具名 + 参数 + toolCallId）
  - 新增 SSE 事件：`tool_update`（长运行工具的 partial result 增量推送）
  - 新增 SSE 事件：`tool_result`（工具结果概要 + status: completed/failed）
  - 工具执行期间推送状态（"🔧 正在执行 bash..."）
  - onDelta 回调仅在最终回复阶段触发
- [x] 4.3 错误处理
  - 工具执行错误 → 包装为 tool_result（isError: true）→ 注入给 LLM（让它自行修正）
  - 未知工具 → 返回 "未知工具 xxx" 错误（Agent 继续运行）
  - 工具超时 → 包装为超时错误，注入给 LLM

## 5. System Prompt 升级

- [x] 5.1 升级 `agent/system-prompt.ts`
  - 新增 Tool Instructions 段落（指导 LLM 如何使用工具）
  - 新增 Available Skills 段落（XML 索引，NOT 全文注入）
  - 新增 Working Directory 注入（`[Working directory: ~/path]`，参考 OpenClaw ACP cwd 前缀）
  - 保留原有时间/OS 信息
- [x] 5.2 编写 Tool Instructions 模板
  - 告诉 LLM 可用工具列表及使用场景
  - 强调：先思考再调用、避免重复调用同一工具
  - 文件操作先 glob 搜索再 read_file
  - bash 命令注意 Windows 环境

## 6. Skills 基础框架

- [x] 6.1 创建 `skills/types.ts`：定义 `Skill`、`SkillEntry`、`SkillMetadata`、`SkillInstallSpec`、`SkillSource` 类型
- [x] 6.2 实现 `skills/frontmatter.ts`：SKILL.md 解析
  - YAML frontmatter 提取 + 解析
  - 安全验证（name 格式、description 长度、install spec 白名单）
  - 容错：解析失败跳过该 Skill，不阻断加载
- [x] 6.3 实现 `skills/loader.ts`：6 级优先级加载
  - 按顺序扫描 6 个来源目录
  - 同名高优先级覆盖低优先级
  - 每个来源最多 200 个 Skills
  - 单文件最大 256KB
  - 支持 `SKILL.md` 和 `<name>.skill.md` 两种命名
- [x] 6.4 实现 `skills/prompt.ts`：Skills → XML 索引（懒加载模式）
  - `formatSkillsForPrompt()`：生成 `<available_skills>` XML 索引（name + description + location）
  - **NOT 注入 Skills 全文**——模型通过 `read_file` 按需懒加载 SKILL.md
  - 路径压缩（home → ~，节省 400-600 tokens）
  - 限制：150 个 / 30,000 字符
  - 超限时二分搜索最大前缀
  - Token 成本：基础 195 字符 + 每个 skill ~24 tokens
- [x] 6.5 实现 `skills/prc-install.ts`：PRC 镜像安装命令
  - pip → 清华源
  - npm → npmmirror
  - go → goproxy.cn
  - conda → 清华 anaconda 镜像
  - `buildInstallCommand()` 函数

## 7. Skills 热更新

- [x] 7.1 实现 `skills/watcher.ts`：文件变化监听
  - 使用 chokidar 监听所有 Skills 目录
  - 30 秒防抖（避免频繁重载）
  - 重载后更新内存快照
  - 忽略 `node_modules`、`.git`
- [x] 7.2 Gateway 启动时初始化 SkillsWatcher
  - 首次加载所有 Skills
  - 注册变化回调
  - 优雅关闭时停止监听

## 8. PRC 内置 Skills

- [x] 8.1 编写核心 Skills（`skills/` 目录）
  - `git/SKILL.md` — Git 版本控制
  - `python/SKILL.md` — Python 开发（pip 清华源）
  - `nodejs/SKILL.md` — Node.js 开发（npmmirror）
  - `coding/SKILL.md` — 通用编程指南
  - `markdown/SKILL.md` — Markdown 写作
- [x] 8.2 编写 PRC 专属 Skills
  - `wechat-push/SKILL.md` — 企业微信推送
  - `dingtalk/SKILL.md` — 钉钉群消息
  - `aliyun-oss/SKILL.md` — 阿里云 OSS 文件操作
- [x] 8.3 所有安装命令验证
  - 确保无 `brew` 命令
  - 确保无境外 npm registry
  - pip / npm / go / conda 全部走国内镜像

## 9. 前端集成（desktop 包）

- [x] 9.1 升级 `useGateway.ts`：处理新 SSE 事件（tool_start + tool_result）
  - 解析 `tool_start` / `tool_update` / `tool_result` 三阶段事件
  - 维护工具调用状态（pending / in_progress / completed / failed）
  - `tool_update` 支持 partial result 实时展示
- [x] 9.2 升级 `Chat.tsx`：渲染工具调用中间态
  - 工具调用显示：图标 + 工具名 + 参数摘要
  - 工具结果：短结果直接显示，长结果可折叠
  - 最终回复正常渲染（Markdown）
- [ ] 9.3 Settings 新增 Tools/Skills 配置项（延至 Phase 3 Settings 面板重构时一并完成）
  - Tools 开关
  - bash 超时配置
  - Skills 额外目录配置

## 10. 配置与初始化

- [x] 10.1 扩展 `config/secrets.ts`（HTTPS_PROXY 已支持，TOOLS_*/SKILLS_* 延至 9.3）：新增 TOOLS_* / SKILLS_* 配置项
- [x] 10.2 升级 `index.ts`（Gateway 入口）
  - 创建 ToolRegistry 实例
  - 注册 5 个内置工具
  - 初始化 SkillsWatcher
  - 在 `/chat/stream` 处理函数中传入 tools + skills
- [x] 10.3 新增 `/tools` API 端点（含 /skills 和 /skills/reload）
  - `GET /tools` — 列出所有已注册工具
  - `GET /skills` — 列出已加载的 Skills 概要

## 11. 验收

- [x] 11.1 工具调用基础：输入"读取 package.json"，Agent 调用 `read_file` 并返回内容 ✅ 已验证
- [x] 11.2 工具链调用：输入"列出所有 .ts 文件并读取最大的那个"，Agent 先 `glob` 后 `read_file` ✅ 已验证
- [x] 11.3 bash 执行：输入"执行 node --version"，Agent 调用 `bash` 并返回版本号 ✅ 已验证
- [x] 11.4 文件创建：输入"创建 hello.py"，Agent 调用 `write_file` ✅ 已验证（用户实测生成 web 应用）
- [x] 11.5 网页抓取：输入"获取 https://httpbin.org/ip"，Agent 调用 `web_fetch` ✅ 已验证
- [x] 11.6 代理抓取：配置代理后，`web_fetch` 通过 undici ProxyAgent 代理发出请求 ✅ 已修复并验证
- [x] 11.7 全局断路器：临时将上限改为 3 次验证，3 次工具调用后成功触发断路器并总结回答 ✅
- [x] 11.8 Skills 注入：系统日志确认启动加载 9 个 Skills ✅ 已验证
- [x] 11.9 PRC Skills：内置 Skills 安装命令全部走国内镜像 ✅ 已检查
- [x] 11.10 Skills 热更新：修改 git/SKILL.md description 后，新对话中确认 Skills 列表已更新 ✅
- [x] 11.11 前端渲染：Chat 中可见工具调用中间态（图标 + 名称 + 结果摘要）✅ 用户截图确认
- [x] 11.12 成本统计：多轮工具调用的 token 总量正确累加 ✅ 已验证

