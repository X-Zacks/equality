# Tasks: Chat / Crew 双模态 + Skills 按需分发

## Phase 1：Crew Template + 双模态基础

### Core 侧

- [x] **1.1** 新建 `packages/core/src/crew/types.ts`：CrewTemplate 接口定义
- [x] **1.2** 新建 `packages/core/src/crew/store.ts`：Crew Template 文件存储（JSON，`%APPDATA%/Equality/crews/`）
- [x] **1.3** 新建 `packages/core/src/crew/index.ts`：导出
- [x] **1.4** 修改 `packages/core/src/index.ts`：新增 `/crews` CRUD 路由（GET/POST/PUT/DELETE）
- [x] **1.5** 修改 `packages/core/src/session/store.ts`：Session 新增 `mode`（默认 'chat'）和 `crewId` 字段
- [x] **1.6** 修改 `packages/core/src/agent/system-prompt.ts`：`buildSystemPrompt` 接受 `mode` 参数
  - Chat 模式：仅注入 always Skills，不注入 `<available_skills>` 全量索引
  - Crew 模式：注入 Crew 绑定的 Skills 索引 + systemPromptExtra
- [x] **1.7** 修改 `packages/core/src/agent/runner.ts`：从 Session 读取 crewId → 加载 Crew → 过滤 Skills
- [x] **1.8** `pnpm typecheck` 通过

### Desktop 侧

- [x] **1.9** 新建 `packages/desktop/src/CrewPanel.tsx`：Crew 列表 + 编辑页（三 Tab：基础信息/System Prompt/Skills）
- [x] **1.10** 修改 `packages/desktop/src/App.tsx`：侧边栏增加 Crew 入口
- [x] **1.11** 修改 `packages/desktop/src/useGateway.ts`：新增 Crew CRUD API 调用
- [ ] **1.12** 修改 `packages/desktop/src/Chat.tsx`：Crew Session 头部显示 Crew 名称和 Skills 数量
- [x] **1.13** i18n：`locales/zh-CN.json` 和 `locales/en.json` 新增 Crew 相关翻译

---

## Phase 2：Briefing 系统

- [ ] **2.1** 新建 `packages/core/src/crew/briefing.ts`：BriefingGenerator（LLM 一次调用提炼上下文）
- [ ] **2.2** 新增 Gateway 路由 `POST /briefing/generate`
- [ ] **2.3** 修改 `packages/core/src/agent/system-prompt.ts`：注入 `<briefing>` 块
- [ ] **2.4** 修改 `packages/desktop/src/Chat.tsx`：Chat 对话 ≥ 3 轮后显示浮动操作栏
  - [🚀 创建 Crew 开始干活] [📋 导入到已有 Crew]
- [ ] **2.5** 实现 Chat → Crew 的完整导入流程（生成 Briefing → 创建 Crew Session）

---

## Phase 3：Skill Retriever + skill_search 工具

- [ ] **3.1** 新建 `packages/core/src/skills/retriever.ts`：SkillRetriever 类（关键词 + BM25）
- [ ] **3.2** 新增 `packages/core/src/tools/builtins/skill-search.ts`：skill_search 工具
- [ ] **3.3** 修改 `packages/core/src/agent/system-prompt.ts`：Chat/Crew 模式均提示 skill_search 可用
- [ ] **3.4** 移除 System Prompt 中全量 O3 匹配规则（不再让 LLM 扫描全部 description）

---

## Phase 4：AI 辅助 Crew 创建

- [ ] **4.1** 新建 `packages/core/src/crew/recommender.ts`：从 Chat 历史推荐 Crew 配置
- [ ] **4.2** 修改 `packages/desktop/src/Chat.tsx`：用户点击"创建 Crew"后展示推荐结果（Interactive UI）
- [ ] **4.3** 用户确认后自动创建 Crew Template + Crew Session

---

## 文件变更汇总

| 文件 | 操作 | Phase |
|------|------|-------|
| `packages/core/src/crew/types.ts` | 新建 | 1 |
| `packages/core/src/crew/store.ts` | 新建 | 1 |
| `packages/core/src/crew/index.ts` | 新建 | 1 |
| `packages/core/src/crew/briefing.ts` | 新建 | 2 |
| `packages/core/src/crew/recommender.ts` | 新建 | 4 |
| `packages/core/src/skills/retriever.ts` | 新建 | 3 |
| `packages/core/src/tools/builtins/skill-search.ts` | 新建 | 3 |
| `packages/core/src/index.ts` | 修改 | 1 |
| `packages/core/src/session/store.ts` | 修改 | 1 |
| `packages/core/src/agent/system-prompt.ts` | 修改 | 1, 2, 3 |
| `packages/core/src/agent/runner.ts` | 修改 | 1 |
| `packages/desktop/src/CrewPanel.tsx` | 新建 | 1 |
| `packages/desktop/src/App.tsx` | 修改 | 1 |
| `packages/desktop/src/useGateway.ts` | 修改 | 1 |
| `packages/desktop/src/Chat.tsx` | 修改 | 1, 2 |
| `packages/desktop/src/locales/*.json` | 修改 | 1 |
