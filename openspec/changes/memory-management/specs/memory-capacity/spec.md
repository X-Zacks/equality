# Delta Spec: Memory Management — Capacity Control

> Phase M3 — 时间衰减 + GC + 导入导出 + autoCapture 开关

## ADDED Requirements

### Requirement: 时间衰减

hybrid search 在 score fusion 阶段 MUST 应用时间衰减因子：

$$\text{decayed\_score} = \text{raw\_score} \times e^{-\frac{\ln 2}{\text{halfLife}} \times \text{ageDays}}$$

其中 `halfLife = 30`（天），`ageDays = (Date.now() - created_at) / 86400000`。

时间衰减 MUST 只在 Recall 阶段（default-engine.ts）应用，memory_search 工具 SHOULD 也应用但可通过参数禁用。

pinned 记忆 MUST 豁免时间衰减（衰减因子固定为 1.0）。

#### Scenario: 30 天半衰期
- GIVEN 两条记忆: A(今天, score=0.8), B(30天前, score=0.8)
- WHEN 应用时间衰减
- THEN A.decayed=0.8, B.decayed=0.4
- AND A 排在 B 前面

#### Scenario: Pinned 豁免
- GIVEN pinned 记忆 P(90天前, score=0.5)
- WHEN 应用时间衰减
- THEN P.decayed=0.5（不衰减）

#### Scenario: 新记忆不受影响
- GIVEN 记忆 N(1小时前, score=0.6)
- WHEN 应用时间衰减
- THEN N.decayed ≈ 0.5999（几乎无变化）

---

### Requirement: 自动归档 GC

`memoryGC()` MUST 实现基于以下策略的自动归档：

| 条件 | 动作 |
|------|------|
| `importance ≤ 3 AND age > 90 天 AND pinned = 0` | 归档 |
| `importance ≤ 5 AND age > 180 天 AND pinned = 0` | 归档 |
| `archived = 1 AND age > 365 天` | 永久删除 |

GC MUST 在 Core 启动时执行一次，之后每 24 小时执行一次。
GC 执行后 MUST 记录日志（归档数 + 删除数）。
GC MUST 不影响 pinned 记忆。

#### Scenario: 低重要性老旧记忆归档
- GIVEN 记忆: importance=2, age=100天, pinned=0, archived=0
- WHEN memoryGC()
- THEN archived=1, updated_at 已设置

#### Scenario: Pinned 记忆保护
- GIVEN 记忆: importance=1, age=200天, pinned=1, archived=0
- WHEN memoryGC()
- THEN 不变（pinned 保护）

#### Scenario: 过期归档永久删除
- GIVEN 记忆: archived=1, age=400天
- WHEN memoryGC()
- THEN 记录被永久删除

---

### Requirement: 导出记忆

`GET /memories/export` MUST 返回所有记忆（含已归档）的 JSON 数组。

响应格式：
```json
{
  "version": 1,
  "exportedAt": 1712736000000,
  "count": 42,
  "items": [MemoryEntry, ...]
}
```

embedding 字段 MUST 从导出中排除（体积过大，可重算）。

#### Scenario: 完整导出
- GIVEN 42 条记忆（含 3 条归档）
- WHEN GET /memories/export
- THEN 返回 count=42, items 含所有 42 条
- AND items 中无 embedding 字段

---

### Requirement: 导入记忆

`POST /memories/import` MUST 接受导出格式的 JSON，支持两种模式：

| 模式 | 说明 |
|------|------|
| `merge` (默认) | 逐条导入，跳过重复（cosine≥0.95），跳过不安全内容 |
| `replace` | 清空现有记忆后导入（危险操作，需确认） |

Body: `{ items: MemoryEntry[], mode?: 'merge' | 'replace' }`

每条导入的记忆 MUST 执行安全扫描。
导入后 MUST 触发快照失效。

#### Scenario: Merge 导入
- GIVEN 导入 10 条，其中 3 条与现有重复
- WHEN POST /memories/import { items, mode: 'merge' }
- THEN 导入 7 条，跳过 3 条重复
- AND 返回 { imported: 7, skipped: 3, blocked: 0 }

#### Scenario: Replace 导入
- GIVEN 现有 20 条记忆
- WHEN POST /memories/import { items: 10条, mode: 'replace' }
- THEN 删除旧的 20 条，导入新的 10 条
- AND 返回 { imported: 10, deleted: 20 }

#### Scenario: 安全拦截
- GIVEN 导入 5 条，其中 1 条包含 prompt injection
- WHEN POST /memories/import { items, mode: 'merge' }
- THEN 导入 4 条，拦截 1 条
- AND 返回 { imported: 4, skipped: 0, blocked: 1 }

---

### Requirement: autoCapture 设置开关

高级设置 MUST 提供 `MEMORY_AUTO_CAPTURE` 开关：
- 值：`'on'` (默认) | `'off'`
- 存储：同其他 Secret（via saveApiKey）
- 效果：`'off'` 时 runner.ts 跳过 autoCapture 调用

#### Scenario: 关闭 autoCapture
- GIVEN MEMORY_AUTO_CAPTURE='off'
- WHEN 用户发送 "记住我叫 zacks"
- THEN autoCapture 不执行，不保存记忆

#### Scenario: 默认开启
- GIVEN MEMORY_AUTO_CAPTURE 未设置
- WHEN 用户发送 "记住我叫 zacks"
- THEN autoCapture 正常执行

---

## MODIFIED Requirements

### Requirement: MemoryTab 增加导入导出按钮

MemoryTab 的 StatsPanel 区域 MUST 新增：
- "⬇️ 导出" 按钮 → 调用 GET /memories/export → 下载为 JSON
- "⬆️ 导入" 按钮 → 文件选择 → 读取 JSON → POST /memories/import

（Previously: 只有统计面板，无导入导出操作）

#### Scenario: 导出为文件
- GIVEN 42 条记忆
- WHEN 用户点击 "导出"
- THEN 浏览器下载 `equality-memories-2026-04-10.json`

#### Scenario: 导入文件
- GIVEN 用户选择了导出的 JSON 文件
- WHEN 文件上传完成
- THEN 显示导入结果 "已导入 7 条，跳过 3 条重复"

---

### Requirement: 高级设置 autoCapture 开关

高级设置 Tab MUST 新增 "自动记忆" 行：
- 标签："自动记忆（Auto Capture）"
- 描述："对话中检测到 '记住/remember' 等关键词时自动保存到长期记忆"
- 控件：开关 toggle（on/off）

（Previously: 高级设置无记忆相关选项）

#### Scenario: 切换 autoCapture
- GIVEN 用户在高级设置中关闭 "自动记忆"
- WHEN 保存设置
- THEN MEMORY_AUTO_CAPTURE='off' 被持久化
- AND 后续对话不再自动捕获记忆
