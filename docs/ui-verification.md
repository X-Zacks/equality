# Equality Desktop — UI 验证操作手册

> **适用范围**：Phase A ～ N 全功能验证  
> **应用版本**：feat/phase-N-orchestration  
> **测试环境**：Tauri v2 + React 桌面端 · Core 服务 `http://localhost:18790`  
> **文档更新**：2025-07

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
| 13.3.2 | 技能详情 | 展开可查看 SKILL.md 描述 |

### 13.4 高级标签页（advanced）

| # | 检查点 | 预期结果 |
|---|--------|----------|
| 13.4.1 | 主题切换 | system / light / dark 三选一 |
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
| 14.1.1 | 设置中切换为 **浅色** | 整个应用切换为白色背景主题 |
| 14.1.2 | 切换为 **深色** | 整个应用切换为深色背景主题 |
| 14.1.3 | 切换为 **跟随系统** | 跟随 OS 深浅色设置自动切换 |
| 14.1.4 | 主题持久化 | 重启应用后主题偏好保持（localStorage `equality-theme`） |

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

### 18.1 SessionTreeView 未集成到 SessionPanel

**状态**：Phase N4 组件已创建，但 `SessionPanel.tsx` 仍使用平铺列表。

**影响**：子 Agent 会话（含 `::sub::` 的 key）在左侧面板中以普通列表项显示，不展示层级关系。

**临时验证方法**：

1. 查看会话 key 中是否含 `::sub::`（DevTools → localStorage 或 API `/sessions`）
2. 直接渲染 `SessionTreeView` 组件进行单元测试

**计划**：下一阶段将 `parseSessionHierarchy()` 的结果传入 `SessionTreeView` 替换当前的 flat list。

### 18.2 DiffPreview 未集成到 write_file 工具流程

**状态**：`DiffPreview.tsx` 已创建，但 `write_file` 工具调用目前不弹出 Diff 预览。

**计划**：Phase O 中在工具调用卡片内集成 DiffPreview，支持 Accept/Reject 文件写入。

### 18.3 TaskProgressBar 尚未与 PlanDAG 状态绑定

**状态**：组件已创建，但 PlanDAG 执行进度尚未通过 SSE 推送到前端。

**计划**：通过 SSE `plan_progress` 事件将进度数据绑定到 TaskProgressBar。

### 18.4 RoleIcon / StatusBadge 仅在 SessionTreeView 内使用

目前这两个组件仅被 `SessionTreeView.tsx` 引用，在主界面不可见。随 18.1 集成后即可验证。

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
- [ ] 14.1.1 浅色主题切换
- [ ] 17 `/health` 端点返回 ok

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
```
