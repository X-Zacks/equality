#!/usr/bin/env node
/**
 * Generate PowerPoint from content JSON and design specification MD.
 * 
 * Usage:
 *   node generate-pptx.js content.json design-spec.md output.pptx
 * 
 * Content JSON format:
 * {
 *   "title": "Presentation Title",
 *   "slides": [
 *     { "type": "cover", "title": "...", "subtitle": "..." },
 *     { "type": "content", "title": "...", "bullets": [...] },
 *     { "type": "table", "title": "...", "headers": [...], "rows": [...] },
 *     { "type": "timeline", "title": "...", "phases": [...] },
 *     { "type": "cards", "title": "...", "cards": [...] }
 *   ]
 * }
 */

const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

// Default design spec
const DEFAULT_SPEC = {
  colors: {
    primary: "1F4E79",
    secondary: "4472C4",
    accent: "C00000",
    bg_dark: "1A1A2E",
    bg_light: "FFFFFF",
    text_dark: "333333",
    text_light: "FFFFFF",
    gray: "D6DCE5"
  },
  fonts: {
    title: { name: "Microsoft YaHei", size: 40, bold: true },
    subtitle: { name: "Microsoft YaHei", size: 24, bold: false },
    body: { name: "Microsoft YaHei", size: 16, bold: false },
    caption: { name: "Microsoft YaHei", size: 12, bold: false }
  },
  spacing: {
    margin: 0.5,
    titleGap: 0.3,
    elementGap: 0.2
  }
};

/**
 * Parse design spec from markdown
 */
function parseDesignSpec(mdContent) {
  const spec = JSON.parse(JSON.stringify(DEFAULT_SPEC)); // Deep clone
  
  // Parse colors section
  const colorMatch = mdContent.match(/## Color[\s\S]*?(?=##|$)/i);
  if (colorMatch) {
    const colorSection = colorMatch[0];
    const colorMap = {
      "primary": "primary",
      "secondary": "secondary", 
      "accent": "accent",
      "dark": "bg_dark",
      "light": "bg_light",
      "background": "bg_light"
    };
    
    for (const [key, value] of Object.entries(colorMap)) {
      const regex = new RegExp(`${key}[\\s:-]+([A-Fa-f0-9]{6})`, 'i');
      const match = colorSection.match(regex);
      if (match) {
        spec.colors[value] = match[1];
      }
    }
  }
  
  // Parse fonts section
  const fontMatch = mdContent.match(/## Typography[\s\S]*?(?=##|$)/i);
  if (fontMatch) {
    const fontSection = fontMatch[0];
    
    const fontMap = {
      "title": "title",
      "subtitle": "subtitle",
      "body": "body",
      "caption": "caption"
    };
    
    for (const [key, value] of Object.entries(fontMap)) {
      const regex = new RegExp(`${key}[\\s:-]+([^,\\n]+),?\\s*(\\d+)\\s*pt?`, 'i');
      const match = fontSection.match(regex);
      if (match) {
        spec.fonts[value] = {
          name: match[1].trim(),
          size: parseInt(match[2]),
          bold: key === "title"
        };
      }
    }
  }
  
  // Parse spacing section
  const spacingMatch = mdContent.match(/## Spacing[\s\S]*?(?=##|$)/i);
  if (spacingMatch) {
    const spacingSection = spacingMatch[0];
    
    const spacingMap = {
      "margin": "margin",
      "title.*gap": "titleGap",
      "element.*gap": "elementGap"
    };
    
    for (const [key, value] of Object.entries(spacingMap)) {
      const regex = new RegExp(`${key}[\\s:-]+([\\d.]+)`, 'i');
      const match = spacingSection.match(regex);
      if (match) {
        spec.spacing[value] = parseFloat(match[1]);
      }
    }
  }
  
  return spec;
}

/**
 * Create a slide based on type
 */
function createSlide(pres, slideData, spec) {
  const slide = pres.addSlide();
  const { type } = slideData;
  
  switch (type) {
    case "cover":
      createCoverSlide(slide, slideData, spec);
      break;
    case "section":
      createSectionSlide(slide, slideData, spec);
      break;
    case "content":
      createContentSlide(slide, slideData, spec);
      break;
    case "two-column":
      createTwoColumnSlide(slide, slideData, spec);
      break;
    case "table":
      createTableSlide(slide, slideData, spec);
      break;
    case "timeline":
      createTimelineSlide(slide, slideData, spec);
      break;
    case "cards":
      createCardsSlide(slide, slideData, spec);
      break;
    default:
      createContentSlide(slide, slideData, spec);
  }
  
  return slide;
}

/**
 * Cover slide with dark background
 */
function createCoverSlide(slide, data, spec) {
  const { title, subtitle } = data;
  
  // Dark background
  slide.background = { color: spec.colors.bg_dark };
  
  const margin = spec.spacing.margin;
  const slideWidth = 10;
  const slideHeight = 5.625;
  
  // Title
  slide.addText(title, {
    x: margin,
    y: slideHeight / 2 - 0.8,
    w: slideWidth - margin * 2,
    h: 1,
    fontSize: spec.fonts.title.size,
    fontFace: spec.fonts.title.name,
    color: spec.colors.text_light,
    bold: spec.fonts.title.bold,
    align: "center",
    valign: "middle"
  });
  
  // Subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: margin,
      y: slideHeight / 2 + 0.3,
      w: slideWidth - margin * 2,
      h: 0.6,
      fontSize: spec.fonts.subtitle.size,
      fontFace: spec.fonts.subtitle.name,
      color: spec.colors.text_light,
      align: "center",
      valign: "middle"
    });
  }
}

