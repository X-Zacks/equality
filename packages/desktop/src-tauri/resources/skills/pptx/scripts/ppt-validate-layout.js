#!/usr/bin/env node
/**
 * PPT Layout Validator — Collision detection + font size check + bounds check
 *
 * Usage:
 *   node ppt-validate-layout.js <deckspec.json>
 *   node ppt-validate-layout.js <deckspec.json> --fix --output fixed.json
 *
 * DeckSpec JSON format:
 * {
 *   "layout": "LAYOUT_16x9",
 *   "slides": [
 *     {
 *       "slideNumber": 1,
 *       "objects": [
 *         { "id": "title", "type": "title", "x": 0.5, "y": 0.25, "w": 9.0, "h": 0.7, "fontSize": 36, "content": "Slide Title" },
 *         { "id": "body",  "type": "text",  "x": 0.5, "y": 1.2,  "w": 9.0, "h": 3.5, "fontSize": 16, "content": "Body text..." }
 *       ]
 *     }
 *   ]
 * }
 */

const fs = require("fs");

// ── Slide Dimensions ──
const LAYOUTS = {
  LAYOUT_16x9:  { w: 10,    h: 5.625 },
  LAYOUT_16x10: { w: 10,    h: 6.25  },
  LAYOUT_4x3:   { w: 10,    h: 7.5   },
  LAYOUT_WIDE:  { w: 13.33, h: 7.5   },
};
const DEFAULT_LAYOUT = "LAYOUT_16x9";
const MARGIN = 0.5;
const MIN_GAP = 0.3;

// ── Font Size Rules ──
const FONT_RULES = {
  title:       { min: 32, max: 48, label: "Slide title"     },
  subtitle:    { min: 16, max: 28, label: "Subtitle"        },
  text:        { min: 14, max: 22, label: "Body text"       },
  bullet_list: { min: 14, max: 20, label: "Bullet list"     },
  callout:     { min: 14, max: 24, label: "Callout"         },
  kpi:         { min: 36, max: 72, label: "KPI number"      },
  chart_label: { min: 10, max: 14, label: "Chart label"     },
  table:       { min: 11, max: 14, label: "Table text"      },
  footnote:    { min: 9,  max: 12, label: "Footnote/source" },
};

