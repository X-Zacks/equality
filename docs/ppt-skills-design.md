# PPT Agent Skills 设计：解决覆盖与字号问题

> 日期：2026-04-25
> 基于：`docs/ppt-agent-feasibility-analysis.md` + `docs/ppt_agent_framework_detailed.md`

---

## 一、现状分析

### Equality 已有 PPT 能力

Equality 已内置完整的 `pptx` Skill（`packages/core/skills/pptx/`），包含：

| 文件 | 用途 |
|------|------|
| `SKILL.md` | 主编排：读取/编辑/创建 PPT 的入口指引 |
| `pptxgenjs.md` | PptxGenJS 完整 API 教程（文本、Shape、图表、图片、图标） |
| `editing.md` | 基于模板的编辑工作流（unpack → edit XML → pack） |
| `scripts/thumbnail.py` | 缩略图预览 |
| `scripts/add_slide.py` | 复制/新建幻灯片 |
| `scripts/clean.py` | 清理孤儿文件 |
| `scripts/office/` | LibreOffice 转换、验证器 |

**当前问题不是缺少 Skill，而是 Agent 生成 DeckSpec / 渲染脚本时的两个质量问题：**

### 问题 1：内容区域互相覆盖

**根因**：Agent 生成坐标时凭直觉分配 x/y/w/h，没有做碰撞检测。尤其当一个 slide 有 5+ 个元素时，Shape 之间的 bounding box 极易重叠。

**当前 SKILL.md 已有提醒**但仅停留在文字层面：
> "Overlapping elements (text through shapes, lines through words, stacked elements)"

没有给 Agent 一个**程序化的检测手段**来验证和自动修复。

### 问题 2：字太小，Shape 显得空旷

**根因**：
1. Agent 倾向于保守分配 fontSize（默认 13-14pt），对大标题也不敢用大字
2. Shape 分配了较大面积但文本只占很小比例，缺乏"填充率"概念
3. `pptxgenjs.md` 中给出了字号参考（标题 36-44pt、正文 14-16pt），但 Agent 在生成 DeckSpec 或脚本时经常忽略

---

## 二、解决方案总体设计

### 核心思路：DeckSpec 生成时约束 + 渲染后程序化 QA + 自动修复

```
用户需求
  → ① ppt-deck-planner: 生成 DeckSpec JSON（含布局约束模板）
  → ② ppt-layout-engine: 坐标分配 + 碰撞检测 + fontSize 计算
  → ③ ppt-renderer: 渲染 PPTX（现有 pptxgenjs.md 驱动）
  → ④ ppt-qa-fixer: 渲染后视觉 QA + 自动修复
  → ⑤ 交付用户
```

**关键创新**：在步骤②引入一个 **Layout Engine 脚本**，Agent 生成初始 DeckSpec 后，用程序计算坐标、检测碰撞、调整字号，再输出修正后的 DeckSpec。

---

## 三、Layout Engine：解决覆盖问题的核心

### 3.1 碰撞检测算法

两个矩形 A 和 B 是否重叠，用 AABB 检测：

```
A: (ax, ay, ax+aw, ay+ah)  — 左上角 (ax,ay)，右下角 (ax+aw, ay+ah)
B: (bx, by, bx+bw, by+bh)

重叠条件（同时满足）：
  ax < bx+bw  AND  ax+aw > bx  AND  ay < by+bh  AND  ay+ah > by
```

加上最小间距 gap（建议 0.3 英寸）：

```
有碰撞 = ax-gap < bx+bw AND ax+aw+gap > bx AND ay-gap < by+bh AND ay+ah+gap > by
```

### 3.2 自动修复策略

当检测到碰撞时，按以下优先级修复：

1. **垂直下移**：将后定义的元素向下移动到前一个元素的 `y + h + gap` 处
2. **缩小宽度**：如果水平空间不足，收窄宽度使两列并排
3. **溢出警告**：如果修复后 y+h > slideHeight，报告"内容过多，建议拆页"

### 3.3 Layout Engine 脚本设计

