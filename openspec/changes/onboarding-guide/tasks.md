# Tasks: 用户引导增强（Onboarding Guide）

## 检查清单

- [x] T1: WelcomeGuide 组件 — 欢迎引导卡片
- [x] T2: Chat.tsx 集成 WelcomeGuide
- [x] T3: BOOTSTRAP.md 模板增加功能导览
- [x] T4: getting-started 内置 Skill
- [x] T5: FeatureTip 功能发现提示组件
- [x] T6: Chat.tsx 集成 FeatureTip

---

## T1: WelcomeGuide 组件

**文件**: `packages/desktop/src/WelcomeGuide.tsx` + `WelcomeGuide.css`（新增）

**Props**:
```typescript
interface WelcomeGuideProps {
  onSendPrompt: (text: string) => void
}
```

**结构**:
- 品牌区: logo emoji（⚖️）+ 标题"你好，我是 Equality" + 副标题"你的桌面 AI 助理，随时准备帮你完成各种任务"
- 场景卡片 2×2 网格:
  - 🧑‍💻 "分析项目结构" → "帮我分析当前目录的项目结构，并列出主要模块和技术栈"
  - 📝 "撰写文档" → "帮我为当前项目写一份清晰的 README 文档"
  - 🔍 "搜索信息" → "搜索最新的 TypeScript 5.x 有哪些新特性"
  - 🛠️ "自动化工作流" → "帮我创建一个自动化的 Git 提交和推送工作流 Skill"
- 快捷提示: "@ 选技能 · # 选工具 · 📎 加文件 · Enter 发送"
- 点击卡片 → `onSendPrompt(预设文本)`

**CSS 要点**:
- `.welcome-guide` — flex column, 居中, 占满 `.chat-messages` 空间
- `.welcome-cards` — CSS Grid 2 列, gap 12px, max-width 520px
- `.welcome-card` — 圆角卡片, hover 高亮, cursor pointer
- 暗色/亮色主题兼容（`.theme-light .welcome-*`）
- 响应式: 窄屏时单列

**验收**: 空会话时显示 4 张卡片, 点击任一卡片触发发送

---

## T2: Chat.tsx 集成 WelcomeGuide

**文件**: `packages/desktop/src/Chat.tsx`（修改）

**变更点**:
1. `import WelcomeGuide from './WelcomeGuide'`
2. 替换空状态块（约第 721-726 行）:
   ```tsx
   // 旧:
   {messages.length === 0 && !streaming && (
     <div className="chat-empty">
       <span className="chat-empty-icon">💬</span>
       <p>开始对话吧</p>
     </div>
   )}
   // 新:
   {messages.length === 0 && !streaming && (
     <WelcomeGuide onSendPrompt={handleWelcomePrompt} />
   )}
   ```
3. 新增 `handleWelcomePrompt` 回调: 设置 input 并触发发送

**验收**: 新/空会话看到 WelcomeGuide, 一旦有消息自动消失

---

## T3: BOOTSTRAP.md 功能导览

**文件**: `packages/core/src/agent/workspace-bootstrap.ts`（修改）

**变更**: 在 `BOOTSTRAP_TEMPLATE` 的 `## 完成引导` 前插入:

```markdown
## 功能导览（认识用户后简要提及）

了解用户后，在对话中自然地提到 1-2 个最相关的能力：

- **工具能力** — "我可以帮你执行命令、读写文件、搜索网页、分析图片/PDF 等。"
- **Skills 技能** — "我有 20+ 内置技能（Git、Python、文档处理等），输入 @ 就能选择。"
- **记忆能力** — "告诉我需要记住的事，下次对话我还会记得。"
- **文件处理** — "你可以把文件拖进对话框，我来帮你分析。"
- **子会话** — "复杂任务我会拆分给子 Agent 并行处理。"

不要一口气全讲——根据用户的工作领域，挑最相关的 1-2 个即可。
```

**验收**: 新工作区首次引导时 Agent 会自然提到功能

---

## T4: getting-started 内置 Skill

**文件**: `packages/core/skills/getting-started/SKILL.md`（新增）

**Frontmatter**:
```yaml
name: getting-started
description: 'Equality 新手指南。Use when: 用户第一次使用、不知道如何开始、问"你能做什么"、问"怎么用"。NOT for: 已熟悉系统的高级用户查询特定功能。'
tools:
  - memory_save
  - memory_search
equality:
  auto-generated: true
  source-model: equality-system
  created: 2025-07-26
```

**正文大纲**:
1. 快速开始（5 分钟上手）
2. 六大能力: 对话/工具/Skills/记忆/文件/自动化
3. 八个场景: 代码分析、文档生成、信息检索、Git 管理、Python 脚本、文件处理、记忆管理、自定义 Skill
4. 高级技巧: @多Skill / 暂停恢复 / 子会话分工 / 工具编排

**验收**: `@getting-started` 能触发并返回完整指南

---

## T5: FeatureTip 功能发现提示

**文件**: `packages/desktop/src/FeatureTip.tsx` + `FeatureTip.css`（新增）

**Props**:
```typescript
interface FeatureTipProps {
  messageCount: number
  hasUsedSkill: boolean
  hasUsedAttachment: boolean
}
```

**提示规则**:
| id | 条件 | 文本 |
|---|---|---|
| `tip-drag-file` | messageCount === 0 且未 dismiss | 💡 拖放文件到对话框，可以分析图片、PDF、代码等 |
| `tip-at-skill` | messageCount >= 3 且 !hasUsedSkill 且未 dismiss | 💡 输入 @ 可选择 20+ 内置技能，如 @git、@python、@coding |
| `tip-attach` | messageCount >= 5 且 !hasUsedAttachment 且未 dismiss | 💡 点击 📎 添加文件，支持图片/PDF/代码等多种格式 |

**行为**:
- 提示条在输入区上方，淡入显示
- 8 秒后自动淡出，或点 ✕ 关闭
- dismiss 状态写入 `localStorage('equality_tip_dismissed_' + id)`

**CSS**: 半透明背景横条，与 `.chat-input-area` 对齐

**验收**: 各条件触发对应提示, 关闭后不再出现

---

## T6: Chat.tsx 集成 FeatureTip

**文件**: `packages/desktop/src/Chat.tsx`（修改）

**变更**:
1. `import FeatureTip from './FeatureTip'`
2. 追踪状态: `hasUsedSkill`（skillTags 非空时设为 true）、`hasUsedAttachment`（attachments 添加过时设为 true）
3. 在 `.chat-input-area` 内、暂停横幅之前插入:
   ```tsx
   <FeatureTip
     messageCount={messages.length}
     hasUsedSkill={hasUsedSkill}
     hasUsedAttachment={hasUsedAttachment}
   />
   ```

**验收**: 正常对话中按条件出现提示

---

## 实施顺序

T4（Skill 独立，无依赖）→ T3（模板修改，独立）→ T1 → T2（前端依赖 T1）→ T5 → T6（前端依赖 T5）
