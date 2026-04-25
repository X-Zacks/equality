---
name: pptx
description: "Use this skill any time a .pptx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file (even if the extracted content will be used elsewhere, like in an email or summary); editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions \"deck,\" \"slides,\" \"presentation,\" or references a .pptx filename, regardless of what they plan to do with the content afterward. If a .pptx file needs to be opened, created, or touched, use this skill."
license: Proprietary. LICENSE.txt has complete terms
---

# PPTX Skill

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python -m markitdown presentation.pptx` |
| Edit or create from template | Read [editing.md](editing.md) |
| Create from scratch | Read [pptxgenjs.md](pptxgenjs.md) |

---

## Working Directory Rules (CRITICAL)

**All generated files go in the user's attachment directory, NOT the skill directory.**

- When user provides attachments like `[附件: C:\xxx\project\file.pptx]`, work in `C:\xxx\project\`
- Unpack templates, create scripts, generate output — all in the attachment directory
- The skill directory (where this SKILL.md lives) is **read-only** — only read scripts and docs from it, never write to it
- If user specifies an output path, use that; otherwise default to attachment directory

Example:
```
# ✅ CORRECT — work in attachment directory
python {SKILL_DIR}/scripts/office/unpack.py template.pptx C:\users\work\project\unpacked-template/

# ❌ WRONG — never unpack into skill directory
python {SKILL_DIR}/scripts/office/unpack.py template.pptx {SKILL_DIR}/unpacked-template/
```

---

## Reading Content

```bash
# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/
```

---

## Editing Workflow

**Read [editing.md](editing.md) for full details.**

1. Analyze template with `thumbnail.py`
2. Unpack → manipulate slides → edit content → clean → pack

---

## Creating from Scratch

**Read [pptxgenjs.md](pptxgenjs.md) for full details.**

Use when no template or reference presentation is available.

---

## Template + Source Document → PPT (Common Scenario)

When user provides a **template PPT** and a **source document** (Word, PDF, etc.):

### Step 1: Analyze Both Inputs

```bash
# Extract source document content
python -m markitdown source.docx

# Analyze template: visual layouts + placeholder text
python scripts/thumbnail.py template.pptx
python -m markitdown template.pptx
```

Review thumbnails to understand available layouts. Identify:
- Which template slides are **title/section dividers** vs **content slides**
- Color palette, fonts, and visual style
- Placeholder positions and sizes (these define your coordinate constraints)

### Step 2: Content Planning (Before Any Code)

Structure the source document content into a **slide outline**. Follow these rules:

1. **Page budget**: Respect user's page limit. If "不超过10页", plan exactly 8-10 slides.
2. **Executive summary structure** (for leadership audiences):
   - Slide 1: Title + one-line thesis
   - Slide 2: Executive Summary / Key Takeaways (3-4 bullets max)
   - Slides 3-7: One theme per slide, headline = the insight, body = supporting evidence
   - Slide 8-9: Recommendations / Next Steps
   - Slide 10: Appendix or Thank You
3. **Content density**: Max 5-6 text blocks per slide. If more, split into two slides.
4. **Headline-driven**: Every slide title should state the **conclusion**, not the topic.
   - ❌ "Q3 Financial Results"
   - ✅ "Q3 Revenue Grew 23% Driven by Enterprise Segment"

### Step 3: Choose Rendering Path

**⚠️ DEFAULT: Use the template editing path.** Only fall back to "create from scratch" when the template is truly unusable (corrupted, wrong aspect ratio, or user explicitly says "just match the colors").

```
Does the template have logos, footers, branded backgrounds, or slide layouts?
  → YES (almost always) → Template Editing path [editing.md](editing.md)
  → NO (blank/minimal template, or user says "just reference the style") → Create from scratch [pptxgenjs.md](pptxgenjs.md)