```javascript
// scripts/ppt-layout-engine.js
// 用法: node scripts/ppt-layout-engine.js input-deckspec.json output-deckspec.json

const SLIDE_W = 10;      // LAYOUT_16x9
const SLIDE_H = 5.625;
const MARGIN = 0.5;       // 页边距
const GAP = 0.3;          // 元素最小间距
const CONTENT_X = MARGIN;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const TITLE_Y = 0.3;
const TITLE_H = 0.7;
const CONTENT_Y = TITLE_Y + TITLE_H + GAP;  // 标题下方开始

// ── 碰撞检测 ──
function overlaps(a, b, gap = GAP) {
  return (
    a.x - gap < b.x + b.w &&
    a.x + a.w + gap > b.x &&
    a.y - gap < b.y + b.h &&
    a.y + a.h + gap > b.y
  );
}

// ── 越界检测 ──
function isOutOfBounds(obj) {
  return obj.x < 0 || obj.y < 0 ||
    obj.x + obj.w > SLIDE_W ||
    obj.y + obj.h > SLIDE_H;
}

// ── 布局修复：从上到下流式排布 ──
function fixSlideLayout(slide) {
  const issues = [];
  const title = slide.objects.find(o => o.id === 'title' || o.type === 'title');
  const others = slide.objects.filter(o => o !== title);

  // 标题固定位置
  if (title) {
    title.x = CONTENT_X;
    title.y = TITLE_Y;
    title.w = CONTENT_W;
    title.h = TITLE_H;
  }

  // 内容区域：从 CONTENT_Y 开始，逐个排布
  let cursorY = CONTENT_Y;
  const placed = [];

  for (const obj of others) {
    // 确保不超出页面宽度
    if (obj.x + obj.w > SLIDE_W - MARGIN) {
      obj.w = Math.min(obj.w, CONTENT_W);
      obj.x = CONTENT_X;
    }

    // 检查与已放置元素的碰撞
    let hasCollision = true;
    let attempts = 0;
    while (hasCollision && attempts < 20) {
      hasCollision = false;
      for (const p of placed) {
        if (overlaps(obj, p)) {
          // 向下移动
          obj.y = p.y + p.h + GAP;
          hasCollision = true;
          break;
        }
      }
      attempts++;
    }

    // 如果仍然超出底部，记录警告
    if (obj.y + obj.h > SLIDE_H - MARGIN) {
      issues.push({
        slideId: slide.slideId,
        severity: 'error',
        code: 'CONTENT_OVERFLOW',
        message: `Object "${obj.id}" overflows slide bottom (y+h=${(obj.y+obj.h).toFixed(2)}, max=${SLIDE_H}). Consider splitting into two slides.`
      });
    }

    placed.push(obj);
  }

  return { slide, issues };
}

// ── 全 Deck 检测 ──
function validateAndFixDeck(deck) {
  const allIssues = [];

  for (const slide of deck.slides) {
    // 1. 碰撞检测 + 修复
    const { issues: layoutIssues } = fixSlideLayout(slide);
    allIssues.push(...layoutIssues);

    // 2. 越界检测
    for (const obj of slide.objects) {
      if (isOutOfBounds(obj)) {
        allIssues.push({
          slideId: slide.slideId,
          slideNumber: slide.slideNumber,
          severity: 'warning',
          code: 'OBJECT_OUT_OF_BOUNDS',
          message: `Object "${obj.id}" at (${obj.x},${obj.y}) size ${obj.w}x${obj.h} exceeds slide boundary`
        });
      }
    }
  }

  return { deck, issues: allIssues };
}
```

---

## 四、字号自适应：解决文本过小问题

### 4.1 问题分析

当前 Agent 生成 fontSize 的行为：
- 标题：常用 24pt（太小，应该 36-44pt）
- 正文：常用 11-13pt（太小，应该 14-16pt）
- 大数字/KPI：常用 24pt（太小，应该 48-72pt）

**根本原因**：Agent 没有基于 Shape 面积和文本量来动态计算合适的字号。

### 4.2 字号计算策略

核心思路：**根据 Shape 的面积和文本长度，计算能填满 60-80% 面积的最大字号。**

