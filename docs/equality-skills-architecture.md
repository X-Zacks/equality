# Equality Skills 分层架构分析

> 基于 Anthropic Skills 五层架构 × Equality 38 个 Bundled Skills 的对标分析  
> 日期：2026-04-22

---

## 一、分析目的

将 Equality 现有 38 个 bundled skills 按照 Anthropic Skills 五层架构（L0-L4）进行分类，
评估各层覆盖度，识别缺口，并给出分类 enum 扩展建议。

---

## 二、五层架构定义

| 层级 | 名称 | 核心职责 | 典型能力 |
|------|------|----------|----------|
| L0 | 基础执行层 | 文件/表格/PDF/API/浏览器等原子操作 | docx, pdf, pptx, xlsx |
| L1 | 表现与格式层 | 视觉风格、品牌规范、模板系统 | brand-guidelines, theme-factory |
| L2 | 领域任务层 | 封装具体工作任务（文档协作、沟通等） | internal-comms, doc-coauthoring |
| L3 | 复合编排层 | 多 Skill 组合成完整工作流程 | project-dev-workflow, supervisor-workflow |
| L4 | 治理与产品层 | 权限、审计、安全、员工入口 | （需自建） |

---

## 三、Equality 38 Skills 五层分类

### L0 基础执行层（12 个）

| Skill | 说明 | 对标 Anthropic | 企业价值 |
|-------|------|---------------|---------|
| **docx** | Word 文档创建/编辑 | ✅ 官方同名 | ⭐⭐⭐ |
| **pdf** | PDF 内容提取/创建 | ✅ 官方同名 | ⭐⭐⭐ |
| **pptx** | PowerPoint 生成/编辑 | ✅ 官方同名 | ⭐⭐⭐ |
| **xlsx** | Excel 文件/公式/图表 | ✅ 官方同名 | ⭐⭐⭐ |
| **claude-api** | Claude API 调用实践 | ✅ 官方同名 | ⭐⭐ |
| **web-fetch** | 网页抓取与内容提取 | 类似 firecrawl-cli | ⭐⭐ |
| **markdown** | Markdown 处理 | 社区级 | ⭐⭐ |
| **git** | Git 操作指导 | 社区级 | ⭐⭐ |
| **python** | Python 开发指导 | 社区级 | ⭐⭐ |
| **nodejs** | Node.js 开发指导 | 社区级 | ⭐⭐ |
| **coding** | 通用编码实践 | 社区级 | ⭐⭐ |
| **aliyun-oss** | 阿里云 OSS 操作 | 无对标（企业自研） | ⭐⭐ |

### L1 表现与格式层（4 个）

| Skill | 说明 | 对标 Anthropic | 企业价值 |
|-------|------|---------------|---------|
| **brand-guidelines** | 品牌规范应用 | ✅ 官方同名 | ⭐⭐⭐ |
| **theme-factory** | 文档视觉主题 | ✅ 官方同名 | ⭐⭐ |
| **canvas-design** | PNG/PDF 布局设计 | ✅ 官方同名 | ⭐⭐ |
| **frontend-design** | 前端界面设计 | ✅ 官方同名 | ⭐⭐ |

### L2 领域任务层（14 个）

| Skill | 说明 | 对标 Anthropic | 企业价值 |
|-------|------|---------------|---------|
| **internal-comms** | 内部沟通写作 | ✅ 官方同名 | ⭐⭐⭐ |
| **doc-coauthoring** | 文档协作工作流 | ✅ 官方同名 | ⭐⭐⭐ |
| **award-summary** | 奖项/荣誉汇总报告 | 企业自研 | ⭐⭐⭐ |
| **excel-quarterly-cost-diff-analysis** | 季度成本差异分析 | 企业自研 | ⭐⭐⭐ |
| **pdf-contract-llm-extract** | 合同 PDF 智能提取 | 企业自研 | ⭐⭐⭐ |
| **doc-extract-browser-regression** | 文档提取回归测试 | 企业自研 | ⭐⭐ |
| **md-to-report-package** | Markdown 转报告包 | 企业自研 | ⭐⭐⭐ |
| **webapp-testing** | Playwright UI 测试 | ✅ 官方同名 | ⭐⭐ |
| **mcp-builder** | MCP 服务构建 | ✅ 官方同名 | ⭐⭐ |
| **skill-creator** | Skill 创建向导 | ✅ 官方同名 | ⭐⭐ |
| **getting-started** | 新手引导 | 无对标 | ⭐⭐ |
| **git-auto-commit** | 自动提交工作流 | 社区级 | ⭐⭐ |
| **dingtalk** | 钉钉消息推送 | 企业自研（中国特色） | ⭐⭐⭐ |
| **wechat-push** | 微信推送 | 企业自研（中国特色） | ⭐⭐⭐ |