/**
 * Section divider slide
 */
function createSectionSlide(slide, data, spec) {
  const { title, subtitle } = data;
  
  // Dark background
  slide.background = { color: spec.colors.bg_dark };
  
  const margin = spec.spacing.margin;
  const slideWidth = 10;
  const slideHeight = 5.625;
  
  // Section title
  slide.addText(title, {
    x: margin,
    y: slideHeight / 2 - 0.5,
    w: slideWidth - margin * 2,
    h: 1,
    fontSize: 48,
    fontFace: spec.fonts.title.name,
    color: spec.colors.text_light,
    bold: true,
    align: "center",
    valign: "middle"
  });
  
  // Optional subtitle
  if (subtitle) {
    slide.addText(subtitle, {
      x: margin,
      y: slideHeight / 2 + 0.6,
      w: slideWidth - margin * 2,
      h: 0.5,
      fontSize: spec.fonts.subtitle.size,
      fontFace: spec.fonts.subtitle.name,
      color: spec.colors.secondary,
      align: "center"
    });
  }
}

/**
 * Standard content slide with light background
 */
function createContentSlide(slide, data, spec) {
  const { title, bullets, content } = data;
  
  // Light background
  slide.background = { color: spec.colors.bg_light };
  
  const margin = spec.spacing.margin;
  const titleGap = spec.spacing.titleGap;
  
  // Title
  slide.addText(title, {
    x: margin,
    y: margin,
    w: 9,
    h: 0.7,
    fontSize: spec.fonts.title.size,
    fontFace: spec.fonts.title.name,
    color: spec.colors.primary,
    bold: spec.fonts.title.bold
  });
  
  // Bullets
  if (bullets && bullets.length > 0) {
    const bulletItems = bullets.map((text, i) => ({
      text: text,
      options: {
        bullet: true,
        breakLine: i < bullets.length - 1
      }
    }));
    
    slide.addText(bulletItems, {
      x: margin,
      y: margin + 0.7 + titleGap,
      w: 9,
      h: 3.5,
      fontSize: spec.fonts.body.size,
      fontFace: spec.fonts.body.name,
      color: spec.colors.text_dark,
      paraSpaceAfter: 8
    });
  }
  
  // Or rich content
  if (content) {
    slide.addText(content, {
      x: margin,
      y: margin + 0.7 + titleGap,
      w: 9,
      h: 3.5,
      fontSize: spec.fonts.body.size,
      fontFace: spec.fonts.body.name,
      color: spec.colors.text_dark
    });
  }
}

/**
 * Two column slide
 */