```javascript
// ── 字号自适应计算 ──

// 1pt ≈ 1/72 英寸，一个字符宽度约 0.6 * fontSize(英寸)
const PT_TO_INCH = 1 / 72;

function calculateOptimalFontSize(text, shapeW, shapeH, opts = {}) {
  const {
    minSize = 12,
    maxSize = 72,
    targetFillRatio = 0.65,  // 目标填充率 65%
    lineSpacingFactor = 1.4, // 行间距系数
    charWidthFactor = 0.55,  // 字符宽度/字号比（中文约 1.0，英文约 0.55）
    isChinese = false,
  } = opts;

  const cwf = isChinese ? 0.95 : charWidthFactor;
  const usableW = shapeW * 0.9; // 扣除内边距
  const usableH = shapeH * 0.9;
  const textLen = text.length;

  // 二分查找最佳字号
  let lo = minSize, hi = maxSize, best = minSize;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const charW = mid * PT_TO_INCH * cwf;
    const lineH = mid * PT_TO_INCH * lineSpacingFactor;
    const charsPerLine = Math.floor(usableW / charW);
    const numLines = Math.ceil(textLen / Math.max(charsPerLine, 1));
    const totalH = numLines * lineH;
    const fillRatio = totalH / usableH;

    if (fillRatio <= 1.0) {
      best = mid;
      if (fillRatio < targetFillRatio) {
        lo = mid + 1; // 还能更大
      } else {
        break; // 刚好合适
      }
    } else {
      hi = mid - 1; // 太大了，会溢出
    }
  }

  return best;
}

// ── 按元素类型的字号规则 ──
const FONT_SIZE_RULES = {
  title:       { min: 32, max: 48, targetFill: 0.5 },
  subtitle:    { min: 16, max: 24, targetFill: 0.4 },
  text:        { min: 14, max: 20, targetFill: 0.7 },
  bullet_list: { min: 14, max: 18, targetFill: 0.7 },
  callout:     { min: 14, max: 20, targetFill: 0.6 },
  kpi_number:  { min: 36, max: 72, targetFill: 0.3 },
};

function autoFontSize(obj, slide) {
  const rule = FONT_SIZE_RULES[obj.type] || FONT_SIZE_RULES.text;
  const text = typeof obj.content === 'string' ? obj.content
    : obj.content?.items?.join('\n') || '';

  const isChinese = /[\u4e00-\u9fff]/.test(text);

  return calculateOptimalFontSize(text, obj.w, obj.h, {
    minSize: rule.min,
    maxSize: rule.max,
    targetFillRatio: rule.targetFill,
    isChinese,
  });
}
```

### 4.3 何时计算字号

**两个时机都做**：

1. **DeckSpec 生成时**（Deck Planner Prompt 中加入字号规则）— 让 LLM 第一次就生成合理字号
2. **Layout Engine 脚本中**（程序化修正）— 作为兜底，覆盖 LLM 生成的不合理字号

---

## 五、改进后的 PPT 生成全流程

```
用户说 "帮我做一份 6 页的 AI 架构介绍 PPT"

Step 1: Agent 激活 @pptx Skill
  ├─ 读取 SKILL.md → 决定"从零创建" → 参考 pptxgenjs.md
  ├─ Agent (LLM) 生成完整渲染脚本 render.js
  │   包含：slide 定义、文本、Shape、图表、坐标、字号
  │
Step 2: Layout & Font 校验脚本（新增）
  ├─ Agent 先生成 DeckSpec JSON（或直接从渲染脚本提取元素列表）
  ├─ bash: node scripts/ppt-validate-layout.js deckspec.json
  │   输出：碰撞列表 + 字号建议 + 修正后的坐标/字号
  ├─ Agent 根据输出修正渲染脚本
  │
Step 3: 渲染
  ├─ bash: node render.js → output.pptx
  │
Step 4: 视觉 QA（现有流程）
  ├─ soffice → PDF → pdftoppm → slide images
  ├─ subtask_spawn: 子 Agent 视觉检查每页图片
  ├─ 发现问题 → 修改渲染脚本 → 重新渲染
  │
Step 5: 交付
```

---

## 六、需要新增的脚本

### 6.1 `scripts/ppt-validate-layout.js` — 碰撞检测 + 字号校验