### L3 复合编排层（6 个）

| Skill | 说明 | 对标 Anthropic | 企业价值 |
|-------|------|---------------|---------|
| **project-dev-workflow** | 项目开发全流程编排 | 社区 dispatching-parallel-agents | ⭐⭐⭐ |
| **review-workflow** | 代码审查工作流 | 社区 review-implementing | ⭐⭐⭐ |
| **testing-workflow** | 测试工作流 | 社区级 | ⭐⭐ |
| **supervisor-workflow** | 监督者模式工作流 | 社区 dispatching-parallel-agents | ⭐⭐⭐ |
| **openspec-skill** | OpenSpec 规格驱动开发 | 无对标（独创） | ⭐⭐⭐ |
| **web-artifacts-builder** | Web 应用构建 | ✅ 官方同名 | ⭐⭐ |

### L4 治理与产品层（2 个）

| Skill | 说明 | 对标 | 企业价值 |
|-------|------|------|---------|
| **algorithmic-art** | 生成艺术演示 | ✅ 官方同名 | ⭐ |
| **slack-gif-creator** | Slack GIF 创建 | ✅ 官方同名 | ⭐ |

> 注：L4 层严格来说不是 Skill 范畴，而是平台治理能力。上述 2 个 skill 更偏创意展示，归入 L4 仅因不适合其他层。

---

## 四、覆盖度分析

| 层级 | 数量 | 覆盖度 | 评价 |
|------|------|--------|------|
| L0 基础执行层 | 12 | ⭐⭐⭐⭐⭐ | **完整**。四大文档 + API + Web + 开发语言全覆盖 |
| L1 表现与格式层 | 4 | ⭐⭐⭐⭐ | **良好**。与 Anthropic 官方 1:1 对标 |
| L2 领域任务层 | 14 | ⭐⭐⭐⭐ | **出色**。企业自研 skills（合同/成本分析/钉钉/微信）是差异化亮点 |
| L3 复合编排层 | 6 | ⭐⭐⭐ | **中等**。有工作流但编排引擎尚未统一 |
| L4 治理与产品层 | 2 | ⭐⭐ | **薄弱**。缺少安全审计、权限管控、技能市场等治理能力 |

### 与 Anthropic 官方仓库对标

| 官方 Skill | Equality 对应 | 状态 |
|-----------|--------------|------|
| docx | docx | ✅ 已有 |
| pdf | pdf | ✅ 已有 |
| pptx | pptx | ✅ 已有 |
| xlsx | xlsx | ✅ 已有 |
| brand-guidelines | brand-guidelines | ✅ 已有 |
| internal-comms | internal-comms | ✅ 已有 |
| doc-coauthoring | doc-coauthoring | ✅ 已有 |
| claude-api | claude-api | ✅ 已有 |
| mcp-builder | mcp-builder | ✅ 已有 |
| webapp-testing | webapp-testing | ✅ 已有 |
| skill-creator | skill-creator | ✅ 已有 |
| theme-factory | theme-factory | ✅ 已有 |
| canvas-design | canvas-design | ✅ 已有 |
| frontend-design | frontend-design | ✅ 已有 |
| algorithmic-art | algorithmic-art | ✅ 已有 |
| slack-gif-creator | slack-gif-creator | ✅ 已有 |
| web-artifacts-builder | web-artifacts-builder | ✅ 已有 |

**覆盖率：17/17 = 100%**。Equality 已完整覆盖 Anthropic 官方仓库的所有 skills。

---

## 五、Equality 独有优势（企业差异化）

以下 skills 是 Equality 相比 Anthropic 官方/社区的独特优势：