function createTwoColumnSlide(slide, data, spec) {
  const { title, left, right } = data;
  
  slide.background = { color: spec.colors.bg_light };
  
  const margin = spec.spacing.margin;
  const colWidth = 4.25;
  const colGap = 0.5;
  
  // Title
  slide.addText(title, {
    x: margin,
    y: margin,
    w: 9,
    h: 0.7,
    fontSize: spec.fonts.title.size,
    fontFace: spec.fonts.title.name,
    color: spec.colors.primary,
    bold: true
  });
  
  // Left column
  if (left) {
    slide.addText(left.title || "", {
      x: margin,
      y: margin + 0.8,
      w: colWidth,
      h: 0.4,
      fontSize: spec.fonts.body.size + 2,
      fontFace: spec.fonts.body.name,
      color: spec.colors.secondary,
      bold: true
    });
    
    if (left.bullets) {
      const items = left.bullets.map((t, i) => ({
        text: t,
        options: { bullet: true, breakLine: i < left.bullets.length - 1 }
      }));
      slide.addText(items, {
        x: margin,
        y: margin + 1.3,
        w: colWidth,
        h: 3,
        fontSize: spec.fonts.body.size,
        fontFace: spec.fonts.body.name,
        color: spec.colors.text_dark
      });
    }
  }
  
  // Right column
  if (right) {
    slide.addText(right.title || "", {
      x: margin + colWidth + colGap,
      y: margin + 0.8,
      w: colWidth,
      h: 0.4,
      fontSize: spec.fonts.body.size + 2,
      fontFace: spec.fonts.body.name,
      color: spec.colors.secondary,
      bold: true
    });
    
    if (right.bullets) {
      const items = right.bullets.map((t, i) => ({
        text: t,
        options: { bullet: true, breakLine: i < right.bullets.length - 1 }
      }));
      slide.addText(items, {
        x: margin + colWidth + colGap,
        y: margin + 1.3,
        w: colWidth,
        h: 3,
        fontSize: spec.fonts.body.size,
        fontFace: spec.fonts.body.name,
        color: spec.colors.text_dark
      });
    }
  }
}

/**
 * Table slide
 */
function createTableSlide(slide, data, spec) {
  const { title, headers, rows, options } = data;
  
  slide.background = { color: spec.colors.bg_light };
  
  const margin = spec.spacing.margin;
  
  // Title
  slide.addText(title, {
    x: margin,
    y: margin,
    w: 9,
    h: 0.7,
    fontSize: spec.fonts.title.size,
    fontFace: spec.fonts.title.name,
    color: spec.colors.primary,
    bold: true
  });
  
  // Table data
  const tableData = [
    // Header row
    headers.map(h => ({
      text: h,
      options: {
        fill: { color: spec.colors.primary },
        color: spec.colors.text_light,
        bold: true,
        align: "center"
      }
    })),
    // Data rows
    ...rows.map((row, rowIdx) => 
      row.map(cell => ({
        text: cell,
        options: {
          fill: { color: rowIdx % 2 === 0 ? spec.colors.bg_light : spec.colors.gray },
          color: spec.colors.text_dark,
          align: "left"
        }
      }))
    )
  ];
  
  slide.addTable(tableData, {
    x: margin,
    y: margin + 0.9,
    w: 9,
    fontSize: spec.fonts.body.size,
    fontFace: spec.fonts.body.name,
    border: { pt: 0.5, color: "CCCCCC" },
    colW: options?.colWidths || headers.map(() => 9 / headers.length)
  });
}

/**
 * Timeline slide
 */
function createTimelineSlide(slide, data, spec) {
  const { title, phases } = data;
  
  slide.background = { color: spec.colors.bg_light };
  
  const margin = spec.spacing.margin;
  const phaseWidth = 2.8;
  const phaseGap = 0.3;
  
  // Title
  slide.addText(title, {
    x: margin,
    y: margin,
    w: 9,
    h: 0.7,
    fontSize: spec.fonts.title.size,
    fontFace: spec.fonts.title.name,
    color: spec.colors.primary,
    bold: true
  });
  
  // Timeline line
  slide.addShape("rect", {
    x: margin + 0.5,
    y: margin + 2.0,
    w: 9 - margin * 2 - 1,
    h: 0.05,
    fill: { color: spec.colors.secondary }
  });
  
  // Phases
  phases.forEach((phase, idx) => {
    const x = margin + idx * (phaseWidth + phaseGap);
    
    // Phase circle
    slide.addShape("ellipse", {
      x: x + phaseWidth / 2 - 0.15,
      y: margin + 1.85,
      w: 0.3,
      h: 0.3,
      fill: { color: spec.colors.secondary }
    });
    
    // Phase card
    slide.addShape("rect", {
      x: x,
      y: margin + 2.3,
      w: phaseWidth,
      h: 2.2,
      fill: { color: "F5F5F5" },
      line: { color: spec.colors.secondary, width: 1 }
    });
    
    // Phase title
    slide.addText(phase.title, {
      x: x + 0.1,
      y: margin + 2.4,
      w: phaseWidth - 0.2,
      h: 0.4,
      fontSize: spec.fonts.body.size + 2,
      fontFace: spec.fonts.body.name,
      color: spec.colors.primary,
      bold: true
    });
    
    // Phase date
    slide.addText(phase.date, {
      x: x + 0.1,
      y: margin + 2.8,
      w: phaseWidth - 0.2,
      h: 0.3,
      fontSize: spec.fonts.caption.size,
      fontFace: spec.fonts.caption.name,
      color: spec.colors.secondary
    });
    
    // Phase items
    if (phase.items) {
      const items = phase.items.map((t, i) => ({
        text: t,
        options: { bullet: true, breakLine: i < phase.items.length - 1 }
      }));
      slide.addText(items, {
        x: x + 0.1,
        y: margin + 3.2,
        w: phaseWidth - 0.2,
        h: 1.2,
        fontSize: spec.fonts.caption.size,
        fontFace: spec.fonts.caption.name,
        color: spec.colors.text_dark
      });
    }
  });
}