```

| Scenario | Path | Guide |
|----------|------|-------|
| Template has logos/footers/branded elements | **Template editing** — MUST use this to preserve assets | [editing.md](editing.md) |
| Template has good content layouts to fill | **Template editing** — duplicate + fill content | [editing.md](editing.md) |
| Template is style reference only (no logos/footers worth keeping) | **Create from scratch** matching template style | [pptxgenjs.md](pptxgenjs.md) |
| Need more slides than template provides | **Template editing + new slides from layouts** — see "Hybrid Workflow" in [editing.md](editing.md) | Both guides |

**Why template editing is the default:** When you create from scratch with PptxGenJS, you lose ALL template assets — logos, footer bars, background patterns, slide master decorations, page numbers, company branding. These are embedded in the template's slide masters and layouts, and there is NO way to replicate them programmatically without using the template file itself.

### Step 4: Template Asset Analysis (CRITICAL)

Before writing any code, understand what the template provides:

```bash
# Unpack template
python scripts/office/unpack.py template.pptx unpacked-tpl/
```

**Inspect slide masters** (`ppt/slideMasters/slideMaster1.xml`):
- Logos (usually `<p:pic>` elements with image references)
- Footer bars, decorative shapes, background fills
- Company name text, copyright notices

**Inspect slide layouts** (`ppt/slideLayouts/`):
- Each layout inherits from a slide master
- Layouts define placeholder positions (title, body, content, picture)
- List available layouts and their purpose:

```bash
# Quick way to see all layouts and their types
python -m markitdown template.pptx
python scripts/thumbnail.py template.pptx
```

**What to extract from the template:**

| Asset | Where it lives | How to use |
|-------|----------------|------------|
| Logo | slideMaster or slideLayout (as `<p:pic>`) | Inherited automatically when using template layouts |
| Footer text/bar | slideMaster (bottom shapes) | Inherited automatically |
| Background | slideMaster `<p:bg>` or slideLayout `<p:bg>` | Inherited automatically |
| Color scheme | `ppt/theme/theme1.xml` | Inherited automatically |
| Fonts | theme1.xml `<a:majorFont>` / `<a:minorFont>` | Inherited automatically |
| Page numbers | slideMaster footer placeholders | Inherited automatically |
| Placeholder positions | slideLayout `<p:sp>` with `<p:ph>` | Use as coordinate guides |

**Key insight:** Everything in the "Inherited automatically" column is FREE when you use the template editing path — and LOST when you create from scratch.

### Step 4b: Template Style Extraction (ONLY for "Create from Scratch" path)

Only use this when you've decided NOT to use the template directly:

```bash
python scripts/office/unpack.py template.pptx unpacked-tpl/
```

From the XML, extract:
- **Background colors** (solid or gradient)
- **Title font**, size, color, position
- **Body font**, size, color
- **Accent colors** (shapes, lines, highlights)
- **Margin/padding** patterns

Use these exact values in your PptxGenJS render script.

**⚠️ You will NOT get logos, footers, or branded backgrounds this way.** If those matter, go back to the template editing path.

### Step 5: Render + Validate + QA

See sections below for layout validation and visual QA.

---

## Design Ideas

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Consider ideas from this list for each slide.

### Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
- **Dominance over equality**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Dark/light contrast**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it — rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

### Color Palettes

Choose colors that match your topic — don't default to generic blue. Use these palettes as inspiration:

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Midnight Executive** | `1E2761` (navy) | `CADCFC` (ice blue) | `FFFFFF` (white) |
| **Forest & Moss** | `2C5F2D` (forest) | `97BC62` (moss) | `F5F5F5` (cream) |
| **Coral Energy** | `F96167` (coral) | `F9E795` (gold) | `2F3C7E` (navy) |
| **Warm Terracotta** | `B85042` (terracotta) | `E7E8D1` (sand) | `A7BEAE` (sage) |
| **Ocean Gradient** | `065A82` (deep blue) | `1C7293` (teal) | `21295C` (midnight) |
| **Charcoal Minimal** | `36454F` (charcoal) | `F2F2F2` (off-white) | `212121` (black) |
| **Teal Trust** | `028090` (teal) | `00A896` (seafoam) | `02C39A` (mint) |
| **Berry & Cream** | `6D2E46` (berry) | `A26769` (dusty rose) | `ECE2D0` (cream) |
| **Sage Calm** | `84B59F` (sage) | `69A297` (eucalyptus) | `50808E` (slate) |
| **Cherry Bold** | `990011` (cherry) | `FCF6F5` (off-white) | `2F3C7E` (navy) |

### For Each Slide

**Every slide needs a visual element** — image, chart, icon, or shape. Text-only slides are forgettable.

**Layout options:**
- Two-column (text left, illustration on right)
- Icon + text rows (icon in colored circle, bold header, description below)
- 2x2 or 2x3 grid (image on one side, grid of content blocks on other)
- Half-bleed image (full left or right side) with content overlay

**Data display:**
- Large stat callouts (big numbers 60-72pt with small labels below)
- Comparison columns (before/after, pros/cons, side-by-side options)
- Timeline or process flow (numbered steps, arrows)

**Visual polish:**
- Icons in small colored circles next to section headers
- Italic accent text for key stats or taglines

### Typography

**Choose an interesting font pairing** — don't default to Arial. Pick a header font with personality and pair it with a clean body font.

| Header Font | Body Font |
|-------------|-----------|
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | 14-16pt |
| Captions | 10-12pt muted |

### Spacing

- 0.5" minimum margins
- 0.3-0.5" between content blocks
- Leave breathing room—don't fill every inch

### Layout Coordinate Rules (CRITICAL — Prevents Overlapping Elements)

**Slide dimensions** (LAYOUT_16x9): 10" × 5.625"

**Safe content area**: x ∈ [0.5, 9.5], y ∈ [0.5, 5.125]

**Standard zones** (use as starting point, adjust per layout):

| Zone | x | y | w | h |
|------|---|---|---|---|
| Title | 0.5 | 0.25 | 9.0 | 0.7 |
| Content start | 0.5 | 1.2 | — | — |
| Footer/source | 0.5 | 5.2 | 9.0 | 0.3 |

**Spacing rules**:
- Vertical gap between adjacent elements: **≥ 0.3"**
- Horizontal gap between side-by-side elements: **≥ 0.3"**
- Page edge margin: **≥ 0.5"**

**Coordinate calculation** — calculate sequentially, don't guess:
```
element_N.y = element_(N-1).y + element_(N-1).h + 0.3
element_N.x + element_N.w ≤ 9.5
element_N.y + element_N.h ≤ 5.125
```

If the last element overflows (y + h > 5.125), **split into two slides** — do NOT shrink fonts or remove gaps.

**Two-column layout**:
```
Left column:  x=0.5,  w=4.35
Right column: x=5.15, w=4.35
(gap = 0.3")
```

**Three-column layout**:
```
Col 1: x=0.5,  w=2.8
Col 2: x=3.6,  w=2.8
Col 3: x=6.7,  w=2.8
(gap = 0.3")
```

### Font Size Rules (CRITICAL — Prevents Tiny Text in Shapes)

| Element Type | Min | Recommended | Max |
|-------------|-----|-------------|-----|
| Slide title | 32pt | 36-40pt | 48pt |
| Subtitle | 16pt | 20-24pt | 28pt |
| Body text | **14pt** | 16-18pt | 22pt |
| Bullet list | **14pt** | 15-16pt | 20pt |
| KPI / big number | 36pt | 48-60pt | 72pt |
| Callout text | 14pt | 16-20pt | 24pt |
| Chart/table label | 10pt | 12pt | 14pt |
| Footnote/source | 9pt | 10pt | 12pt |

**⚠️ NEVER use less than 14pt for body text or bullets.** If text doesn't fit, reduce the text or split slides — do not shrink the font.

**Shape fill ratio** — when text occupies less than 30% of a shape's area, the shape looks empty. Solutions:
1. **Increase font size** until fill ratio reaches 50-70%
2. **Reduce shape size** to better fit the content
3. **Add more content** (subtitle, description, icon)

**Chinese text**: Use 1-2pt larger than English recommendations (Chinese characters need more space to be legible).

### Avoid (Common Mistakes)

- **Don't repeat the same layout** — vary columns, cards, and callouts across slides
- **Don't center body text** — left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** — titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** — pick colors that reflect the specific topic
- **Don't mix spacing randomly** — choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** — commit fully or keep it simple throughout
- **Don't create text-only slides** — add images, icons, charts, or visual elements; avoid plain title + bullets
- **Don't forget text box padding** — when aligning lines or shapes with text edges, set `margin: 0` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** — icons AND text need strong contrast against the background; avoid light text on light backgrounds or dark text on dark backgrounds
- **NEVER use accent lines under titles** — these are a hallmark of AI-generated slides; use whitespace or background color instead

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

```bash
python -m markitdown output.pptx
```

Check for missing content, typos, wrong order.

**When using templates, check for leftover placeholder text:**

```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
```

If grep returns results, fix them before declaring success.

### Layout Validation (Run Before Visual QA)

Before converting to images, validate layout programmatically. Extract element coordinates from your render script into a DeckSpec JSON, then run:

```bash
node scripts/ppt-validate-layout.js deckspec.json
```

The script checks for:
- **OVERLAP**: Elements colliding or gap < 0.3"
- **OUT_OF_BOUNDS**: Elements exceeding slide boundaries or margins
- **FONT_TOO_SMALL**: Font sizes below minimum for element type
- **LOW_FILL_RATIO**: Text occupying < 20% of shape area (shape looks empty)
- **TOO_MANY_OBJECTS**: More than 8 elements on one slide

To auto-fix detected issues:

```bash
node scripts/ppt-validate-layout.js deckspec.json --fix --output fixed.json
```

Fix any reported issues in your render script before proceeding to visual QA.

**DeckSpec JSON format** (extract from your render script):
```json
{
  "layout": "LAYOUT_16x9",
  "slides": [
    {
      "slideNumber": 1,
      "objects": [
        { "id": "title", "type": "title", "x": 0.5, "y": 0.25, "w": 9.0, "h": 0.7, "fontSize": 36, "content": "标题文字" },
        { "id": "body",  "type": "text",  "x": 0.5, "y": 1.2,  "w": 9.0, "h": 3.5, "fontSize": 16, "content": "正文内容..." }
      ]
    }
  ]
}
```

### Visual QA

**⚠️ USE SUBAGENTS** — even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.

Convert slides to images (see [Converting to Images](#converting-to-images)), then use this prompt:

```
Visually inspect these slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. /path/to/slide-01.jpg (Expected: [brief description])
2. /path/to/slide-02.jpg (Expected: [brief description])

Report ALL issues found, including minor ones.
```

### Verification Loop

1. Generate slides → Convert to images → Inspect
2. **List issues found** (if none found, look again more critically)
3. Fix issues
4. **Re-verify affected slides** — one fix often creates another problem
5. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---

## Converting to Images

Convert presentations to individual slide images for visual inspection:

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

This creates `slide-01.jpg`, `slide-02.jpg`, etc.

To re-render specific slides after fixes:

```bash
pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
```

---

## Dependencies

- `pip install "markitdown[pptx]"` - text extraction
- `pip install Pillow` - thumbnail grids
- `npm install -g pptxgenjs` - creating from scratch
- LibreOffice (`soffice`) - PDF conversion (auto-configured for sandboxed environments via `scripts/office/soffice.py`)
- Poppler (`pdftoppm`) - PDF to images