// ── AABB Collision Detection ──
function rectsOverlap(a, b, gap) {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

// ── Bounds Check ──
function checkBounds(obj, slideW, slideH) {
  const issues = [];
  if (obj.x < 0) issues.push(`x=${obj.x} < 0`);
  if (obj.y < 0) issues.push(`y=${obj.y} < 0`);
  if (obj.x + obj.w > slideW + 0.01) issues.push(`right edge ${(obj.x + obj.w).toFixed(2)} > ${slideW}`);
  if (obj.y + obj.h > slideH + 0.01) issues.push(`bottom edge ${(obj.y + obj.h).toFixed(2)} > ${slideH}`);
  if (obj.x < MARGIN - 0.01) issues.push(`x=${obj.x} inside margin (< ${MARGIN})`);
  if (obj.x + obj.w > slideW - MARGIN + 0.01) issues.push(`right ${(obj.x + obj.w).toFixed(2)} inside margin (> ${slideW - MARGIN})`);
  return issues;
}

// ── Font Size Check ──
function checkFontSize(obj) {
  const fontSize = obj.fontSize || (obj.style && obj.style.fontSize);
  if (!fontSize) return null;
  const type = obj.type || "text";
  const rule = FONT_RULES[type] || FONT_RULES.text;
  if (fontSize < rule.min) {
    return {
      code: "FONT_TOO_SMALL",
      current: fontSize,
      suggested: rule.min,
      message: `${rule.label} fontSize ${fontSize}pt < minimum ${rule.min}pt`,
    };
  }
  if (fontSize > rule.max) {
    return {
      code: "FONT_TOO_LARGE",
      current: fontSize,
      suggested: rule.max,
      message: `${rule.label} fontSize ${fontSize}pt > maximum ${rule.max}pt`,
    };
  }
  return null;
}

// ── Text Fill Ratio ──
function estimateFillRatio(text, w, h, fontSize, isChinese) {
  if (!text || !fontSize) return null;
  const ptToInch = 1 / 72;
  const charW = fontSize * ptToInch * (isChinese ? 0.95 : 0.55);
  const lineH = fontSize * ptToInch * 1.4;
  const usableW = w * 0.85;
  const usableH = h * 0.85;
  const charsPerLine = Math.max(Math.floor(usableW / charW), 1);
  const numLines = Math.ceil(text.length / charsPerLine);
  return (numLines * lineH) / usableH;
}

// ── Suggest Optimal Font Size ──
function suggestFontSize(text, w, h, type, isChinese) {
  const rule = FONT_RULES[type] || FONT_RULES.text;
  for (let fs = rule.max; fs >= rule.min; fs--) {
    const fill = estimateFillRatio(text, w, h, fs, isChinese);
    if (fill !== null && fill <= 1.0) return fs;
  }
  return rule.min;
}

// ── Fix: Push overlapping objects down ──
function fixSlideLayout(slide, slideW, slideH) {
  const fixes = [];
  const objs = slide.objects || [];
  const title = objs.find((o) => o.type === "title" || o.id === "title");
  const others = objs.filter((o) => o !== title);

  // Fix title position
  if (title) {
    if (title.y < 0.2 || title.y > 0.8) {
      fixes.push({ id: title.id, field: "y", from: title.y, to: 0.25 });
      title.y = 0.25;
    }
    title.x = Math.max(title.x, MARGIN);
    title.w = Math.min(title.w, slideW - MARGIN * 2);
    title.h = Math.max(title.h, 0.6);
  }

  // Flow layout: push down on collision
  const placed = title ? [title] : [];
  for (const obj of others) {
    // Ensure within horizontal bounds
    if (obj.x + obj.w > slideW - MARGIN) {
      obj.w = Math.min(obj.w, slideW - MARGIN * 2);
      obj.x = MARGIN;
    }
    // Check collision with placed objects
    let moved = false;
    for (const p of placed) {
      if (rectsOverlap(obj, p, MIN_GAP)) {
        const newY = parseFloat((p.y + p.h + MIN_GAP).toFixed(3));
        fixes.push({ id: obj.id, field: "y", from: obj.y, to: newY, reason: `collision with "${p.id}"` });
        obj.y = newY;
        moved = true;
      }
    }
    // Overflow check
    if (obj.y + obj.h > slideH) {
      fixes.push({ id: obj.id, field: "overflow", message: `bottom at ${(obj.y + obj.h).toFixed(2)}, slide height ${slideH}. Split slide recommended.` });
    }
    placed.push(obj);
  }

  // Fix font sizes
  for (const obj of objs) {
    const fontSize = obj.fontSize || (obj.style && obj.style.fontSize);
    if (!fontSize) continue;
    const type = obj.type || "text";
    const rule = FONT_RULES[type] || FONT_RULES.text;
    const content = typeof obj.content === "string" ? obj.content : "";
    const isChinese = /[\u4e00-\u9fff]/.test(content);

    if (fontSize < rule.min) {
      const suggested = content ? suggestFontSize(content, obj.w, obj.h, type, isChinese) : rule.min;
      fixes.push({ id: obj.id, field: "fontSize", from: fontSize, to: suggested });
      obj.fontSize = suggested;
    }
  }

  return fixes;
}

// ── Main Validate ──
function validateDeck(deck) {
  const layout = LAYOUTS[deck.layout || DEFAULT_LAYOUT] || LAYOUTS[DEFAULT_LAYOUT];
  const { w: slideW, h: slideH } = layout;
  const issues = [];

  for (const slide of deck.slides) {
    const objs = slide.objects || [];
    const sn = slide.slideNumber;

    // 1. Pairwise collision
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        if (rectsOverlap(objs[i], objs[j], MIN_GAP)) {
          issues.push({
            slideNumber: sn, severity: "error", code: "OVERLAP",
            message: `"${objs[i].id}" and "${objs[j].id}" overlap or gap < ${MIN_GAP}"`,
            a: { id: objs[i].id, rect: [objs[i].x, objs[i].y, objs[i].w, objs[i].h] },
            b: { id: objs[j].id, rect: [objs[j].x, objs[j].y, objs[j].w, objs[j].h] },
          });
        }
      }
    }

    // 2. Bounds
    for (const obj of objs) {
      const bounds = checkBounds(obj, slideW, slideH);
      if (bounds.length > 0) {
        issues.push({ slideNumber: sn, severity: "warning", code: "OUT_OF_BOUNDS", objectId: obj.id, message: bounds.join("; ") });
      }
    }

    // 3. Font size
    for (const obj of objs) {
      const fi = checkFontSize(obj);
      if (fi) {
        issues.push({ slideNumber: sn, severity: "warning", objectId: obj.id, ...fi });
      }
    }

    // 4. Fill ratio (warn if too empty)
    for (const obj of objs) {
      const fontSize = obj.fontSize || (obj.style && obj.style.fontSize);
      const content = typeof obj.content === "string" ? obj.content : "";
      if (!fontSize || !content || obj.type === "chart" || obj.type === "image") continue;
      const isChinese = /[\u4e00-\u9fff]/.test(content);
      const fill = estimateFillRatio(content, obj.w, obj.h, fontSize, isChinese);
      if (fill !== null && fill < 0.2 && obj.type !== "kpi" && obj.type !== "footnote") {
        const suggested = suggestFontSize(content, obj.w, obj.h, obj.type || "text", isChinese);
        issues.push({
          slideNumber: sn, severity: "info", code: "LOW_FILL_RATIO", objectId: obj.id,
          message: `Fill ratio ${(fill * 100).toFixed(0)}% is very low. Shape looks empty. Consider fontSize ${suggested}pt (current: ${fontSize}pt).`,
          suggestedFontSize: suggested,
        });
      }
    }

    // 5. Density
    if (objs.length > 8) {
      issues.push({ slideNumber: sn, severity: "warning", code: "TOO_MANY_OBJECTS", message: `${objs.length} objects (max recommended: 8). Consider splitting.` });
    }
  }

  return issues;
}