**输入**：DeckSpec JSON 文件路径（或渲染脚本中提取的元素列表）
**输出**：JSON 格式的问题列表 + 修正建议

```javascript
#!/usr/bin/env node
// scripts/ppt-validate-layout.js
// Usage: node ppt-validate-layout.js <deckspec.json> [--fix] [--output fixed.json]
//
// 检测 DeckSpec 中的布局问题并输出修正建议

const fs = require('fs');
const path = require('path');

// ── 常量 ──
const LAYOUTS = {
  'LAYOUT_16x9':  { w: 10,    h: 5.625 },
  'LAYOUT_16x10': { w: 10,    h: 6.25 },
  'LAYOUT_WIDE':  { w: 13.33, h: 7.5 },
};
const DEFAULT_LAYOUT = 'LAYOUT_16x9';
const MARGIN = 0.5;
const MIN_GAP = 0.3;

// ── 字号规则 ──
const FONT_RULES = {
  title:       { min: 32, max: 48 },
  subtitle:    { min: 16, max: 28 },
  text:        { min: 14, max: 22 },
  bullet_list: { min: 14, max: 20 },
  callout:     { min: 14, max: 24 },
  chart:       { min: 10, max: 14 },  // 图表内标签
  table:       { min: 11, max: 14 },
  kpi:         { min: 36, max: 72 },  // 大数字
};

// ── AABB 碰撞检测 ──
function rectsOverlap(a, b, gap = MIN_GAP) {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

// ── 越界检测 ──
function checkBounds(obj, slideW, slideH) {
  const issues = [];
  if (obj.x < 0) issues.push(`x=${obj.x} < 0`);
  if (obj.y < 0) issues.push(`y=${obj.y} < 0`);
  if (obj.x + obj.w > slideW) issues.push(`right edge ${(obj.x+obj.w).toFixed(2)} > ${slideW}`);
  if (obj.y + obj.h > slideH) issues.push(`bottom edge ${(obj.y+obj.h).toFixed(2)} > ${slideH}`);
  if (obj.x < MARGIN) issues.push(`x=${obj.x} < margin ${MARGIN}`);
  if (obj.x + obj.w > slideW - MARGIN) issues.push(`right ${(obj.x+obj.w).toFixed(2)} > ${slideW - MARGIN}`);
  return issues;
}

// ── 字号评估 ──
function checkFontSize(obj) {
  const fontSize = obj.style?.fontSize || obj.fontSize;
  if (!fontSize) return null;

  const type = obj.type || 'text';
  const rule = FONT_RULES[type] || FONT_RULES.text;

  if (fontSize < rule.min) {
    return {
      code: 'FONT_TOO_SMALL',
      current: fontSize,
      suggested: rule.min,
      message: `${type} fontSize ${fontSize}pt < minimum ${rule.min}pt`
    };
  }
  if (fontSize > rule.max) {
    return {
      code: 'FONT_TOO_LARGE',
      current: fontSize,
      suggested: rule.max,
      message: `${type} fontSize ${fontSize}pt > maximum ${rule.max}pt`
    };
  }
  return null;
}

// ── 文本填充率计算 ──
function estimateFillRatio(text, w, h, fontSize, isChinese = false) {
  if (!text || !fontSize) return null;
  const ptToInch = 1 / 72;
  const charW = fontSize * ptToInch * (isChinese ? 0.95 : 0.55);
  const lineH = fontSize * ptToInch * 1.4;
  const usableW = w * 0.85;
  const usableH = h * 0.85;
  const charsPerLine = Math.max(Math.floor(usableW / charW), 1);
  const numLines = Math.ceil(text.length / charsPerLine);
  const textH = numLines * lineH;
  return textH / usableH;
}

// ── 最佳字号计算 ──
function suggestFontSize(text, w, h, type, isChinese = false) {
  const rule = FONT_RULES[type] || FONT_RULES.text;
  let best = rule.min;
  for (let fs = rule.max; fs >= rule.min; fs--) {
    const fill = estimateFillRatio(text, w, h, fs, isChinese);
    if (fill !== null && fill <= 1.0) {
      best = fs;
      break;
    }
  }
  return best;
}

// ── 主验证函数 ──
function validateDeck(deck) {
  const layout = LAYOUTS[deck.layout || DEFAULT_LAYOUT] || LAYOUTS[DEFAULT_LAYOUT];
  const { w: slideW, h: slideH } = layout;
  const allIssues = [];

  for (const slide of deck.slides) {
    const objs = slide.objects || [];

    // 1. 两两碰撞检测
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        if (rectsOverlap(objs[i], objs[j])) {
          allIssues.push({
            slideNumber: slide.slideNumber,
            severity: 'error',
            code: 'OVERLAP',
            message: `"${objs[i].id}" and "${objs[j].id}" overlap or gap < ${MIN_GAP}"`,
            objectA: { id: objs[i].id, rect: [objs[i].x, objs[i].y, objs[i].w, objs[i].h] },
            objectB: { id: objs[j].id, rect: [objs[j].x, objs[j].y, objs[j].w, objs[j].h] },
          });
        }
      }
    }

    // 2. 越界检测
    for (const obj of objs) {
      const bounds = checkBounds(obj, slideW, slideH);
      if (bounds.length > 0) {
        allIssues.push({
          slideNumber: slide.slideNumber,
          severity: 'warning',
          code: 'OUT_OF_BOUNDS',
          objectId: obj.id,
          message: bounds.join('; '),
        });
      }
    }

    // 3. 字号检测
    for (const obj of objs) {
      const fontIssue = checkFontSize(obj);
      if (fontIssue) {
        allIssues.push({
          slideNumber: slide.slideNumber,
          severity: 'warning',
          ...fontIssue,
          objectId: obj.id,
        });
      }
    }

    // 4. 密度检测（元素过多）
    if (objs.length > 8) {
      allIssues.push({
        slideNumber: slide.slideNumber,
        severity: 'warning',
        code: 'TOO_MANY_OBJECTS',
        message: `${objs.length} objects on slide (max recommended: 8). Consider splitting.`,
      });
    }
  }

  return allIssues;
}

