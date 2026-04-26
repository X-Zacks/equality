# PptxGenJS + Vision Analysis Template Pipeline

A workflow for generating PowerPoint presentations using **PptxGenJS** while preserving template design through **AI-powered visual analysis**.

## Quick Start

### 1. Extract Template Images

```bash
python scripts/template-to-images.py template.pptx --output images/
```

### 2. Analyze Design (Vision AI)

Review the generated images and create `template-design-spec.md`:

```bash
# Or use vision AI to auto-generate
```

### 3. Prepare Content

Create `content.json` with your slides:

```json
{
  "slides": [
    { "type": "cover", "title": "...", "subtitle": "..." },
    { "type": "content", "title": "...", "bullets": [...] }
  ]
}
```

### 4. Generate PPT

```bash
node scripts/generate-pptx.js content.json template-design-spec.md output.pptx
```

## Pipeline Diagram

```
┌─────────────┐     ┌─────────┐     ┌──────────┐
│  Template   │ ──> │   PDF    │ ──> │   PNG    │
│    PPTX     │     │         │     │  Images  │
└─────────────┘     └─────────┘     └──────────┘
                                         │
                                         ▼
┌─────────────┐     ┌─────────────┐  ┌──────────┐
│   Output    │ <── │ PptxGenJS   │ <─│  Design  │
│    PPTX     │     │  Generator  │  │   Spec   │
└─────────────┘     └─────────────┘  └──────────┘
                          ▲
                          │
                   ┌──────────────┐
                   │  AI Vision   │
                   │   Analysis   │
                   └──────────────┘
```

## File Structure

```
pptx-template/
├── SKILL.md              # This skill documentation
├── scripts/
│   ├── template-to-images.py   # Convert PPTX to PNG
│   ├── generate-pptx.js        # Generate PPT from JSON + Spec
│   └── validate-layout.js      # Validate slide layouts
├── examples/
│   ├── template-design-spec.md # Example design spec
│   └── content.json           # Example content
└── README.md
```

## Slide Types

| Type | Description |
|------|-------------|
| `cover` | Dark background title slide |
| `section` | Dark section divider |
| `content` | Light content with bullets |
| `two-column` | Two column layout |
| `table` | Data table |
| `timeline` | Horizontal timeline |
| `cards` | Card grid layout |

## Design Spec Format

```markdown
# Template Design Specification

## Color Palette
- Primary: #1F4E79
- Secondary: #4472C4
- Accent: #C00000
- Background Dark: #1A1A2E
- Background Light: #FFFFFF
- Text Dark: #333333
- Text Light: #FFFFFF

## Typography
- Title: Microsoft YaHei, 40pt, bold
- Subtitle: Microsoft YaHei, 24pt
- Body: Microsoft YaHei, 16pt

## Spacing Rules
- Page margin: 0.5"
- Title to content: 0.3"
```

## Tips

1. **Extract colors precisely**: Use exact hex codes from template
2. **Match fonts**: Use the same font family as template
3. **Follow spacing**: Maintain consistent margins and gaps
4. **Test output**: Always preview generated PPT
5. **Iterate**: Refine design spec based on output

## Dependencies

- Python 3.x
- Node.js 16+
- pptxgenjs: `npm install pptxgenjs`
- Pillow: `pip install Pillow`
- LibreOffice (for PDF conversion)
- Poppler (for PDF to PNG)
