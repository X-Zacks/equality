# Phase W: Skills UI 增强 — 技术规格

## W1: Skill 分类系统

### 后端
- `SkillMetadata` 新增 `category?: string` 字段
- 预定义分类：`development` | `data` | `document` | `communication` | `workflow` | `other`
- 分类推断：根据 Skill 名称/描述自动归类（如 coding/python/nodejs → development）
- `GET /skills` 返回 `category` 字段

### 分类规则

| 分类 | 匹配 Skill | 图标 |
|------|-----------|------|
| 🛠️ 开发 | coding, python, nodejs, git, testing-workflow, review-workflow | 🛠️ |
| 📊 数据处理 | excel-cost-diff-analysis, excel-quarterly-cost-diff-analysis | 📊 |
| 📄 文档处理 | markdown, pdf, pptx, docx, md-to-report-package, pdf-contract-llm-extract | 📄 |
| 💬 通信 | wechat-push, dingtalk | 💬 |
| 🔄 工作流 | supervisor-workflow, project-dev-workflow, openspec-skill, skill-creator | 🔄 |
| 🌐 网络 | web-fetch, aliyun-oss, browser | 🌐 |
| 📦 其他 | 未匹配的 | 📦 |

## W2: Skill 详情抽屉

### 前端
- 新组件 `SkillDetailDrawer.tsx`
- 从右侧滑入，宽度 400px
- 显示：Skill 名称、分类标签、来源、描述、SKILL.md 完整正文
- 关闭按钮 + 点击遮罩关闭
- 动画：translateX(100%) → 0

## W3: 分类筛选 Tab

### 前端
- Skills Tab 顶部增加分类筛选条
- 「全部」+ 各分类 Tab
- 选中分类后列表只显示该分类的 Skill
