# Proposal: Memory Management System

> **Change ID**: memory-management  
> **日期**: 2026-04-10  
> **前置**: Phase 12 (Memory CRUD) + Phase K2 (Hybrid Search)

---

## 动机

当前记忆系统存在 5 个关键缺陷：

1. **无管理界面** — 用户完全看不到记忆库内容，无法浏览/编辑/删除
2. **无作用域隔离** — 所有 Agent 共享同一记忆池，跨 Agent 噪音严重
3. **无来源追溯** — memory_save 工具未传 sessionKey，无法追溯记忆来源
4. **无容量控制** — 记忆无限增长，老旧记忆持续被召回
5. **autoCapture 不透明** — 用户不知道自己的话被静默存储

参考 OpenClaw memory-core/memory-lancedb 和 Hermes MemoryStore 的设计，
本提案引入完整的记忆管理体系。

---

## 范围

### Phase M1: 基础记忆管理 UI + 安全 (P0)
- Schema 演进：新增 agent_id, workspace_dir, source, updated_at, archived, pinned 字段
- REST API：`/memories` CRUD + `/memories/stats`
- 记忆去重（cosine≥0.95）+ 安全扫描（prompt injection 检测）
- Desktop 端：设置页 Memory Tab（列表/搜索/过滤/编辑/添加）
- autoCapture Toast 提示 + 撤销

### Phase M2: Agent + Workspace 作用域 + 通知 (P1)
- Recall 按 agent_id + workspace_dir 过滤
- pinned 记忆强制包含
- 编辑/删除后通知活跃 session 重新 Recall

### Phase M3: 容量控制 + 时间衰减 + 导入导出 (P2)
- 时间衰减公式：score × exp(-ln2/30 × ageDays)
- Compaction 前 flush
- JSON 导入/导出

---

## 非范围

- 外部 embedding provider（保持零依赖 n-gram）
- 多用户隔离（当前单用户桌面应用）
- 记忆共享/同步（跨设备）
