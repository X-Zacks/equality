# Equality Desktop — UI 验证操作手册

> **适用范围**：Phase A ～ V 全功能验证  
> **应用版本**：feat/phase-V-ui-integration  
> **测试环境**：Tauri v2 + React 桌面端 · Core 服务 `http://localhost:18790`  
> **文档更新**：2026-04

---

## 目录

1. [环境启动验证](#1-环境启动验证)
2. [基础界面布局](#2-基础界面布局)
3. [会话管理](#3-会话管理)
4. [对话与流式输出](#4-对话与流式输出)
5. [工具调用展示（Phase A–C）](#5-工具调用展示phase-ac)
6. [交互式块（Phase F1）](#6-交互式块phase-f1)
7. [@ Mention 选择器](#7--mention-选择器)
8. [附件上传](#8-附件上传)
9. [子 Agent 工具（Phase E3/E4）](#9-子-agent-工具phase-e3e4)
10. [内存工具（Phase G–H）](#10-内存工具phase-gh)
11. [LSP 工具（Phase L–M）](#11-lsp-工具phase-lm)
12. [代码库搜索工具（Phase N3）](#12-代码库搜索工具phase-n3)
13. [设置页面](#13-设置页面)
14. [主题与缩放](#14-主题与缩放)
15. [Phase N4 新组件](#15-phase-n4-新组件)
16. [Phase N6 诊断与快照](#16-phase-n6-诊断与快照)
17. [API 端点直接验证](#17-api-端点直接验证)
18. [已知限制与待集成项](#18-已知限制与待集成项)
19. [Phase O 自进化循环](#19-phase-o-自进化循环)
20. [Phase T Purpose 持久化与技能渐进披露](#20-phase-t-purpose-持久化与技能渐进披露)
21. [Phase U 请求配额追踪](#21-phase-u-请求配额追踪)
22. [Phase V UI 集成与增强](#22-phase-v-ui-集成与增强)

---

## 1. 环境启动验证

### 前置条件

- 已配置有效的模型 API Key（DeepSeek / Qwen / Copilot / Custom 任意一种）
- pnpm 已安装，Rust / Cargo 工具链可用

### 启动步骤

1. 在 VS Code 中运行任务 **`tauri-dev`**（或在终端执行 `pnpm --filter @equality/desktop tauri:dev`）
2. 等待 Vite 编译完成（控制台出现 `VITE v* ready`）
3. 等待 Tauri 窗口弹出

### 验证项

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 1.1 | 底部状态栏左侧 | 显示绿色圆点 `●` + **"Core 在线"** |
| 1.2 | 状态栏右侧 Provider 信息 | 显示已配置的 Provider 名称及模型，例如 `copilot (gpt-4o)` |
| 1.3 | Core 端口检测 | 浏览器访问 `http://localhost:18790/health` 返回 `{"ok":true}` |
| 1.4 | Bootstrap 阶段 | `http://localhost:18790/diagnostics/bootstrap` 返回 JSON，7 个 stage 均为 `done` |

> ⚠️ 若状态栏显示橙色 `●` **"Core 离线"**，请检查 `pnpm --filter @equality/core dev` 是否已启动。

---

## 2. 基础界面布局

### 界面区域说明

```
┌──┬────────────────────────────────────────────────┐
│💬│  [会话面板]  │  [聊天区域]                        │
│⚙️│  左侧列表   │  消息流 + 输入框                   │
│  │             │                                   │
│  ├─────────────┴───────────────────────────────────┤
│  │ ● Core 在线 | copilot (gpt-4o)       [100%]     │
└──┴──────────────────────────────────────────────────┘
```

### 验证项

| # | 操作 | 预期结果 |
|---|------|----------|
| 2.1 | 点击左侧导航 `💬` 按钮 | 切换到聊天页面（已在聊天页时切换会话面板开关） |
| 2.2 | 点击左侧导航 `⚙️` 按钮 | 切换到设置页面 |
| 2.3 | 按 `Ctrl+B` | 会话面板折叠 / 展开（toggle） |
| 2.4 | 会话面板折叠状态下 | 聊天区域占满全宽 |
| 2.5 | 查看底部状态栏 | 存在：状态指示灯 · Provider 信息 · 缩放百分比（非 100% 时显示） |
| 2.6 | 点击 `💬` 按钮（已在聊天页） | 会话面板 toggle |

---

## 3. 会话管理

### 3.1 新建对话

| # | 操作 | 预期结果 |
|---|------|----------|
| 3.1.1 | 点击会话面板顶部 **"+ 新对话"** 按钮 | 聊天区域清空，输入框获得焦点 |
| 3.1.2 | 按 `Ctrl+N` | 同上，快捷键新建 |
| 3.1.3 | 观察会话 Key 格式 | `agent:main:desktop:default:direct:<时间戳>-<随机数>` |
| 3.1.4 | 连续新建超过 10 个会话 | 最旧的会话从 `openedSessions` 列表中移除（MAX_OPENED_SESSIONS=10），但历史仍在磁盘 |

### 3.2 会话列表

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 3.2.1 | 完成一次对话后查看左侧列表 | 列表显示对话，标题取第一条 user 消息前 30 字符 |
| 3.2.2 | 查看时间显示 | 显示相对时间（"刚刚" / "X 分钟前" / "X 小时前" / "昨天" / "X 天前"） |
| 3.2.3 | 查看分组标题 | 按日期分组：**今天** / **昨天** / **最近 7 天** / **更早** |
| 3.2.4 | 点击其他会话项 | 聊天区切换到该会话，历史消息加载显示 |
| 3.2.5 | 当前活跃会话 | 列表项有蓝色高亮 / active 样式 |

### 3.3 删除会话

| # | 操作 | 预期结果 |
|---|------|----------|
| 3.3.1 | 悬停在会话项上，点击 `🗑` 按钮 | 对话框从列表消失 |
| 3.3.2 | 删除当前活跃会话 | 自动切换到列表第一项；无会话时新建对话 |
| 3.3.3 | 重启应用后检查 | 被删除的会话不再出现 |

---

## 4. 对话与流式输出

### 前置条件

- Core 在线，API Key 已配置

### 验证项

| # | 操作 | 预期结果 |
|---|------|----------|
| 4.1 | 在输入框输入文字，按 `Enter` 发送 | 消息出现在聊天区（用户气泡），AI 开始流式回复 |
| 4.2 | 流式回复过程中 | 文本逐字渐现；底部发送按钮变为 **⏹** 停止按钮 |
| 4.3 | 点击 **⏹** 停止按钮 | 输出中断，消息保留已生成部分 |
| 4.4 | 发送含 Markdown 的请求（"用**粗体**写一段话"） | AI 回复中粗体 / 代码块 / 列表正常渲染（由 `Markdown.tsx` 处理） |
| 4.5 | 按 `Shift+Enter` | 输入框内换行，不发送 |
| 4.6 | 流式结束后 | 停止按钮隐藏，发送按钮恢复；会话列表标题刷新 |
| 4.7 | 测试暂停功能 | 流式过程中出现 **⏸** 按钮；点击后等待当前工具调用完成时暂停，再点击 **▶** 恢复 |

---

## 5. 工具调用展示（Phase A–C）

### 触发方式

向 AI 发送文件操作或系统命令相关问题，例如：

> *"请列出当前目录下的文件"*  
> *"读取 README.md 的内容"*

### 工具卡片结构

每个工具调用在聊天区显示为折叠卡片：

```
▶ 🔧 read_file   src/README.md           [running / done / error]
   └─ 展开可查看参数与结果
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 5.1 | 工具调用开始 | 卡片出现，状态为 `running`（动画指示器） |
| 5.2 | 工具调用完成 | 状态变为 `done`（绿色） |
| 5.3 | 工具调用失败 | 状态变为 `error`（红色），展开可见错误信息 |
| 5.4 | 工具名摘要（bash） | 显示执行的命令字符串 |
| 5.5 | 工具名摘要（read_file） | 显示文件路径，有行范围时附带 `(start-end)` |
| 5.6 | 工具名摘要（write_file / edit_file） | 显示目标文件路径 |
| 5.7 | 工具名摘要（search_files / grep） | 显示搜索 pattern |
| 5.8 | 点击卡片展开 | 显示完整参数 JSON 和返回结果 |
| 5.9 | 多个工具调用 | 按时序排列，可分别展开 |

### 常用工具验证

发送以下测试 Prompt：

```
请帮我：
1. 列出 packages/desktop/src 目录的文件
2. 读取 packages/desktop/src/App.tsx 的前 10 行
3. 用 bash 执行 echo "hello equality"
```

预期：聊天区依次出现 `list_directory`、`read_file`、`bash` 三个工具卡片，均为 done 状态。

---

## 6. 交互式块（Phase F1）

> **说明**：InteractiveBlock 由 Agent 通过 SSE `interactive` 事件主动推送。  
> 可使用内置的 `interactive_prompt` 工具触发。

### 触发方式

```
请问你想要什么操作？（使用交互式按钮让我选择）
```

或通过调试在 Core 侧直接发送 interactive payload。

### 验证项

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 6.1 | 按钮元素（type: button） | 渲染为有颜色的按钮（primary=蓝/secondary=灰/success=绿/danger=红） |
| 6.2 | 下拉选择（type: select） | 渲染为 `<select>` + **确认** 按钮 |
| 6.3 | 文本元素（type: text） | 渲染为段落文字 |
| 6.4 | 点击按钮 | 触发 `onAction(actionId, 'clicked')`，Agent 收到响应继续处理 |
| 6.5 | 选择下拉选项 + 点击确认 | 触发 `onAction(actionId, selectedValue)` |
| 6.6 | AI 回复后交互块状态 | 按钮变为 `disabled`（不可再次点击） |

---

## 7. @ Mention 选择器

| # | 操作 | 预期结果 |
|---|------|----------|
| 7.1 | 在输入框输入 `@` | 弹出 Mention Picker，显示可用 Skill 列表 |
| 7.2 | 在输入框输入 `#` | 弹出 Mention Picker，显示可用 Tool 列表 |
| 7.3 | 输入关键字过滤 | 列表实时筛选（例如 `@sup` 过滤出 supervisor-workflow） |
| 7.4 | 按方向键 `↑` / `↓` | 列表高亮项移动 |
| 7.5 | 按 `Enter` 或点击选项 | 选中项插入输入框，Picker 关闭 |
| 7.6 | 按 `Esc` | Picker 关闭，输入框内容保留 |
| 7.7 | 选中 Skill 后发送 | 对话携带 skill 标签，Agent 加载对应 SKILL.md 技能文档 |

---

## 8. 附件上传

| # | 操作 | 预期结果 |
|---|------|----------|
| 8.1 | 点击输入框旁回形针图标（📎） | 系统文件选择对话框弹出 |
| 8.2 | 选择图片文件（png/jpg/webp 等） | 附件区域显示 `🖼️ filename.png` |
| 8.3 | 选择 PDF 文件 | 显示 `📑 filename.pdf` |
| 8.4 | 选择其他文件 | 显示 `📄 filename.ext` |
| 8.5 | 拖拽文件到聊天区域 | 拖拽时出现蓝色边框高亮；放开后文件加入附件列表 |
| 8.6 | 添加超过 5 个文件 | 超出限制后不再添加（MAX_ATTACHMENTS=5） |
| 8.7 | 点击附件 `×` 按钮 | 移除该附件 |
| 8.8 | 携带附件发送消息 | 消息中包含文件内容，Agent 可基于文件内容回答 |

---

## 9. 子 Agent 工具（Phase E3/E4）

> **说明**：需要 Agent 进入子 Agent 编排模式时才会出现这些工具调用。  
> 可通过 Supervisor Skill 触发（`@supervisor-workflow`）。

### 触发方式

```
@supervisor-workflow 请并行分析以下两个文件：App.tsx 和 Chat.tsx，分别总结其功能
```

### 工具验证

| # | 工具名 | 预期显示 |
|---|--------|----------|
| 9.1 | `subagent_spawn` | 卡片显示：子 Agent key、角色（developer/reviewer 等） |
| 9.2 | `subagent_list` | 返回当前活跃子 Agent 列表（key + state） |
| 9.3 | `subagent_steer` | 向指定子 Agent 发送新指令 |
| 9.4 | `subagent_kill` | 终止指定子 Agent |
| 9.5 | 子 Agent 会话 key 格式 | 包含 `::sub::` 分隔符，例如 `agent:main:...:direct:123::sub::developer:456` |
| 9.6 | 深度限制 | 子 Agent 内不可再次 spawn（depth=2 时拒绝，depth=3 最大） |

### N2 并行验证

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 9.7 | 并行 spawn 多个 Agent | 多个 `subagent_spawn` 工具卡片几乎同时出现 |
| 9.8 | 父 Agent kill 时 | 所有子 Agent 级联终止（cascade kill） |

---

## 10. 内存工具（Phase G–H）

### 触发方式

```
记住：我的名字是 张三，我偏好使用 TypeScript
```

```
你还记得我告诉你我的名字吗？
```

| # | 工具名 | 预期结果 |
|---|--------|----------|
| 10.1 | `memory_save` | 工具卡片显示，记忆被保存到向量存储 |
| 10.2 | `memory_search` | 工具卡片显示，返回相关记忆条目 |
| 10.3 | 跨会话记忆 | 新建对话后再次询问，仍能召回之前保存的记忆 |
| 10.4 | 混合搜索（Phase J–K） | memory_search 同时使用语义搜索 + 关键词搜索 |

---

## 11. LSP 工具（Phase L–M）

### 前置条件

- `settings > 工作区目录` 已配置为代码项目根目录
- 项目有 TypeScript 文件

### 触发方式

```
请查看 packages/desktop/src/App.tsx 中 handleNewChat 函数的类型定义
```

| # | 工具名 | 预期结果 |
|---|--------|----------|
| 11.1 | `lsp_hover` | 返回符号的类型信息 / 文档注释 |
| 11.2 | `lsp_definition` | 返回符号定义的文件路径和行号 |
| 11.3 | `lsp_references` | 返回符号的所有引用列表 |
| 11.4 | `lsp_diagnostics` | 返回文件的类型错误 / lint 警告列表 |

---

## 12. 代码库搜索工具（Phase N3）

### 前置条件

- 工作区目录已配置（Settings > 高级 > 工作区目录）
- 首次使用时 Core 会自动建立索引（FileScanner → ChunkIndexer）

### 触发方式

```
在整个代码库中搜索所有使用了 sessionKey 的地方
```

```
搜索实现了 handleNewChat 功能的代码
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 12.1 | 工具卡片 | 出现 `codebase_search` 工具调用卡片 |
| 12.2 | 参数摘要 | 显示搜索 query 字符串 |
| 12.3 | 返回结果 | 包含文件路径、行号、代码片段 |
| 12.4 | 语义搜索 | 可查找语义相关但字面不完全匹配的代码 |
| 12.5 | 索引构建状态 | `http://localhost:18790/diagnostics/indexer` 返回文件数量统计 |

---

## 13. 设置页面

### 进入方式

左侧导航点击 `⚙️` 按钮

### 13.1 模型配置标签页（model）

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 13.1.1 | 模型路由选择器 | 显示当前模型（自动/手动模式切换） |
| 13.1.2 | 点击模型选择器 | 下拉列表显示所有可用模型（从 `/models` API 获取） |
| 13.1.3 | 模型分类标识 | 🔥 powerful / ❤️ versatile / ⚡ fast；或倍率（0.5x / 1x / 3x） |
| 13.1.4 | Provider API Key 配置 | DeepSeek / Qwen / Volc / Custom / Copilot 各有独立输入框 |
| 13.1.5 | 保存 API Key | 点击保存后显示成功提示；再次打开显示已配置（masked） |
| 13.1.6 | 空 Key 时清除 | 输入空字符串保存可清除已配置的 Key |

### 13.2 工具配置标签页（tools）

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 13.2.1 | 工具配置文件选择 | minimal / coding / full 三档 |
| 13.2.2 | Bash 超时设置 | 可调整默认超时时间（秒） |
| 13.2.3 | 工作区目录 | 可设置代码索引根目录（用于 N3 codebase_search） |

### 13.3 技能标签页（skills）

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 13.3.1 | Skill 列表 | 显示已加载的技能：supervisor-workflow / testing-workflow / review-workflow |
| 13.3.2 | 技能展开箭头 | 每个 skill 左侧显示 ▶/▼ 箭头，点击切换展开/折叠 |
| 13.3.3 | 技能详情 | 展开后显示 SKILL.md 正文（前 2000 字符，pre 块渲染） |
| 13.3.4 | 重新加载 | 点击「🔄 重新加载」按钮后列表刷新 |

### 13.4 高级标签页（advanced）

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 13.4.1 | 主题切换 | system / 💜紫色 / 深色 三选一 |
| 13.4.2 | 重置设置 | 提供重置为默认值的功能 |

### 13.5 关于标签页（about）

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 13.5.1 | 版本信息 | 显示应用版本号 |
| 13.5.2 | 链接 | GitHub / 文档链接可点击跳转 |

---

## 14. 主题与缩放

### 14.1 主题切换

| # | 操作 | 预期结果 |
|---|------|----------|
| 14.1.1 | 设置中切换为 **紫色** | 整个应用切换为紫色背景主题（深紫 #1a0a2e） |
| 14.1.2 | 切换为 **深色** | 整个应用切换为深色背景主题 |
| 14.1.3 | 切换为 **跟随系统** | 跟随 OS 深浅色设置自动切换（系统深色→深色，系统浅色→紫色） |
| 14.1.4 | 主题持久化 | 重启应用后主题偏好保持（localStorage `equality-theme`） |
| 14.1.5 | 旧值迁移 | 已保存的 `light` 值自动迁移为 `purple` |

### 14.2 界面缩放

| # | 操作 | 预期结果 |
|---|------|----------|
| 14.2.1 | `Ctrl++` / `Ctrl+=` | 界面放大 10%（最大 200%） |
| 14.2.2 | `Ctrl+-` | 界面缩小 10%（最小 50%） |
| 14.2.3 | `Ctrl+0` | 重置为 100% |
| 14.2.4 | `Ctrl + 鼠标滚轮` | 平滑缩放 |
| 14.2.5 | 缩放不等于 100% 时 | 底部状态栏右侧显示当前百分比（如 `120%`） |
| 14.2.6 | 缩放持久化 | 重启应用后缩放比例保持（localStorage `equality-zoom`） |

---

## 15. Phase N4 新组件

> **说明**：以下组件已创建（`packages/desktop/src/`），但尚未集成到 `SessionPanel.tsx` 的主会话列表中。  
> 验证需通过开发者工具或测试页面进行。  
> 详见 [§18 已知限制](#18-已知限制与待集成项)。

### 15.1 SessionTreeView — 树形会话列表

**文件**：`packages/desktop/src/SessionTreeView.tsx`

| # | 组件特性 | 预期行为 |
|---|---------|----------|
| 15.1.1 | 父子会话层级展示 | 子 Agent 会话缩进显示在父会话下方（每级缩进 20px） |
| 15.1.2 | 折叠/展开按钮 | `▼` / `▶` 切换；点击箭头不触发会话选中 |
| 15.1.3 | 进度摘要 | 父节点右侧显示 `已完成/总数`（例如 `2/4`） |
| 15.1.4 | 活跃会话高亮 | 当前选中会话有 `var(--item-active-bg)` 背景色 |
| 15.1.5 | 删除按钮 | 子会话项右侧显示 🗑 按钮 |

### 15.2 RoleIcon — 角色图标

**文件**：`packages/desktop/src/RoleIcon.tsx`

| AgentRole | 图标 |
|-----------|------|
| supervisor | 📋 |
| architect | 📐 |
| developer | 💻 |
| tester | 🧪 |
| reviewer | 📝 |
| (default) | 💬 |

验证：在测试页面渲染 `<RoleIcon role="developer" size={16} />`，应显示 `💻`。

### 15.3 StatusBadge — 状态徽章

**文件**：`packages/desktop/src/StatusBadge.tsx`

| 状态 | 徽章 |
|------|------|
| running | 🔄（旋转动画） |
| completed / succeeded | ✅ |
| failed / error | ❌ |
| pending | ⏳ |
| cancelled | 🚫 |
| skipped | ⏭️ |

### 15.4 TaskProgressBar — 任务进度条

**文件**：`packages/desktop/src/TaskProgressBar.tsx`

| # | 特性 | 预期 |
|---|------|------|
| 15.4.1 | 进度百分比 | 条形图宽度随 completed/total 变化 |
| 15.4.2 | 当前运行节点名 | 显示正在执行的 DAG 节点 label |
| 15.4.3 | 预估剩余时间 ETA | 显示 `~Xs 剩余` |

### 15.5 DiffPreview — 差异预览

**文件**：`packages/desktop/src/DiffPreview.tsx`

| # | 特性 | 预期 |
|---|------|------|
| 15.5.1 | 新文件（originalContent=null） | 全行显示绿色新增行（`+` 前缀） |
| 15.5.2 | 修改文件 | 红色删除行（`-`）和绿色新增行（`+`）交替显示 |
| 15.5.3 | 上下文行 | 未改变的行以灰色显示（context） |
| 15.5.4 | 文件路径标题 | 顶部显示 `filePath` |
| 15.5.5 | Accept 按钮 | 点击触发 `onAccept()` 回调 |
| 15.5.6 | Reject 按钮 | 点击触发 `onReject()` 回调 |

---

## 16. Phase N6 诊断与快照

### 16.1 Bootstrap 图状态

```bash
curl http://localhost:18790/diagnostics/bootstrap
```

**预期响应结构**：

```json
{
  "stages": [
    { "id": "env-check",        "state": "done", "durationMs": 12 },
    { "id": "config-load",      "state": "done", "durationMs": 34 },
    { "id": "provider-init",    "state": "done", "durationMs": 156 },
    { "id": "tool-registry",    "state": "done", "durationMs": 8 },
    { "id": "skill-loader",     "state": "done", "durationMs": 23 },
    { "id": "memory-init",      "state": "done", "durationMs": 67 },
    { "id": "indexer-warmup",   "state": "done", "durationMs": 89 }
  ],
  "totalMs": 389,
  "degraded": false
}
```

| # | 检查点 | 预期 |
|---|--------|------|
| 16.1.1 | 所有 stage state | 均为 `"done"` |
| 16.1.2 | degraded 字段 | `false`（若某 stage 失败则为 `true`，应用仍可运行） |
| 16.1.3 | totalMs | 通常 < 5000ms |

### 16.2 Transcript 压缩

| # | 场景 | 预期结果 |
|---|------|----------|
| 16.2.1 | 长对话（>100 条消息） | Core 自动触发 `compactTranscript()`，截断历史保留摘要 |
| 16.2.2 | 压缩后继续对话 | AI 仍能基于摘要回答之前的内容 |
| 16.2.3 | API 检查 | `http://localhost:18790/sessions/:key` 中的 `compacted` 字段为 `true` |

### 16.3 Session Snapshot

```bash
# 捕获快照
curl -X POST http://localhost:18790/sessions/:key/snapshot

# 获取快照列表
curl http://localhost:18790/sessions/:key/snapshots
```

| # | 检查点 | 预期 |
|---|--------|------|
| 16.3.1 | 捕获快照 | 返回 `{ snapshotId: "snap_..." }` |
| 16.3.2 | 快照内容 | 包含 messages / toolCalls / metadata |
| 16.3.3 | 恢复快照 | `POST /sessions/:key/snapshots/:snapshotId/restore` 成功恢复 |

---

## 17. API 端点直接验证

> 用于后端功能的直接验证，不依赖 UI。  
> 将 `:key` 替换为实际的 session key（从会话列表或 localStorage `equality-session-key` 获取）。

### 基础端点

| 端点 | 方法 | 预期响应 |
|------|------|----------|
| `/health` | GET | `{ "ok": true }` |
| `/sessions` | GET | Session 列表数组 |
| `/sessions/:key` | GET | Session 详情（messages / state） |
| `/sessions/:key` | DELETE | `{ "ok": true }` |
| `/models` | GET | 可用模型列表 |
| `/settings` | GET | 当前设置（API keys masked） |

### 任务编排端点（Phase N1）

| 端点 | 方法 | 预期响应 |
|------|------|----------|
| `/tasks` | GET | 所有任务列表 |
| `/tasks/tree` | GET | 树形任务结构（含父子关系） |
| `/tasks/:id` | GET | 单个任务详情（含 DAG 节点状态） |

### 配额端点（Phase U）

| 端点 | 方法 | 预期响应 |
|------|------|----------|
| `/quota` | GET | 所有 provider 配额配置 + 当前状态（used/limit/level） |
| `/quota` | PUT | 设置配额配置（body: QuotaConfig JSON） |

### 诊断端点（Phase N6）

| 端点 | 方法 | 预期响应 |
|------|------|----------|
| `/diagnostics/bootstrap` | GET | Bootstrap 阶段状态 |
| `/diagnostics/indexer` | GET | 代码索引统计信息 |

### 执行注册表端点（Phase N5）

| 端点 | 方法 | 预期响应 |
|------|------|----------|
| `/execution-registry` | GET | 所有已注册 workflow 图 |
| `/execution-registry/:kind` | GET | 特定类型的 workflow 详情（Markdown 格式） |

---

## 18. 已知限制与待集成项

### ~~18.0 Phase U 前端配额 UI~~ ✅ 已完成（Phase V）

**状态**：Phase V 已实现：
- ✅ 设置页模型 Tab 底部显示配额进度条（`GET /quota` 数据驱动）
- ✅ Chat 对话 `done` 事件解析 `quotaWarning`，渲染黄/红色提示条（可关闭）
- ⚠️ 配额配置仍需通过 `PUT /quota` API 设置（前端输入框待后续优化）

### ~~18.1 SessionTreeView 未集成到 SessionPanel~~ ✅ 已实现

**状态**：`SessionPanel.tsx` 已自带树形实现（`buildTree()` + `ParentItem` / `ChildItem`），
子 Agent 会话以 `::sub::` 分隔，父节点可折叠展开子会话。`SessionTreeView.tsx` 为独立实现，
可作为未来替换方案。

### ~~18.2 DiffPreview 未集成~~ ✅ 已完成（Phase V）

**状态**：Phase V 已在 `Chat.tsx` 的 write_file / edit_file / replace_in_file 工具卡片展开体中
集成 `DiffPreview.tsx` 组件，`tc.status === 'done'` 时渲染新文件内容预览。
Accept/Reject 按钮暂为无操作（文件已写入）。

### 18.3 TaskProgressBar 尚未与 PlanDAG 状态绑定

**状态**：组件已创建，但 PlanDAG 执行进度尚未通过 SSE 推送到前端。

**计划**：通过 SSE `plan_progress` 事件将进度数据绑定到 TaskProgressBar（Phase V5 待实施）。

### 18.4 RoleIcon / StatusBadge 仅在 SessionTreeView 内使用

目前这两个组件仅被 `SessionTreeView.tsx` 引用。`SessionPanel.tsx` 使用自己的简化图标（箭头 ▸/▾）。
未来可迁移到统一使用 RoleIcon/StatusBadge。

---

## 19. Phase O 自进化循环

> **对应分支**：`feat/phase-O-self-evolution`  
> **核心思路**：对话 → 学习 → 记忆 → 技能化 → 历史搜索 → 更好的对话

### 19.1 O1 — 冻结记忆快照

**原理**：首轮 assemble 时执行一次 `memorySearch`，结果冻结在 `session.frozenMemorySnapshot`；后续轮直接复用，不再重复检索。

#### 验证方式

1. 先执行 §10 保存至少一条记忆，例如：
   ```
   记住：我的偏好语言是 TypeScript
   ```
2. 新建会话后立即提问：
   ```
   你好，直接开始对话
   ```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.1.1 | Core 日志 | 出现 `[context-engine] 冻结记忆快照: N 条` |
| 19.1.2 | 第 2 条消息发送后 | 日志出现 `[context-engine] 复用冻结快照`，**不**出现第二次 `冻结记忆快照` |
| 19.1.3 | 中途调用 memory_save | 日志出现写入成功，但快照**不变**（当前会话不刷新） |
| 19.1.4 | Recall 容量上限 | 记忆条数超多时，快照不超过 4000 字符（可在 Core 日志中观察截断提示） |
| 19.1.5 | 重启应用加载旧会话 | 旧会话的 `frozenMemorySnapshot` 从磁盘恢复，无需重新 recall |

#### 磁盘验证

```powershell
# 查看 session JSON，确认字段存在
Get-Content "$env:APPDATA\Equality\sessions\*.json" | ConvertFrom-Json | Select-Object key, frozenMemorySnapshot
```

---

### 19.2 O1 — 预算感知警告

**原理**：toolLoop 在迭代次数或工具调用次数达到 70% / 90% 时，向最近一条 tool result 末尾追加警告文本。

#### 验证方式

发送需要大量工具调用的任务，或临时将环境变量调低：

```powershell
# 将最大轮数设为 10，便于观察
$env:AGENT_MAX_LLM_TURNS = '10'
```

然后发送：
```
请依次读取 src/ 目录下所有 .tsx 文件并逐个总结
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.2.1 | 到达 70% 轮数 | Core 日志出现 `[runner] 💰 Budget warning injected`，AI 回复中可能提及「即将达到上限」 |
| 19.2.2 | 70% 警告仅触发一次 | 后续轮不重复追加同一 70% 警告 |
| 19.2.3 | 到达 90% 轮数 | 日志再次出现 budget warning，警告等级升为 CRITICAL |
| 19.2.4 | tool calls 独立计数 | 设置 `AGENT_MAX_TOOL_CALLS=10`，工具调用达到 7 次时触发独立的调用预算警告 |

---

### 19.3 O2 — 上下文智能压缩

**原理**：当 token 占比 ≥ 50% **或**消息数 ≥ 30 时，自动执行 6 步结构化压缩（标记 → 提取 → 摘要 → 合成 → 替换 → 验证）。

#### 验证方式

方法 A（调低阈值）：
```powershell
$env:CONTEXT_COMPRESS_THRESHOLD_MESSAGES = '8'
```
然后在同一会话中发送 9 条以上消息。

方法 B（真实场景）：进行长达 30+ 条消息的工作对话，无需修改配置。

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.3.1 | 触发压缩 | Core 日志出现 `[compressor] Step 1: old=N msgs, recent=M msgs` |
| 19.3.2 | 摘要生成 | 日志出现 `[compressor] Step 3: summary generated (N chars)` |
| 19.3.3 | 消息数减少 | `[compressor] Step 5: X → Y msgs`（Y 明显小于 X） |
| 19.3.4 | token 验证 | `[compressor] Step 6: tokens A → B (saved C)` |
| 19.3.5 | 压缩后继续对话 | AI 仍能引用压缩前的关键信息（因摘要中保留了关键决策） |
| 19.3.6 | 幂等性 | 同一轮内不重复压缩（日志只出现一次 Step 1） |
| 19.3.7 | 环境变量生效 | 修改 `CONTEXT_COMPRESS_THRESHOLD_PERCENT=0.70` 后，70% 前不触发 |

#### 摘要结构验证

压缩后的摘要 system message 应包含以下段落（可通过 `/sessions/:key` API 查看消息列表）：

```
## 用户目标
## 关键决策
## 工具调用摘要
## 未完成事项
## 重要上下文
```

---

### 19.4 O3 — 技能增强（4 段指引）

**原理**：system prompt 中新增匹配、引用、沉淀、Patch 四段技能指引，Agent 在完成复杂任务后主动建议创建技能。

#### 19.4.1 技能引用验证

前提：已有名为 `git-commit-convention` 或任意 Skill 的 SKILL.md 文件。

| # | 操作 | 预期结果 |
|---|------|----------|
| 19.4.1 | 发送与某 Skill 匹配的请求 | AI 回复开头出现「正在使用 Skill: <name>」 |
| 19.4.2 | 无匹配 Skill 时 | 直接完成任务，不读取 SKILL.md |

#### 19.4.2 技能沉淀建议验证

发送需要多个工具调用的任务（至少 5 次工具调用）：

```
请帮我：读取 package.json → 检查依赖版本 → 运行 pnpm outdated → 生成升级报告
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.4.3 | 工具调用 ≥ 5 次后 | AI 最终回复中出现 `💡 这个操作涉及多个步骤，要不要我把它沉淀为技能？` |
| 19.4.4 | 用户回复「是」| Agent 调用 write_file 在 skills/ 目录创建 SKILL.md |
| 19.4.5 | 简单查询（< 2 工具） | 不建议创建技能 |

#### 19.4.3 技能 Patch 验证

```
我们的部署流程改了，现在多了一步审批，请更新 deploy-to-prod 技能
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.4.6 | Agent 行为 | 读取现有 SKILL.md → 修改步骤 → write_file 覆盖（而非创建新 Skill） |
| 19.4.7 | 完成提示 | 「已更新 Skill 'deploy-to-prod' 的相关步骤。」 |

---

### 19.5 O4 — 历史会话搜索

**原理**：每轮对话结束后自动将 user/assistant 消息增量写入 `session-search.db`（SQLite FTS5），Agent 可通过 `session_search` 工具全文检索历史会话。

#### 验证方式

**Step 1**：在会话 A 中进行一次有特色的对话：
```
我们讨论了使用 Redis Streams 实现消息队列的方案，最终决定用 XADD/XREADGROUP
```

**Step 2**：新建会话 B，询问：
```
上次我们讨论过一个消息队列的方案，你还记得细节吗？
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.5.1 | Agent 触发搜索 | 工具调用卡片出现 `session_search`，query 为「消息队列」 |
| 19.5.2 | 返回结果 | 显示历史会话片段，含 `**Redis**`/`**XADD**` 等高亮词 |
| 19.5.3 | 无匹配时 | 工具返回 `No matching sessions found.` |
| 19.5.4 | limit 参数 | 默认返回 ≤ 10 条结果 |
| 19.5.5 | 索引不阻塞 | Core 日志中索引写入与下一轮 LLM 调用异步进行（无明显延迟） |

#### 数据库验证

```powershell
# 确认数据库已创建
Test-Path "$env:APPDATA\Equality\session-search.db"

# 查看索引条数（需安装 sqlite3.exe 或通过 Core API）
curl http://localhost:18790/diagnostics/bootstrap  # 目前可观察内存日志
```

#### session_search 工具参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string（必填） | 搜索关键词 |
| `limit` | number（可选） | 最大返回数，默认 10，上限 50 |

---

### 19.6 Phase O 联合验证场景

以下场景同时覆盖 O1–O4 的联动：

```
场景：长工作流 + 记忆 + 历史搜索

1. 会话 A：执行 10+ 步骤的复杂任务（触发 O2 压缩 + O1 预算警告 + O3 技能建议）
2. 接受技能建议，将任务保存为 Skill（O3 沉淀）
3. 新建会话 B：问「上次那个复杂任务的流程是什么」（触发 O4 session_search）
4. 会话 B 首条消息触发记忆召回（O1 冻结快照），无需重复 recall
```

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 19.6.1 | 会话 A 长对话 | 压缩日志 + 预算警告日志均出现 |
| 19.6.2 | 技能沉淀 | skills/ 目录出现新 SKILL.md |
| 19.6.3 | 会话 B 首轮 | 日志出现「冻结记忆快照」一次 |
| 19.6.4 | 会话 B 查询历史 | session_search 工具被调用，返回会话 A 的相关片段 |

---

## 20. Phase T Purpose 持久化与技能渐进披露

> **核心思路**：会话 purpose 跨重启保持 → Skill 仅索引披露 + skill_view 按需读取 → 子代理深度严格受限

### 20.1 T1 — Purpose 持久化

**原理**：Agent 首轮推断用户 purpose（goal + constraints + source），写入 session JSON；重启或切换回该会话时自动恢复。

#### 验证方式

1. 发送明确目标的消息：
   ```
   请帮我重构 auth 模块，要求简洁回复
   ```
2. 等待 AI 完成首轮回复（purpose 在 context-engine assemble 阶段推断）
3. 关闭应用并重新启动，切换回该会话

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 20.1.1 | Core 日志 | 首轮出现 `[context-engine] purpose inferred` |
| 20.1.2 | 重启后切换到旧会话 | AI 仍然知道目标是「重构 auth 模块」 |
| 20.1.3 | Session JSON | `%APPDATA%\Equality\sessions\*.json` 包含 `purpose` 字段（goal / constraints / source） |
| 20.1.4 | 新会话无 purpose | 新建会话在用户发送首条消息前 `purpose` 字段为空 |

### 20.2 T2 — Skills 渐进式披露 + skill_view 工具

**原理**：System prompt 中仅列出 Skill 元数据索引（名称 + 简短描述），Agent 需要详情时调用 `skill_view` 工具读取 SKILL.md 全文。

#### 验证方式

```
请列出你有哪些技能
```

然后使用 `@supervisor-workflow` 之类的指令，观察 Agent 是否调用 skill_view。

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 20.2.1 | System prompt 中 skill 部分 | 仅含 `<available_skills>` 元数据索引，不含 SKILL.md 全文 |
| 20.2.2 | Agent 需要技能详情时 | 工具卡片出现 `skill_view`，参数为 skill 名称 |
| 20.2.3 | skill_view 返回结果 | 展开可见 SKILL.md 完整内容 |
| 20.2.4 | 不存在的 skill 名 | 返回错误提示 `Skill 'xxx' not found` |

### 20.3 T3 — 子代理深度限制

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 20.3.1 | 子 Agent 内再次 spawn | depth ≥ maxDepth 时拒绝，返回错误 |
| 20.3.2 | 深度 = 3 时 | 已达上限，无法继续嵌套 |

---

## 21. Phase U 请求配额追踪

> **核心思路**：按 provider + model_tier 追踪月度 LLM 调用量，Copilot 按模型倍率加权计费，配额预警 + 自动降级。

### 21.1 配额 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/quota` | GET | 返回所有 provider 的配额配置 + 当前状态 |
| `/quota` | PUT | 设置/更新配额配置 |

#### 设置配额

```bash
curl -X PUT http://localhost:18790/quota \
  -H 'Content-Type: application/json' \
  -d '{"provider":"copilot","tier":"premium","monthlyLimit":300,"warnPct":0.8,"criticalPct":0.95,"autoDowngrade":true}'
```

#### 查看配额状态

```bash
curl http://localhost:18790/quota
```

**预期响应结构**：

```json
{
  "configs": [
    { "provider": "copilot", "tier": "premium", "monthlyLimit": 300, "warnPct": 0.8, "criticalPct": 0.95, "autoDowngrade": true }
  ],
  "statuses": [
    { "provider": "copilot", "tier": "premium", "used": 45, "limit": 300, "remaining": 255, "pct": 0.15, "level": "ok" }
  ]
}
```

### 21.2 Copilot 高级请求倍率

**原理**：Copilot 不同模型消耗不同数量的高级请求，按倍率表加权计算月度用量。

| 模型 | 倍率 | 含义 |
|------|------|------|
| GPT-4.1 / GPT-4o | 0x | 免费（已含订阅） |
| Claude Haiku 4.5 / Gemini 3 Flash / GPT-5.4 mini | 0.33x | 每次消耗 0.33 个配额 |
| Claude Sonnet 4/4.5/4.6 / GPT-5.2/5.4 / Gemini Pro | 1x | 每次消耗 1 个配额 |
| Claude Opus 4.5 / 4.6 | 3x | 每次消耗 3 个配额 |
| Claude Opus 4.7 | 7.5x | 每次消耗 7.5 个配额 |
| Claude Opus 4.6 (fast mode) | 30x | 每次消耗 30 个配额 |

> ⚠️ Copilot 目前**无公开个人配额查询 API**。VS Code 中的百分比显示通过插件私有通道获取。
> 本地方案：通过 `cost_entries` 中记录的每次调用 + 模型倍率表加权求和。

### 21.3 对话中的配额预警

**原理**：每次 LLM 调用完成后 `runner.ts` 执行 `checkQuota()`，当用量达到阈值时在 SSE `done` 事件中附带 `quotaWarning`，同时作为 `delta` 追加到对话末尾。

#### 验证方式

先设置较低配额：

```bash
curl -X PUT http://localhost:18790/quota \
  -d '{"provider":"copilot","tier":"premium","monthlyLimit":5,"warnPct":0.5,"criticalPct":0.8,"autoDowngrade":true}'
```

然后发送几条消息，使用高倍率模型。

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 21.3.1 | 用量 ≥ 50%（warnPct） | 对话末尾出现 `⚠️ copilot 高级请求 XX.X%` 黄色预警 |
| 21.3.2 | 用量 ≥ 80%（criticalPct） | 预警升级为 `🔴 copilot 高级请求仅剩 N/5` |
| 21.3.3 | 用量 ≥ 100% | 提示 `🚫 copilot 高级请求已用尽`，自动降级 |
| 21.3.4 | 自动降级行为 | 路由器将 heavy/standard 请求降级到 light 层（0x 免费模型如 GPT-4o） |
| 21.3.5 | SSE done 事件 | `usage` 字段包含 `quotaWarning` 属性 |

### 21.4 /usage 命令配额显示

在对话中输入 `/usage`，查看输出。

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 21.4.1 | 无配额配置时 | 显示「未配置配额」或不显示配额部分 |
| 21.4.2 | 已配置配额时 | 显示各 provider 的用量进度（图标 + 百分比 + 用量/上限） |
| 21.4.3 | 配额图标 | ✅ ok / ⚠️ warn / 🔴 critical / 🚫 exhausted |

### 21.5 Copilot x-ratelimit 头捕获

**诊断用**：`copilot.ts` 在非流式调用中尝试捕获 `x-ratelimit-remaining` 和 `x-ratelimit-limit` 响应头并记录到 Core 日志。

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 21.5.1 | 使用 Copilot 发送消息 | Core 日志中如果出现 `x-ratelimit` 信息则记录（目前 Copilot 不一定返回这些头） |

---

---

## 22. Phase V UI 集成与增强

> **核心变更**：Skills 详情展开 + 紫色主题 + DiffPreview 集成 + 配额 UI

### 22.1 Skills 详情展开（V1）

| # | 操作 | 预期结果 |
|---|------|----------|
| 22.1.1 | 设置页 → Skills Tab | 每个 skill 左侧显示 ▶ 箭头 |
| 22.1.2 | 点击 skill 项 | 箭头变为 ▼，下方展开显示 SKILL.md 正文（pre 块，最多 2000 字符） |
| 22.1.3 | 再次点击 | 折叠回去 |
| 22.1.4 | API 验证 | `GET /skills` 返回 JSON 包含 `body` 字段 |

### 22.2 紫色主题（V2）

| # | 操作 | 预期结果 |
|---|------|----------|
| 22.2.1 | 设置 → 高级 → 主题切换 | 显示 💜紫色 / 深色 / 跟随系统 三个按钮 |
| 22.2.2 | 选择紫色 | 背景变为深紫 `#1a0a2e`，侧边栏 `#140822`，强调色 `#a855f7` |
| 22.2.3 | 所有界面元素 | Chat 气泡、工具卡片、Session 面板、Settings 均适配紫色 |
| 22.2.4 | 旧值迁移 | 之前保存 `light` 的自动变为 `purple` |

### 22.3 DiffPreview 集成（V3）

| # | 操作 | 预期结果 |
|---|------|----------|
| 22.3.1 | AI 调用 write_file 完成后 | 展开工具卡片，底部出现 DIFF PREVIEW 区域 |
| 22.3.2 | DiffPreview 内容 | 新文件显示绿色新增行（全文 `+` 前缀） |
| 22.3.3 | edit_file / replace_in_file | 同样展示 DiffPreview |
| 22.3.4 | Accept/Reject 按钮 | 可见但点击无实际操作（文件已写入，后续可扩展为撤销） |

### 22.4 配额 UI（V4）

#### 设置页

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 22.4.1 | 模型 Tab 底部 | 显示 "📊 月度请求配额" 区域 |
| 22.4.2 | 无配额时 | 显示提示文字 |
| 22.4.3 | 已配额时 | 每行显示 provider·tier + 用量/上限 + 进度条（绿/黄/红色） |

#### Chat 预警条

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 22.4.4 | 配额 ≥ warn 阈值 | 对话结束后显示黄色预警条 |
| 22.4.5 | 配额 ≥ critical 阈值 | 红色预警条 |
| 22.4.6 | 点击 ✕ 关闭 | 预警条消失 |

---

## 附录 A：快速回归检查单

完整的冒烟测试（约 15 分钟）：

- [ ] 1.1 Core 在线指示灯绿色
- [ ] 2.3 `Ctrl+B` 折叠/展开面板
- [ ] 3.1.1 新建对话按钮
- [ ] 3.2.3 会话分组标题（今天/昨天/最近7天/更早）
- [ ] 4.1 发送消息，收到流式回复
- [ ] 5.1-5.3 工具卡片 running→done/error 状态变化
- [ ] 7.1 `@` 触发 Mention Picker
- [ ] 13.1.2 模型选择器下拉
- [ ] 14.2.1 `Ctrl++` 放大，`Ctrl+0` 重置
- [ ] 14.1.1 紫色主题切换
- [ ] 17 `/health` 端点返回 ok
- [ ] 19.1.1 Core 日志出现「冻结记忆快照」
- [ ] 19.2.1 长任务触发预算警告（70%）
- [ ] 19.3.1 长对话触发压缩（日志出现 `[compressor] Step 1`）
- [ ] 19.4.3 多步骤任务后 AI 建议沉淀技能
- [ ] 19.5.1 新会话中 `session_search` 找到历史会话
- [ ] 20.1.2 重启后 purpose 仍保留
- [ ] 20.2.2 Agent 使用 `skill_view` 读取技能详情
- [ ] 21.3.1 配额预警在对话末尾显示
- [ ] 21.4.2 `/usage` 命令显示配额进度
- [ ] 22.1.2 Skills 展开显示 SKILL.md 正文
- [ ] 22.2.2 紫色主题切换正常
- [ ] 22.3.1 write_file 卡片展开显示 DiffPreview
- [ ] 22.4.4 配额预警条正确显示

---

## 附录 B：调试工具参考

### 查看 localStorage

打开 Tauri DevTools（开发模式下右键 → 检查元素）：

```js
// 当前 sessionKey
localStorage.getItem('equality-session-key')

// 缩放比例
localStorage.getItem('equality-zoom')

// 主题偏好
localStorage.getItem('equality-theme')

// 面板开关状态
localStorage.getItem('equality-panel-open')
```

### Core 日志

```powershell
# 查看 Core 进程输出（core-dev 任务已启动时）
# 或直接运行：
pnpm --filter @equality/core dev
```

### Phase O 相关调试

```powershell
# 查看 session 的冻结记忆快照字段
$sessions = Get-ChildItem "$env:APPDATA\Equality\sessions\*.json"
foreach ($f in $sessions) { $d = Get-Content $f | ConvertFrom-Json; if ($d.frozenMemorySnapshot) { Write-Host "$($d.key): $($d.frozenMemorySnapshot.Length) chars" } }

# 确认历史会话索引库已创建
Test-Path "$env:APPDATA\Equality\session-search.db"

# 临时调低压缩阈值（触发快速验证）
$env:CONTEXT_COMPRESS_THRESHOLD_MESSAGES = '8'

# 临时调低迭代上限（触发预算警告）
$env:AGENT_MAX_LLM_TURNS = '10'
```

### Phase T/U 相关调试

```powershell
# 查看 session 的 purpose 字段
$sessions = Get-ChildItem "$env:APPDATA\Equality\sessions\*.json"
foreach ($f in $sessions) { $d = Get-Content $f | ConvertFrom-Json; if ($d.purpose) { Write-Host "$($d.key): goal=$($d.purpose.goal)" } }

# 查看配额状态
curl http://localhost:18790/quota

# 设置 Copilot 高级请求配额为 300
curl -X PUT http://localhost:18790/quota -H 'Content-Type: application/json' -d '{"provider":"copilot","tier":"premium","monthlyLimit":300,"warnPct":0.8,"criticalPct":0.95,"autoDowngrade":true}'

# 查看用量统计（含配额信息）
curl http://localhost:18790/usage
```

### 常用测试 Prompt

```
# 触发多个工具调用
请帮我列出 src/ 目录的文件，并读取其中第一个文件的前 5 行

# 触发 codebase_search（N3）
在代码库中搜索所有调用了 useGateway 的地方

# 触发子 Agent（E3/E4）
@supervisor-workflow 请用并行子 Agent 分别分析 App.tsx 和 Chat.tsx 的代码结构

# 触发内存保存（G-H）
请记住：这个项目使用 Tauri v2 + React + pnpm monorepo 结构

# 触发技能沉淀建议（O3）—— 需要 5+ 工具调用
请帮我：读取 package.json → 检查 node_modules 大小 → 运行 pnpm outdated → 用 bash 执行 pnpm list --depth 0 → 生成依赖升级建议报告

# 触发历史会话搜索（O4）
上次我们讨论过的那个技术方案，你还记得具体细节吗？

# 触发压缩（O2）—— 需先设置 CONTEXT_COMPRESS_THRESHOLD_MESSAGES=8
请逐步分析这 5 个文件并给出建议：App.tsx / Chat.tsx / SessionPanel.tsx / ToolCallCard.tsx / StatusBar.tsx

# 触发 skill_view 工具（T2）
@supervisor-workflow 请帮我分析项目结构

# 验证配额预警（U）—— 需先通过 PUT /quota 设置低配额
请帮我分析这段代码的性能问题...

# 查看配额状态（U）
/usage
```
