---
name: award-summary
description: '根据 Lenovo IT 奖项提名 Excel，生成获奖统计汇总 Excel 和图文 HTML 报告。Use when: 用户提交包含 Individual Award、Team Award、Remark、Sheet2 的奖项提名 Excel。NOT for: 非奖项提名类 Excel；仅查看 Excel 内容不做统计；多文件跨目录对比。'
equality:
  auto-generated: true
  source-model: MiniMax-M2.7
  created: 2026-03-30
---

# Award Summary Skill

根据 Lenovo IT 奖项提名 Excel，生成获奖统计汇总 Excel 和图文 HTML 报告。

## 📁 Excel 结构说明

| Sheet | 内容 | 用途 |
|-------|------|------|
| **Individual Award** | 个人奖项候选人列表 | 读取个人获奖数据 |
| **Team Award** | 团队奖项候选人列表 | 读取团队获奖数据 |
| **Remark** | 奖项类别中英文对照 | 参考奖项映射 |
| **Sheet2** | 统计需求说明（示例数据勿用） | 理解输出格式 |

## 📌 执行步骤

### Step 1：读取 Individual Award

从左往右逐行读取，每行包含：
- Tower（部门）
- **Tower Leader**（重要！用于后续按列统计）
- Award Category（奖项类别，需映射为中文）
- IT Code
- 姓名

**⚠️ 常见错误**：不要凭记忆或假设填写奖项名称，必须严格对照 Remark 和实际数据。

### Step 2：读取 Team Award

同样逐行读取：
- Tower
- **Tower Leader**
- Award Category
- 成员信息（人数统计）

### Step 3：收集所有唯一 Tower Leader

**⚠️ 关键点**：Tower Leader 必须从 Individual Award 和 Team Award 的原始数据中提取，**不要**参考 Sheet2 的示例数据。

提取规则：
- 同一部门的不同写法需合并（如 "Qin Lei" 和 "qinlei2" 视为同一人）
- 按出现顺序去重

### Step 4：生成统计 Excel

#### Sheet1: 数量汇总
| 奖项类别 | 奖项名称 | [Tower Leader 1] | [Tower Leader 2] | ... | 合计 |
|----------|----------|------------------|------------------|-----|------|

按行填入每种奖项在各 Tower Leader 下的获奖人数。

#### Sheet2: 名字汇总
| 奖项类别 | 奖项名称 | [Tower Leader 1] | [Tower Leader 2] | ... |
|----------|----------|------------------|------------------|-----|

按行填入每种奖项在各 Tower Leader 下的获奖者姓名，多人用分号分隔。

### Step 5：生成 HTML 报告

包含以下模块：

1. **封面概览**：标题 + 统计卡片（个人奖人数、团队奖数、总人数、Tower Leader 数）

2. **数据可视化**（使用 Chart.js CDN）：
   - 各 Tower Leader 获奖数量柱状图
   - 奖项类型分布饼图
   - 季度奖 vs 年度奖对比
   - 个人奖 vs 团队奖人数对比

3. **个人奖项展示**：按奖项分类展示获奖者信息

4. **团队奖项展示**：展示团队人数和代表

5. **统计汇总表**：复刻 Excel 的两个 Sheet

**⚠️ Chart.js 常见问题**：
- 确保使用正确的 CDN：`https://cdn.jsdelivr.net/npm/chart.js`
- 确保 `canvas` 元素有 `id` 属性
- 确保 `new Chart(ctx, config)` 在 DOM 加载后执行

## 📊 奖项名称映射表

| 英文奖项 | 中文奖项 |
|----------|----------|
| Transformation Pioneer | 金狮奖-转型先锋 |
| Outstanding Innovator | 金鼎奖-杰出创新者 |
| Culture Champion | 金像奖-文化风范 |
| Rising Newcomer | 金苗奖 |
| IT Hero | 金色英雄奖 |
| Leadership Excellence | 金板凳-领导力 |
| Team Excellence | 金棕榈团队 / 金球奖 |
| Tower Award | 京海点赞奖 |

## 🔧 输出路径

默认输出到原始 Excel 同目录：
- `FY24_Award_Summary.xlsx` - 统计 Excel
- `FY24_Award_Summary.html` - 图文 HTML

## ⚠️ 执行注意事项

1. **数据准确性**：每次必须从原始 Sheet 逐行读取，禁止凭记忆或假设
2. **Tower Leader 完整性**：从所有 Sheet 提取而非参考示例
3. **奖项名称匹配**：严格对照 Remark，不推测
4. **HTML 图表渲染**：Chart.js CDN 和 canvas id 必须正确配置
