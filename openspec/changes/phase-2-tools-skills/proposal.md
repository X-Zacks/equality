# Proposal: Phase 2 — Tools + Skills

## 意图

为 equality Agent Core 添加**工具调用**（Tools）和**领域知识注入**（Skills）能力。  
Phase 2 完成后，Agent 不再只是"对话"——它能读写文件、执行命令、浏览网页，并携带丰富的领域知识回答专业问题。

## 背景

Phase 1 实现了 LLM 调用 + 流式对话 + Session 管理 + Cost Ledger。  
但 Agent Runner 目前是"单次 LLM 调用 → 流式返回"，没有：
- 工具调用循环（LLM 说"调用 bash"→ 系统执行 → 结果回传 → LLM 继续）
- 工具结果截断与上下文保护
- Skills 领域知识注入 System Prompt

Phase 2 将补齐这两大模块，使 equality 具备 AI Coding Agent 的核心能力。

## 做什么

### A. Tools 模块

1. **工具注册表**（Tool Registry）
   - 接口定义：`ToolDefinition`（name, description, inputSchema, execute）
   - 支持动态注册与注销

2. **5 个内置工具**
   - `bash`：在受限环境执行 shell 命令（Windows cmd / PowerShell）
   - `read_file`：读取文件内容（支持行范围，自动截断）
   - `write_file`：写入 / 创建文件（自动创建目录）
   - `glob`：文件路径模式匹配搜索
   - `web_fetch`：HTTP GET 抓取网页内容（经代理、支持国内网站）

3. **Agent Runner 升级为 Tool Loop**
   - LLM 返回 `tool_calls` → 执行 → 结果注入 → 再次调用 LLM → 循环直到 LLM 输出纯文本
   - 最大循环次数 = 30（全局断路器）

4. **工具名称容错匹配**
   - 精确 → 标准化（下划线/中划线）→ 命名空间剥离 → 大小写不敏感

5. **Tool Result 截断**
   - 单条上限 400,000 字符
   - head + tail 截断策略

6. **Tool Policy 框架**
   - Phase 2 简化版：全局白名单 / 黑名单
   - 预留扩展点：per-agent / per-provider / per-group（Phase 4+）

### B. Skills 模块

7. **SKILL.md 解析器**
   - YAML frontmatter + Markdown body
   - 字段：name, description, tools, user-invocable, equality.always, equality.requires

8. **6 级 Skills 加载**
   - 工作区 > 项目级 > 用户个人 > 用户管理 > 内置 > 额外目录
   - 每个来源最多 200 个 Skills

9. **System Prompt 注入（XML 索引 + 懒加载）**
   - 上限：150 个 Skills / 30,000 字符
   - **只注入 name + description + location 索引**（XML 格式），NOT 全文注入
   - 模型按需通过 `read_file` 懒加载 SKILL.md 全文
   - 150 个 skills 仅消耗 ~3,600 tokens（极其高效）
   - Phase 5 可引入语义路由 Top-K 进一步优化索引排序

10. **PRC 内置 Skills**
    - 所有安装命令走国内镜像源（清华 pip / npmmirror / goproxy.cn / conda 清华）
    - 新增 PRC 专属 Skills：企业微信推送、钉钉通知、阿里云 OSS、百度 OCR 等

11. **Skills 热更新**
    - 文件变化 → 30 秒防抖 → 自动重新加载
    - 当前运行的 Agent 使用启动时的快照

### C. 企业代理模型访问

12. **代理友好的 Tool 设计**
    - `web_fetch` 工具自动使用已配置的 HTTPS_PROXY
    - bash 执行的命令继承环境变量中的代理设置
    - 企业用户通过代理访问 GitHub Copilot / OpenAI 等国外模型时，工具同样能正常工作

## 不做什么

- ❌ Compaction 对话压缩（Phase 3）
- ❌ Tool Result Context Guard 上下文预算保护（Phase 3）
- ❌ 高级循环检测：ping_pong 乒乓检测、known_poll_no_progress 轮询检测（Phase 3）
- ❌ 子代理编排 sessions_spawn / sessions_send（Phase 4）
- ❌ 渠道适配器 飞书 / 钉钉（Phase 4）
- ❌ RAG 记忆系统（Phase 5）
- ❌ Skills 语义路由 Top-K（Phase 5）
- ❌ OpenClaw 7 层 Tool Policy Pipeline（过度设计，Phase 2 只做全局级别）

> **注**：Phase 2 已包含 `global_circuit_breaker`（30 次上限）和 `generic_repeat` 基础重复检测器。  
> 更高级的 `ping_pong` 和 `known_poll_no_progress` 检测器延后到 Phase 3。

## 与 OpenClaw 的差异化

| 维度 | OpenClaw | Equality Phase 2 |
|------|---------|------------------|
| Tool Policy | 7 层流水线（profile → provider → global → agent → group） | 全局白/黑名单，预留扩展点 |
| Skills 安装 | brew / npm / go / uv / download（境外源） | pip 清华 / npm 淘宝 / go goproxy.cn / conda 清华 |
| Skills 验证 | 正则白名单（brew formula、npm spec 等） | 正则白名单 + PRC 镜像 URL 验证 |
| bash 工具 | Linux / macOS 假设（`/bin/sh`） | Windows 优先（PowerShell / cmd），兼容 WSL |
| web_fetch | 直连 | 自动走 HTTPS_PROXY（企业代理场景） |
| 内置 Skills | 50+ 全球化 Skills | 10-15 个 PRC 本土化 Skills + 逐步补齐 |
| Skills 安装检测 | `which <bin>` | Windows: `where.exe` / `Get-Command`，WSL: `which` |

## 成功标准

- [ ] 用户在 Chat 中说"读取 README.md 的内容"，Agent 调用 `read_file` 返回文件内容
- [ ] 用户说"列出当前目录所有 .ts 文件"，Agent 调用 `glob` 返回文件列表
- [ ] 用户说"执行 `dir`"，Agent 调用 `bash` 并返回目录列表
- [ ] 用户说"创建一个 hello.py"，Agent 调用 `write_file` 创建文件
- [ ] 用户说"获取 https://httpbin.org/ip 的内容"，Agent 调用 `web_fetch` 抓取
- [ ] Agent 回复中包含 Python 相关问题时，System Prompt 已注入 Python Skill 的指引
- [ ] PRC 内置 Skills 中的安装命令全部走国内镜像（不出现 brew / 境外 npm registry）
- [ ] 企业代理用户的 `web_fetch` 请求经由代理发出
- [ ] 工具调用循环正常结束（LLM 输出纯文本时停止）
- [ ] 超过 30 次工具调用时，全局断路器终止运行
