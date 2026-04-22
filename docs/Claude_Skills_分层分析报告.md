# Anthropic Skills 分层分析报告

## 一、背景与目的

本报告基于以下材料，对 Anthropic Skills 体系进行系统梳理：

1. **Anthropic 官方仓库** (`anthropics/skills`) — 122k Stars
2. **社区收集仓库** (`claude-skills-collection`) — 173 个 Skills，13 个分类
3. **Anthropic Skills 体系分析与企业员工日常使用的 Skills 分层架构设计**（领导下发文档）

**分析目的**：将开源 Skills 按五层架构分类整理，评估各类 Skills 的企业可用性，给出落地优先级建议。

---

## 二、Skills 五层架构总览

| 层级 | 名称 | 核心职责 | 代表 Skills |
|------|------|----------|------------|
| L0 | 基础执行层 | 文件、表格、PDF、API、浏览器等原子操作 | docx / pdf / pptx / xlsx |
| L1 | 表现与格式层 | 视觉风格、品牌规范、主题系统 | brand-guidelines / theme-factory |
| L2 | 领域任务层 | 封装具体工作任务（文档协作、企业沟通等） | internal-comms / doc-coauthoring |
| L3 | 复合编排层 | 多 Skill 组合成完整工作流程 | dispatching-parallel-agents |
| L4 | 治理与产品层 | 权限、审计、记忆、安全、员工入口 | varlock（安全类） |

---

## 三、官方 Skills 分类整理

### 3.1 文档处理类（生产级，source-available）

| Skill | 说明 | 开源许可 | 企业价值 |
|-------|------|----------|----------|
| docx | Word 文档创建、编辑（格式、批注、修订） | Source-available | ⭐⭐⭐ 最高 |
| pdf | PDF 内容提取、拆分/合并、创建 | Source-available | ⭐⭐⭐ 最高 |
| pptx | PowerPoint 演示文稿生成和编辑 | Source-available | ⭐⭐⭐ 最高 |
| xlsx | Excel 文件、公式、表格、图表操作 | Source-available | ⭐⭐⭐ 最高 |

> **结论**：四个文档处理 Skill 均已投入生产，是员工 Agent 最接近价值兑现的入口，**直接采用作为 L0 基础执行层核心**。

### 3.2 企业规范与沟通类（Apache 2.0）

| Skill | 说明 | 企业价值 |
|-------|------|----------|
| brand-guidelines | 将公司品牌规范应用于输出内容 | ⭐⭐⭐ 高 |
| internal-comms | 起草正式内部沟通和报告 | ⭐⭐⭐ 高 |
| doc-coauthoring | 文档协作工作流指导 | ⭐⭐⭐ 高 |

> **结论**：三个 Skill 直接对应企业规范和协作场景，**优先进行企业化改造**。

### 3.3 开发与技术类（Apache 2.0）

| Skill | 说明 | 用途 |
|-------|------|------|
| claude-api | Claude API 调用最佳实践 | 开发支持 |
| webapp-testing | Playwright UI 测试自动化 | 开发支持 |
| mcp-builder | 构建 MCP 服务器 | 扩展平台能力 |
| skill-creator | 交互式构建新 Skill | 自举工具 |
| web-artifacts-builder | claude.ai HTML 工件构建 | 前端开发 |

### 3.4 设计与创意类（Apache 2.0）

| Skill | 说明 |
|-------|------|
| theme-factory | 文档视觉主题创建和应用 |
| canvas-design | PNG/PDF 布局视觉设计 |
| frontend-design | 生产级前端界面设计 |
| algorithmic-art | p5.js 生成艺术 |
| slack-gif-creator | Slack 优化 GIF 创建 |

### 3.5 官方 Partner / 特殊 Skill

| Skill | 来源 | 说明 |
|-------|------|------|
| firecrawl-cli | 官方 | 网页抓取、爬取、搜索和映射 |
| Notion Integration Skills | 官方 Partner | Notion 连接器 |
| Linear Claude Skill | 官方 Partner | Linear MCP 集成 |

---

## 四、社区 Skills 分类整理（按优先级）

### 4.1 高优先级（可直接评估采用）

| Skill | 分类 | 说明 |
|-------|------|------|
| dispatching-parallel-agents | 工作流编排 | 协调多个 Claude 子代理完成共享任务 |
| varlock-claude-skill | 安全治理 | 防 secrets 泄露，企业安全关键 |

### 4.2 中优先级（按需引入，需审核）

**协作类**：Meeting Insights Analyzer、Notion Integration、Linear Claude Skill、product-manager-skills、git-pushing、receiving-code-review、requesting-code-review、test-fixing、review-implementing

**写作研究类**：article-extractor、writing-skills、brainstorming、academic-research-skills、academic-paper、claude-email、copywriting、copy-editing、cold-email、email-sequence、claude-scientific-writer

**营销类**：seo-audit、content-strategy、social-content、analytics-tracking、pricing-strategy、launch-strategy

**数据处理类**：postgres、read-only-postgres、extract-from-pdfs、revealjs-skill

**工作流编排类**：non-fiction-book-factory、ebook-factory、autoresearch、academic-paper-reviewer、claude-blog、context-engineering-kit、compound-engineering-plugin、agentsys、cc-devops-skills

**学习知识类**：think-deeply、meta-pattern-recognition、scale-game、simplification-cascades、tapestry

**官方 Partner（按需引入）**：aws-skills（AWS）、terraform-skill（HashiCorp）、cloudflare-building-ai-agent（Cloudflare）、stripe-best-practices（Stripe）、next-best-practices（Vercel）、expo-app-design（Expo）、better-auth

