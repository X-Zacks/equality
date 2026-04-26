---
name: pptx-template
description: 'Use PptxGenJS to generate PowerPoint presentations while preserving template design through AI-powered visual analysis. Use when: 用户提供了PPT模板并希望保留模板风格，但想用代码驱动生成；需要版本控制、可重复生成的PPT生成流程；需要自动化pipeline生成PPT。NOT for: 直接编辑现有PPT文件（用pptx skill）；模板有复杂母版资源需要精确保留（用template editing）；简单的PPT创建（直接用PptxGenJS即可）。'
license: Proprietary. LICENSE.txt has complete terms
---

# PPTX Template Skill

## Overview

Generate PowerPoint presentations using **PptxGenJS** while preserving template design through **AI-powered visual analysis**.

### Pipeline

```
Template PPT → PDF → PNG (images)
     ↓
AI Vision Analysis → Design Spec MD (colors, fonts, spacing, layouts)
     ↓
PptxGenJS reads MD → Generates PPT
```

## When to Use

Use this skill when you need:
- **Code-driven PPT generation** (version control, reproducibility)
- **Template style preservation** (brand consistency)
- **Complex layouts** (tables, charts, multi-column)
- **Automated pipeline** (CI/CD integration possible)

## Quick Start

```bash
# 1. Extract template images
python scripts/template-to-images.py template.pptx

# 2. AI analyzes design (manual or auto)
# Review and edit: template-design-spec.md

# 3. Generate PPT
node scripts/generate-pptx.js content.json design-spec.md output.pptx
```

## Workflow

### Step 1: Template Analysis

```bash
python scripts/template-to-images.py template.pptx [--output images/]
```

This creates:
- `template-{n}.png` - Individual slide images
- `template-thumb.png` - Thumbnail grid

### Step 2: Design Specification (Manual)

Use AI vision analysis to create `template-design-spec.md`:

```markdown
# Template Design Specification

## Color Palette
- Primary: #1F4E79 (dark blue)
- Secondary: #4472C4 (blue)
- Accent: #C00000 (red)
- Background Dark: #1A1A2E
- Background Light: #FFFFFF
- Text Dark: #333333
- Text Light: #FFFFFF

## Typography
- Title: Microsoft YaHei, 40pt, bold
- Subtitle: Microsoft YaHei, 24pt
- Body: Microsoft YaHei, 16pt
- Caption: Microsoft YaHei, 12pt

## Layout Patterns

### Cover Slide (Dark)
- Background: #1A1A2E
- Title: centered, 40pt, white
- Subtitle: centered below title, 24pt

### Content Slide (Light)
- Background: #FFFFFF
- Title: top-left, 36pt, dark blue
- Content: left-aligned, 16pt
- Footer: page number bottom-right

### Comparison Table
- Header row: dark blue background, white text
- Alternating rows: light gray / white
- Accent column: light blue background

## Spacing Rules
- Page margin: 0.5"
- Title to content: 0.3"
- Between elements: 0.2"
- Table cell padding: 0.1"

## Visual Elements
- Logo position: bottom-left corner
- Page number: bottom-right, 12pt
- Section divider: full-bleed dark background
```

### Step 3: Content Preparation

Create `content.json`:

```json
{
  "title": "Presentation Title",
  "slides": [
    {
      "type": "cover",
      "title": "Main Title",
      "subtitle": "Subtitle"
    },
    {
      "type": "content",
      "title": "Slide Title",
      "bullets": [
        "Point 1",
        "Point 2"
      ]
    },
    {
      "type": "table",
      "title": "Comparison",
      "headers": ["Column 1", "Column 2"],
      "rows": [
        ["Value 1", "Value 2"]
      ]
    }
  ]
}
```

### Step 4: Generate PPT

```bash
node scripts/generate-pptx.js content.json template-design-spec.md output.pptx
```

## Slide Types

| Type | Description | Usage |
|------|-------------|-------|
| `cover` | Dark background title slide | Title + subtitle |
| `section` | Dark section divider | Section titles |
| `content` | Light content slide | Bullets, text |
| `two-column` | Two column layout | Comparisons |
| `table` | Data table | Structured data |
| `timeline` | Horizontal timeline | Processes |
| `cards` | Card grid | Features, options |

## Design Spec Schema

```yaml
colors:
  primary: "#HEXCODE"
  secondary: "#HEXCODE"
  accent: "#HEXCODE"
  bg_dark: "#HEXCODE"
  bg_light: "#HEXCODE"
  text_dark: "#HEXCODE"
  text_light: "#HEXCODE"

fonts:
  title: "Font Name, size_pt, bold"
  subtitle: "Font Name, size_pt"
  body: "Font Name, size_pt"
  caption: "Font Name, size_pt"

spacing:
  margin: "0.5"  # inches
  title_gap: "0.3"
  element_gap: "0.2"

layouts:
  cover:
    background: "bg_dark"
    title_align: "center"
  content:
    background: "bg_light"
    title_position: "top-left"
```

## Scripts

| Script | Purpose |
|--------|---------|
| `template-to-images.py` | Convert PPT to PNG images |
| `generate-pptx.js` | Generate PPT from content + spec |
| `validate-layout.js` | Validate slide layout |

## Dependencies

- `pip install Pillow` - Image processing
- `npm install pptxgenjs` - PPT generation
- LibreOffice (`soffice`) - PDF conversion
- Poppler (`pdftoppm`) - PDF to images

## Comparison with Template Editing

| Aspect | Template Editing | PptxGenJS + Vision |
|--------|-----------------|---------------------|
| Learning curve | Medium (XML editing) | Medium (JS + spec) |
| Version control | Difficult (binary XML) | Easy (JS + JSON/MD) |
| Style accuracy | 100% (inherited) | ~95% (AI analysis) |
| Automation | Limited | Full CI/CD possible |
| Flexibility | Template-dependent | Code-driven |

## Example

See `examples/` directory for complete example:
- `template-design-spec.md` - Design specification
- `content.json` - Presentation content