/**
 * Cards slide
 */
function createCardsSlide(slide, data, spec) {
  const { title, cards, columns } = data;
  
  slide.background = { color: spec.colors.bg_light };
  
  const margin = spec.spacing.margin;
  const cols = columns || Math.min(3, cards.length);
  const cardWidth = (9 - margin * 2 - (cols - 1) * 0.3) / cols;
  const cardHeight = 2.5;
  
  // Title
  slide.addText(title, {
    x: margin,
    y: margin,
    w: 9,
    h: 0.7,
    fontSize: spec.fonts.title.size,
    fontFace: spec.fonts.title.name,
    color: spec.colors.primary,
    bold: true
  });
  
  // Cards
  cards.forEach((card, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = margin + col * (cardWidth + 0.3);
    const y = margin + 0.9 + row * (cardHeight + 0.3);
    
    // Card background
    slide.addShape("rect", {
      x: x,
      y: y,
      w: cardWidth,
      h: cardHeight,
      fill: { color: "F8F8F8" },
      line: { color: spec.colors.gray, width: 0.5 }
    });
    
    // Card accent bar
    slide.addShape("rect", {
      x: x,
      y: y,
      w: 0.08,
      h: cardHeight,
      fill: { color: spec.colors.secondary }
    });
    
    // Card title
    slide.addText(card.title, {
      x: x + 0.2,
      y: y + 0.15,
      w: cardWidth - 0.3,
      h: 0.4,
      fontSize: spec.fonts.body.size + 2,
      fontFace: spec.fonts.body.name,
      color: spec.colors.primary,
      bold: true
    });
    
    // Card content
    if (card.content) {
      slide.addText(card.content, {
        x: x + 0.2,
        y: y + 0.6,
        w: cardWidth - 0.3,
        h: cardHeight - 0.8,
        fontSize: spec.fonts.body.size,
        fontFace: spec.fonts.body.name,
        color: spec.colors.text_dark
      });
    }
    
    if (card.bullets) {
      const items = card.bullets.map((t, i) => ({
        text: t,
        options: { bullet: true, breakLine: i < card.bullets.length - 1 }
      }));
      slide.addText(items, {
        x: x + 0.2,
        y: y + 0.6,
        w: cardWidth - 0.3,
        h: cardHeight - 0.8,
        fontSize: spec.fonts.body.size,
        fontFace: spec.fonts.body.name,
        color: spec.colors.text_dark
      });
    }
  });
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error("Usage: node generate-pptx.js content.json design-spec.md output.pptx");
    process.exit(1);
  }
  
  const [contentPath, specPath, outputPath] = args;
  
  // Read content
  let content;
  try {
    content = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
  } catch (e) {
    console.error(`Error reading content file: ${e.message}`);
    process.exit(1);
  }
  
  // Read design spec
  let spec = DEFAULT_SPEC;
  if (fs.existsSync(specPath)) {
    const specContent = fs.readFileSync(specPath, "utf-8");
    spec = parseDesignSpec(specContent);
    console.log("Loaded design spec from:", specPath);
  } else {
    console.log("Using default design spec");
  }
  
  // Create presentation
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = content.title || "Generated Presentation";
  pres.author = "PptxGenJS";
  
  // Create slides
  for (const slideData of content.slides) {
    createSlide(pres, slideData, spec);
  }
  
  // Write file
  pres.writeFile({ fileName: outputPath })
    .then(() => {
      console.log(`Created: ${outputPath}`);
      console.log(`Total slides: ${content.slides.length}`);
    })
    .catch(err => {
      console.error("Error writing file:", err);
      process.exit(1);
    });
}

main();
