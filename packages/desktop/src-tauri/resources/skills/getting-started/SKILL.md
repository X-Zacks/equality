---
name: getting-started
description: 'Equality 新手指南。Use when: 用户第一次使用、不知道如何开始、问"你能做什么"、问"怎么用"。NOT for: 已熟悉系统的高级用户查询特定功能。'
tools:
  - memory_save
  - memory_search
equality:
  auto-generated: true
  source-model: equality-system
  created: 2025-07-26
---

# Equality 新手指南

欢迎使用 Equality！这份指南帮你在 5 分钟内上手。

---

## 🚀 快速开始

### 第 1 步：配置模型
打开设置（⚙️ 按钮）→ 模型配置 → 选择一个 Provider：

| Provider | 费用 | 推荐模型 | 说明 |
|---|---|---|---|
| GitHub Copilot | 免费* | GPT-4o / Claude Sonnet | 需要 VS Code 登录的 Copilot 令牌 |
| DeepSeek | 低 | deepseek-chat | 国产，性价比极高 |
| Qwen (通义千问) | 低 | qwen-max | 阿里云，中文能力突出 |
| 自定义 | 按需 | 任意 | 任何 OpenAI 兼容接口 |

*GitHub Copilot 免费额度每月有限

### 第 2 步：开始对话
直接在输入框输入你想做的事，比如：
- "帮我分析当前目录的项目结构"
- "搜索 Rust 2024 有哪些新特性"
- "帮我写一个 Python 脚本统计日志中的错误次数"

### 第 3 步：探索更多
- 输入 `@` 选择内置技能（如 @git、@python）
- 拖放文件到对话框分析图片/PDF
- 说"记住我的偏好是…"建立长期记忆

---

## 🎯 六大核心能力

### 1. 🗣️ 智能对话
直接用自然语言描述需求，Equality 会自动选择合适的工具执行。

**示例提问：**
- "解释这段代码的作用"（粘贴代码后提问）
- "帮我想一个好的函数命名"
- "这个错误是什么意思？怎么修？"

### 2. 🔧 28 个内置工具
Equality 拥有 28 个内置工具，自动按需调用：

| 类别 | 工具 | 说明 |
|---|---|---|
| 文件 | read_file, write_file, edit_file, glob, grep | 读写搜索文件 |
| 终端 | bash | 执行命令行命令 |
| 网络 | web_fetch, web_search, browser | 抓网页、搜索、浏览器自动化 |
| 媒体 | read_image, read_pdf | 分析图片和 PDF |
| 记忆 | memory_save, memory_search | 跨会话长期记忆 |
| 进程 | process_tool, process_kill | 进程管理 |
| 定时 | cron | 定时任务 |
| 代码 | 4 个 LSP 工具 | 代码智能分析 |
| 协作 | 4 个子 Agent 工具 | 多 Agent 并行协作 |

你不需要记住这些——直接说你想做什么，Equality 会自动选择。

### 3. 🧩 Skills 技能系统
Skills 是可复用的任务模板。Equality 内置 20+ Skills：

**常用 Skills：**
- `@git` — Git 操作（提交、分支、合并）
- `@python` — Python 开发辅助
- `@coding` — 通用编码工作流
- `@markdown` — Markdown 文档处理
- `@web-fetch` — 网页内容提取
- `@excel` — Excel 数据处理
- `@pdf` — PDF 文档分析

**使用方式：** 在输入框输入 `@` 弹出选择器，或直接说"用 git 技能帮我…"

### 4. 💾 长期记忆
告诉 Equality 需要记住的信息，下次对话还会记得：

**示例：**
- "记住我的名字是张三"
- "记住我们团队用 pnpm 而不是 npm"
- "记住这个项目的部署流程是…"

记忆支持模糊搜索，说"我之前告诉你的关于部署的事"就能回忆。

### 5. 📎 文件处理
将文件拖放到对话框（或点击 📎）：

- **图片** — 识别内容、提取文字、描述图片
- **PDF** — 提取文本、总结要点
- **代码文件** — 分析、重构、找问题
- 一次最多 5 个文件

### 6. 🤖 自动化与编排
对于复杂任务，Equality 会自动拆分并编排：

- **多步骤执行** — 读取→分析→修改→验证，自动串联
- **子 Agent 协作** — 大任务拆给多个子 Agent 并行处理
- **Skill 沉淀** — 完成复杂任务后可保存为新 Skill，下次一键复用

---

## 💡 八个典型场景

### 场景 1：分析项目
> "帮我分析当前目录的项目结构，列出主要模块、技术栈和入口文件"

### 场景 2：生成文档
> "为当前项目写一份 README，包含安装说明、使用方法和架构说明"

### 场景 3：搜索信息
> "搜索 React 19 的新特性，给我一个简洁的总结"

### 场景 4：Git 管理
> "@git 帮我看下当前的改动，生成合适的 commit message 并提交"

### 场景 5：写脚本
> "@python 写一个脚本，遍历当前目录下所有 .log 文件，统计 ERROR 出现的次数"

### 场景 6：处理文件
> 拖放一张截图 → "识别这张图片中的文字并翻译成英文"

### 场景 7：记忆管理
> "记住：我们的 API 基础 URL 是 https://api.example.com/v2"
> 下次直接说 "用我们的 API 地址发个请求测试下"

### 场景 8：创建 Skill
> "帮我创建一个 Skill：每次发布前自动运行 lint + test + build"

---

## 🎓 高级技巧

### 多 Skill 组合
输入 `@` 可以连续选择多个 Skill：
> @git @coding "审查最近 3 个提交的代码质量，有问题的提 fix"

### 暂停与恢复
Equality 执行多步任务时，点击 ⏸ 可以暂停：
- 暂停后你可以输入新指令调整方向
- 或点取消放弃当前任务

### 子会话分工
点击会话面板可以看到父子会话树。复杂任务会自动创建子会话：
- Supervisor（规划者）拆解任务
- Coder / Reviewer / DevOps 等角色并行执行
- 结果汇总到主会话

### 工具标签 #
输入 `#` 可以指定只用某个工具：
> #bash "查看当前 Node.js 版本和全局安装的包"

### 自定义你的 AI
- 说"帮我改一下你的性格"可以调整 IDENTITY.md
- 说"记住我喜欢简洁的回答"会保存到长期记忆
- 在设置页可以切换模型、管理 Skills、查看记忆

---

*这份指南本身就是一个 Skill！你随时可以用 `@getting-started` 重新查看。*
