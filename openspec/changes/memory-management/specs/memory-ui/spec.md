# Delta Spec: Memory Management — Desktop UI

> Phase M1 — 设置页记忆管理 Tab

## ADDED Requirements

### Requirement: 设置页 Memory Tab

Settings 页面 MUST 新增 "记忆" Tab，位于 "技能" 和 "高级" 之间。

SettingsTab 类型 MUST 为 `'model' | 'tools' | 'skills' | 'memory' | 'advanced' | 'about'`

#### Scenario: Tab 可见
- GIVEN 用户打开设置页
- WHEN 页面渲染完成
- THEN 可见 6 个 Tab：模型、工具、技能、记忆、高级、关于

---

### Requirement: 记忆列表

Memory Tab MUST 显示分页记忆列表，每条显示：
- 内容文本（截断到 2 行）
- 元信息行：category · importance · agentId · workspaceDir · source · createdAt
- 操作按钮：编辑(✏️)、置顶(📌)、删除(🗑)

pinned 记忆 MUST 排在列表最前，以 📌 图标标识。

#### Scenario: 列表加载
- GIVEN 42 条记忆，其中 3 条 pinned
- WHEN 切换到 Memory Tab
- THEN 显示 20 条记忆（首页）
- AND 前 3 条为 pinned 记忆
- AND 底部显示分页控件 "1/3" + 总计

---

### Requirement: 搜索与过滤

Memory Tab MUST 提供：
- 搜索框（FTS 全文搜索）
- 分类下拉过滤（all / preference / fact / decision / project / general）
- Agent 下拉过滤（从 stats.byAgent 动态获取）
- 项目下拉过滤（从 stats.byWorkspace 动态获取）

#### Scenario: 搜索过滤
- GIVEN 用户在搜索框输入 "zacks"
- WHEN 防抖 300ms 后触发搜索
- THEN 列表刷新为匹配 "zacks" 的记忆

---

### Requirement: 批量操作

Memory Tab 操作栏 MUST 提供：
- 全选 checkbox
- 删除所选
- 归档所选
- 置顶所选

#### Scenario: 批量删除
- GIVEN 用户勾选 3 条记忆
- WHEN 点击 "删除所选"
- THEN 弹出确认弹窗 "确定删除 3 条记忆？"
- AND 确认后调用 DELETE /memories?ids=a,b,c

---

### Requirement: 编辑弹窗

点击 ✏️ MUST 打开编辑弹窗，可修改：
- text（textarea）
- category（下拉）
- importance（1-10 滑块）
- pinned（checkbox）

元信息区域（只读）：source、agentId、workspaceDir、sessionKey、createdAt、updatedAt

保存时调用 PATCH /memories/:id。

#### Scenario: 编辑保存
- GIVEN 用户修改记忆文本
- WHEN 点击 "保存"
- THEN 调用 PATCH /memories/:id
- AND 列表刷新显示更新后内容

---

### Requirement: 添加弹窗

点击 ➕ MUST 打开添加弹窗，可填：
- text（必填，textarea）
- category（下拉，默认 general）
- importance（1-10 滑块，默认 5）
- agentId（下拉，默认 default）
- workspaceDir（下拉，可选）
- pinned（checkbox）

去重检测：提交前 MUST 检查重复，重复时显示 "检测到近似记忆" 提示。

#### Scenario: 去重提示
- GIVEN 已有 "偏好 TypeScript"
- WHEN 用户输入 "喜欢用 TypeScript" 并提交
- THEN 显示 "检测到近似记忆: '偏好 TypeScript' (97%)"
- AND 提供 [仍然添加] [更新已有] 两个选项

---

### Requirement: 统计面板

点击 📊 MUST 展开统计面板，显示：
- 总记忆数、已归档数、置顶数、向量覆盖率
- 按分类/来源/Agent/项目 的分组计数

#### Scenario: 统计展示
- GIVEN GET /memories/stats 返回数据
- WHEN 用户点击 📊
- THEN 面板展开显示所有统计指标

---

### Requirement: autoCapture Toast 提示

聊天界面 MUST 在 autoCapture 成功时显示轻量级 Toast：
- 文本："💾 已自动记住: {text.slice(0, 60)}"
- [撤销] 按钮 → 调用 DELETE /memories/:id
- 5 秒后自动消失

#### Scenario: 自动捕获 Toast
- GIVEN 用户发送 "记住我叫 zacks"
- WHEN SSE 收到 `memory-captured` 事件
- THEN 底部显示 "💾 已自动记住: 记住我叫 zacks"
- AND [撤销] 按钮可点击

#### Scenario: 撤销自动捕获
- GIVEN Toast 显示中
- WHEN 用户点击 [撤销]
- THEN 调用 DELETE /memories/:id
- AND Toast 变为 "已撤销"