// ── CLI ──
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: node ppt-validate-layout.js <deckspec.json> [--fix] [--output fixed.json]");
  process.exit(1);
}

const inputPath = args[0];
const doFix = args.includes("--fix");
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

let deck;
try {
  deck = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
} catch (e) {
  console.error(`Error reading ${inputPath}: ${e.message}`);
  process.exit(1);
}

// Validate first
const issues = validateDeck(deck);

if (doFix) {
  const layout = LAYOUTS[deck.layout || DEFAULT_LAYOUT] || LAYOUTS[DEFAULT_LAYOUT];
  const allFixes = [];
  for (const slide of deck.slides) {
    const fixes = fixSlideLayout(slide, layout.w, layout.h);
    if (fixes.length > 0) allFixes.push({ slideNumber: slide.slideNumber, fixes });
  }
  // Re-validate after fix
  const postIssues = validateDeck(deck);

  const result = {
    status: postIssues.length === 0 ? "fixed" : "partially_fixed",
    fixesApplied: allFixes,
    remainingIssues: postIssues,
  };
  console.log(JSON.stringify(result, null, 2));

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(deck, null, 2));
    console.error(`Fixed DeckSpec written to ${outputPath}`);
  }
} else {
  const result = {
    status: issues.length === 0 ? "ok" : "issues_found",
    count: issues.length,
    issues,
  };
  console.log(JSON.stringify(result, null, 2));
}