### 4.3 低优先级（创新雷达，不直接部署）

| Skill | 分类 |
|-------|------|
| csv-data-summarizer | 数据处理 |
| Video Downloader | 媒体处理 |
| youtube-transcript | 媒体处理 |
| claude-epub-skill | 媒体处理 |
| file-organizer | 工具与自动化 |
| invoice-organizer | 工具与自动化 |
| raffle-winner-picker | 工具与自动化 |
| image-enhancer | 媒体处理 |
| nano-banana-image-generation | 图像生成 |
| frontend-slides | 演示设计 |

---

## 五、来源与治理评估

| 来源类型 | 特点 | 上线门槛 | 代表 Skill | 建议 |
|----------|------|----------|-----------|------|
| 官方（source-available） | 生产级、官方维护、质量最高 | 直接可用 | docx/pdf/pptx/xlsx | 直接采用 |
| 官方（Apache 2.0） | 参考级、可修改 | 审核后可用 | brand-guidelines/internal-comms | 以官方为模板企业化改造 |
| 官方 Partner | 合作伙伴官方维护、经过认证 | 确认许可证后可用 | Notion/Terraform/AWS/Stripe | 评估后引入 |
| 社区（可信来源） | 有维护质量、有明确许可证 | 严格审核后可用 | varlock/dispatching-parallel-agents | 安全类核心采用 |
| 社区（一般来源） | 质量参差、活跃度不一 | 不建议直接上线 | 多数长尾 Skill | 仅作创新雷达 |

---

## 六、企业分层落地建议

### L0 基础执行层 — ★★★★★ 最高优先级

**策略**：直接采用官方 docx/pdf/pptx/xlsx 作为核心；MCP 连接器按需引入；所有脚本需安全审核。

**关键行动**：
1. 评估现有文档处理流程，优先接入四个文档 Skill
2. 建立脚本安全审核机制
3. 按需引入社区数据处理 Skill（postgres、revealjs-skill）

### L1 表现与格式层 — ★★★★★ 最高优先级

**策略**：以官方 brand-guidelines 为基础构建企业品牌 Skill；theme-factory 作为模板引擎参考；设计系统需与品牌部门协同。

**关键行动**：
1. 对接品牌规范部门，提取企业 VI 规范
2. 将品牌规范编码为 Skill
3. 建立企业模板库

### L2 领域任务层 — ★★★★☆ 高优先级

**策略**：优先实现 internal-comms 和 doc-coauthoring 的企业版本；按需引入社区垂直领域 Skill。

**关键行动**：
1. 梳理高频工作场景（周报、会议纪要、邮件等）
2. 封装通用流程为上层 Skill，使普通员工不必理解底层调用
3. 引入合作伙伴集成（Notion、Linear 等）

### L3 复合编排层 — ★★★☆☆ 中优先级

**策略**：社区编排 Skill 作为创新雷达；核心编排逻辑建议企业自研；dispatching-parallel-agents 模式可借鉴。

**关键行动**：
1. 试点单一场景复合流程（如：从多份 PDF 提取 → 汇总表格 → 生成 PPT）
2. 沉淀可复用工作流模板
3. 评估自研编排引擎需求

### L4 治理与产品层 — ★★★☆☆ 中优先级

**策略**：完全企业自建；varlock 等安全 Skill 必须纳入；治理 7 要素必须完整建立。

**关键行动**：
1. 建立 Skills 准入审核机制
2. 制定权限、版本、记忆治理规范
3. 搭建员工技能市场（UI 封装）

---

## 七、治理七要素

企业构建 Skills 体系，至少需要建立以下七项治理机制：

1. **来源治理**：区分官方/内部自研/可信第三方/实验性社区来源，不同来源对应不同上线门槛
2. **版本治理**：每个 Skill 有版本号、变更记录、回滚方案和适配矩阵
3. **权限治理**：Skill 本身有敏感等级，读取本地文件/连接知识库/发邮件等风险级别不同
4. **模型治理**：不同 Skill 绑定不同模型策略，基础抽取用低成本模型，高风险总结用强模型
5. **记忆治理**：Skill 是否能读写长期记忆、访问共享记忆、如何引用历史任务，均需明确界定
6. **可观测性与审计**：最少记录调用链路、失败原因、模型选择、输入输出摘要和外部连接行为
7. **反馈闭环**：员工修订、拒绝、收藏、复用、替代路径，均应成为技能优化与路由改进的数据基础

---

## 八、总结

Anthropic Skills 体系的重要性，在于它把 Agent 开发从"围绕模型做一次性推理"推进到了"围绕技能做模块化工程"。官方仓库给出了权威定义和高质量样板，社区 collection 展示了生态宽度和未来方向。

**对联想这类大型企业的核心建议**：

1. **办公文档能力是第一批落地重点**（L0），直接对应员工日常工作载体
2. **企业规范必须以 Skill 沉淀**（L1/L2），品牌、措辞、模板、审批规范进入企业技能层
3. **社区生态是创新雷达，不是生产级资产**，所有社区 Skill 必须经过审核才能上线
4. **治理比技能本身更重要**，七项治理机制必须完整建立
5. **下一步不是追问有哪些 Skill，而是回答"我们需要什么样的 Skills 架构"**

---

## 附录：参考链接

- [Anthropic 官方 Skills 仓库](https://github.com/anthropics/skills)
- [社区 Skills 收集仓库](https://github.com/abubakarsiddik31/claude-skills-collection)
- [AgentSkills.io 规范](https://agentskills.io)
