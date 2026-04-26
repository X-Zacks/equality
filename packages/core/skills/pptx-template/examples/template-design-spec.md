# Template Design Specification

Generated from: lenovo-2023-ppt-template.pptx

## Color Palette

| Name | Hex Code | Usage |
|-------|----------|-------|
| Primary | 1F4E79 | Titles, headers |
| Secondary | 4472C4 | Accents, links |
| Accent | C00000 | Highlights, alerts |
| Background Dark | 1A1A2E | Cover/section slides |
| Background Light | FFFFFF | Content slides |
| Text Dark | 333333 | Body text |
| Text Light | FFFFFF | Text on dark |
| Gray | D6DCE5 | Table alternating rows |

## Typography

| Element | Font | Size | Style |
|---------|------|------|--------|
| Title | Microsoft YaHei | 40pt | Bold |
| Subtitle | Microsoft YaHei | 24pt | Normal |
| Body | Microsoft YaHei | 16pt | Normal |
| Caption | Microsoft YaHei | 12pt | Normal |
| Table Header | Microsoft YaHei | 14pt | Bold |
| Table Body | Microsoft YaHei | 14pt | Normal |

## Layout Patterns

### 1. Cover Slide (Dark Background)
- Background: #1A1A2E (dark blue-black)
- Title: centered horizontally and vertically
- Font: 40pt, bold, white
- Subtitle: 24pt, white, below title
- Logo: bottom-left corner
- No page number

### 2. Section Header (Dark Background)
- Background: gradient or solid dark
- Title: large, centered
- Optional subtitle: smaller, accent color
- Minimal content

### 3. Content Slide (Light Background)
- Background: #FFFFFF
- Title: top-left, 36pt, primary color
- Content: left-aligned bullets
- Page number: bottom-right

### 4. Comparison Table
- Header row: primary color background, white text, bold
- Data rows: alternating white and gray
- Borders: light gray, 0.5pt

### 5. Timeline / Process
- Horizontal line connecting phases
- Phase circles on timeline
- Phase cards below timeline
- Color-coded phases

### 6. Cards Grid
- 2-3 columns of cards
- Card background: light gray
- Left accent bar: secondary color
- Card title: bold, primary color

## Spacing Rules

| Element | Value |
|---------|-------|
| Page margin | 0.5" |
| Title to content | 0.3" |
| Between paragraphs | 0.2" |
| Table cell padding | 0.1" |
| Card internal padding | 0.2" |

## Visual Elements

- **Logo**: Positioned bottom-left, 0.8" height
- **Page Number**: Bottom-right, 12pt
- **Footer**: "Company Name Internal. All rights reserved."

## Slide Master Elements

Inherited from template:
- Logo placeholder
- Footer bar
- Page number placeholder
- Background decorations

## Customization Notes

When generating with PptxGenJS:
1. Use exact colors from palette
2. Match font families and sizes
3. Follow spacing rules strictly
4. Include footer text
5. Position logo consistently