| Skill | 企业场景 |
|-------|---------|
| **dingtalk** | 中国企业钉钉集成 |
| **wechat-push** | 微信消息推送 |
| **aliyun-oss** | 阿里云存储操作 |
| **pdf-contract-llm-extract** | 合同智能提取 |
| **excel-quarterly-cost-diff-analysis** | 财务成本分析 |
| **award-summary** | 企业荣誉汇总 |
| **md-to-report-package** | 报告打包（MD→Word/PDF） |
| **openspec-skill** | 规格驱动开发方法论 |
| **project-dev-workflow** | 项目开发全流程 |
| **supervisor-workflow** | 监督者模式 |

---

## 六、分类 Enum 扩展建议

当前 `SkillMetadata.category` 仅支持 7 种：

```typescript
type Category = 'development' | 'data' | 'document' | 'communication' | 'workflow' | 'infra' | 'other'
```

建议扩展为两维分类（层级 + 领域）：

### 层级标签（新增）

```typescript
type SkillLayer = 'L0-execution' | 'L1-presentation' | 'L2-domain' | 'L3-orchestration' | 'L4-governance'
```

### 领域标签（扩展现有 category）

```typescript
type SkillCategory =
  // 现有
  | 'development' | 'data' | 'document' | 'communication' | 'workflow' | 'infra' | 'other'
  // 新增
  | 'design'          // 设计与创意（canvas-design, frontend-design）
  | 'enterprise'      // 企业规范（brand-guidelines, internal-comms）
  | 'integration'     // 系统集成（dingtalk, wechat-push, aliyun-oss）
  | 'testing'         // 测试（webapp-testing, testing-workflow）
  | 'finance'         // 财务/成本（excel-quarterly-cost-diff-analysis）
  | 'legal'           // 法务/合同（pdf-contract-llm-extract）
  | 'onboarding'      // 新手引导（getting-started）
```

### SkillMetadata 扩展

```typescript
interface SkillMetadata {
  // ... 现有字段
  layer?: SkillLayer           // 五层架构层级
  category?: SkillCategory     // 领域分类（扩展后）
  tags?: string[]              // 自由标签（用于搜索和推荐）
}
```

---

## 七、对 Skills 调用的帮助

分层架构对 Equality 的 Skills 调用体系有以下直接帮助：

### 7.1 Crew 模式的 Skill 推荐

当前 `SkillRetriever` 使用 BM25 + 关键词匹配。引入层级标签后：
- **Chat 模式**：仅注入 L0 + L1 层 skills（基础能力 + 格式规范）
- **Crew 模式**：根据 Crew 模板注入 L2 + L3 层 skills（领域 + 编排）
- **skill_search 工具**：可按 layer 过滤搜索结果

### 7.2 Briefing → Crew 的 Skill 自动绑定

`recommender.ts` 推荐 Crew 时，可以根据用户意图映射到层级：
- "帮我写个报告" → L0-document + L1-enterprise + L2-document
- "分析这个合同" → L0-pdf + L2-legal
- "做个季度成本分析" → L0-xlsx + L2-finance

### 7.3 成本控制

不同层级 Skill 可绑定不同模型策略：
- L0 基础执行：可用轻量模型（成本低）
- L2 领域任务：需要中等模型
- L3 复合编排：需要强模型（推理能力要求高）

### 7.4 安全分级

分层天然支持安全分级：
- L0 只读操作（pdf 提取）→ 低风险
- L2 系统集成（dingtalk/wechat 发消息）→ 中风险，需确认
- L3 编排层（supervisor-workflow 调用多个子任务）→ 高风险，需审批

---

## 八、落地路线建议

| 阶段 | 行动 | 优先级 |
|------|------|--------|
| 短期 | 给现有 38 skills 补充 `layer` 和 `tags` 元数据 | ⭐⭐⭐ |
| 短期 | `SkillRetriever` 支持按 layer 过滤 | ⭐⭐⭐ |
| 中期 | Crew 推荐器根据层级自动匹配 skills | ⭐⭐ |
| 中期 | 扩展 `SkillMetadata.category` enum | ⭐⭐ |
| 长期 | L4 治理层能力建设（审计/权限/技能市场） | ⭐⭐⭐ |

---

## 附录：参考资料

- [Anthropic 官方 Skills 仓库](https://github.com/anthropics/skills)
- [社区 Skills 收集仓库](https://github.com/abubakarsiddik31/claude-skills-collection)
- `docs/anthropic_skills_analysis_enterprise_architecture.md` — 企业 Skills 分层架构设计
- `docs/Claude_Skills_分层分析报告.md` — Skills 分层分析报告