// ── CLI 入口 ──
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node ppt-validate-layout.js <deckspec.json> [--fix] [--output fixed.json]');
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(args[0], 'utf-8'));
const issues = validateDeck(input);

if (issues.length === 0) {
  console.log(JSON.stringify({ status: 'ok', issues: [] }, null, 2));
} else {
  console.log(JSON.stringify({ status: 'issues_found', count: issues.length, issues }, null, 2));
}
```

### 6.2 何处放置脚本

**方案 A**（推荐）：放入现有 `pptx` Skill 的 `scripts/` 目录：

```
packages/core/skills/pptx/
  scripts/
    ppt-validate-layout.js    ← 新增：碰撞检测 + 字号校验
    add_slide.py               （已有）
    clean.py                   （已有）
    thumbnail.py               （已有）
    office/                    （已有）
```

---

## 七、SKILL.md 需要增加的 Prompt 约束

### 7.1 在 DeckSpec 生成阶段加入的约束（写入 SKILL.md 的 Design Ideas 部分）

```markdown
### Layout Coordinate Rules (CRITICAL)

**Slide dimensions** (LAYOUT_16x9): 10" × 5.625"

**Safe content area**: x ∈ [0.5, 9.5], y ∈ [0.5, 5.125]

**标题区域**（固定）: x=0.5, y=0.25, w=9.0, h=0.7, fontSize=36-44pt

**内容区域起点**: y = 1.2（标题下方 0.25" 间距）

**元素间距规则**：
- 垂直相邻元素间距 ≥ 0.3"
- 水平相邻元素间距 ≥ 0.3"
- 距页面边缘 ≥ 0.5"

**坐标计算公式**（每个元素必须满足）：
- `x + w ≤ 9.5`（不超出右边界）
- `y + h ≤ 5.125`（不超出下边界）
- 与前一个元素的 y 间距 = 前元素.y + 前元素.h + 0.3

**不要凭感觉分配坐标**——按照以上公式逐个计算。

### Font Size Rules (CRITICAL)

