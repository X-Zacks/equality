# Phase W: Skills UI 增强 — 任务清单

## W1: Skill 分类系统 ✅
- [x] `SkillMetadata` 新增 `category` 字段 (`types.ts`)
- [x] `GET /skills` 返回 `category`，含自动推断逻辑 (`index.ts`)
- [x] 分类规则覆盖 39 个 Skill

## W2: 分类筛选 Tab ✅
- [x] Skills Tab 顶部添加分类筛选按钮条
- [x] 支持「全部」+ 6 个分类
- [x] 空分类自动隐藏
- [x] 计数显示

## W3: Skill 详情抽屉 ✅
- [x] 右侧滑入抽屉组件（400px / 85vw）
- [x] 显示 Skill 名称、分类、来源、描述、SKILL.md 正文
- [x] 遮罩层 + 关闭按钮
- [x] 动画：translateX slide-in + fade overlay
- [x] Purple 主题适配

## W4: 样式清理 ✅
- [x] 移除旧的 `skill-expand` 折叠箭头
- [x] 新增 `.skill-category-tabs`, `.skill-drawer` 等 CSS
- [x] Purple 主题覆盖抽屉和分类 Tab 样式