| 元素类型 | 最小字号 | 推荐字号 | 最大字号 |
|----------|----------|----------|----------|
| Slide 标题 | 32pt | 36-40pt | 48pt |
| 副标题 | 16pt | 20-24pt | 28pt |
| 正文文本 | 14pt | 16-18pt | 22pt |
| Bullet 列表 | 14pt | 15-16pt | 20pt |
| KPI 大数字 | 36pt | 48-60pt | 72pt |
| 图表/表格标签 | 10pt | 12pt | 14pt |
| 注脚/来源 | 9pt | 10pt | 12pt |

**绝不使用小于 14pt 的正文字号。** 如果文本放不下，缩小文本量或拆页，不要缩小字号。

### Fill Ratio（饱和度）

Shape 中文本的视觉填充率目标：
- 标题框：50-60%（留白感）
- 正文框：65-80%（饱满但不拥挤）
- KPI 数字框：30-40%（大数字 + 标签）
- Bullet 列表：60-75%

**"空旷"的根因是字号太小**——当 Shape 只填充了 20-30% 时，说明字号至少应该翻倍。
```

### 7.2 在 QA 流程中加入碰撞检测步骤

在 SKILL.md 的 `## QA (Required)` 部分增加：

```markdown
### Layout Validation (Run Before Visual QA)

Before converting to images, validate the layout programmatically:

1. Export element coordinates to JSON (or extract from render script)
2. Run validation:
   ```bash
   node scripts/ppt-validate-layout.js deckspec.json
   ```
3. Fix any OVERLAP or OUT_OF_BOUNDS issues before rendering
4. Re-render and then proceed to Visual QA
```

---

## 八、两种实现路径对比

### 路径 A：修改现有 `pptx` Skill（推荐，最小改动）

| 改动 | 文件 | 内容 |
|------|------|------|
| 新增脚本 | `scripts/ppt-validate-layout.js` | 碰撞检测 + 字号校验 |
| 更新 SKILL.md | Design Ideas 节 | 添加坐标规则、字号规则、填充率指南 |
| 更新 SKILL.md | QA 节 | 添加 Layout Validation 步骤 |

**优势**：不需要新增 Skill，复用现有 pptx Skill 体系
**工作量**：1 个脚本 + SKILL.md 更新 ≈ 半天

### 路径 B：拆分为多个 Skills（文档方案的路径）

按 `ppt-agent-feasibility-analysis.md` 拆分成 6 个 Skills：
- `ppt-deck-planner`、`ppt-renderer`、`ppt-theme-library`、`ppt-slide-editor`、`ppt-validator`、`ppt-agent`

**劣势**：Agent 需要协调多个 Skill，复杂度高，当前 pptx Skill 已经覆盖这些能力
**工作量**：6 个 SKILL.md + 多个脚本 ≈ 3-5 天

### 推荐：路径 A

现有 `pptx` Skill 的 `SKILL.md` + `pptxgenjs.md` + `editing.md` 已经是一个非常完善的 Skill 体系，覆盖了创建、编辑、QA 全流程。**问题不在 Skill 结构，而在 Agent 生成坐标/字号时缺乏程序化校验。** 加一个校验脚本 + 更新 Prompt 约束就能解决。

---

## 九、实施计划

| 步骤 | 内容 | 预估 |
|------|------|------|
| 1 | 编写 `scripts/ppt-validate-layout.js` | 1h |
| 2 | 更新 `SKILL.md` 添加坐标/字号规则 + QA 步骤 | 30min |
| 3 | 更新 `pptxgenjs.md` 在 Quick Reference 中强调字号最小值 | 15min |
| 4 | 同步 desktop 的 resources/skills/pptx/ | 15min |
| 5 | 测试：让 Agent 生成一份 PPT，观察覆盖/字号是否改善 | 1h |

---

## 十、总结

| 问题 | 解决手段 | 作用阶段 |
|------|----------|----------|
| **元素覆盖** | AABB 碰撞检测脚本 + Prompt 约束坐标计算公式 | 生成时 + QA |
| **字号过小** | 字号最小值规则 + 填充率概念 + Prompt 强调 | 生成时 |
| **Shape 空旷** | 填充率目标指导 + 自适应字号计算 | 生成时 |
| **生成后验证** | `ppt-validate-layout.js` 程序化检测 | QA |
