#!/usr/bin/env node
/**
 * Validate slide layout for overlap and spacing issues.
 * 
 * Usage:
 *   node validate-layout.js slides.json
 *   node validate-layout.js slides.json --fix
 */

const fs = require("fs");

const RULES = {
  minGap: 0.3,      // Minimum gap between elements (inches)
  minMargin: 0.5,   // Minimum page margin (inches)
  minFontBody: 14,  // Minimum font size for body text
  minFontTitle: 32, // Minimum font size for titles
  maxFillRatio: 0.9, // Maximum fill ratio (text area / shape area)
  maxElements: 8     // Maximum elements per slide
};

const SLIDE_SIZE = { width: 10, height: 5.625 };

function validateSlide(slide, slideNumber) {
  const issues = [];
  
  // Check element count
  if (slide.objects && slide.objects.length > RULES.maxElements) {
    issues.push({
      slide: slideNumber,
      type: "warning",
      code: "TOO_MANY_ELEMENTS",
      message: `${slide.objects.length} elements found (max: ${RULES.maxElements})`,
      suggestion: "Consider splitting content into multiple slides"
    });
  }
  
  // Check for overlaps
  if (slide.objects && slide.objects.length >= 2) {
    for (let i = 0; i < slide.objects.length; i++) {
      for (let j = i + 1; j < slide.objects.length; j++) {
        const a = slide.objects[i];
        const b = slide.objects[j];
        
        // Check for overlap
        const overlap = checkOverlap(a, b);
        if (overlap) {
          issues.push({
            slide: slideNumber,
            type: "error",
            code: "OVERLAP",
            message: `"${a.id}" overlaps with "${b.id}"`,
            element1: a,
            element2: b
          });
        }
        
        // Check for gap
        const gap = checkGap(a, b);
        if (gap !== null && gap < RULES.minGap) {
          issues.push({
            slide: slideNumber,
            type: "warning",
            code: "TIGHT_GAP",
            message: `Gap between "${a.id}" and "${b.id}" is ${gap.toFixed(2)}" (min: ${RULES.minGap}")`,
            gap: gap
          });
        }
      }
    }
  }
  
  // Check margins
  if (slide.objects) {
    for (const obj of slide.objects) {
      if (obj.x < RULES.minMargin) {
        issues.push({
          slide: slideNumber,
          type: "warning",
          code: "MARGIN_VIOLATION",
          message: `"${obj.id}" violates left margin (${obj.x.toFixed(2)}" < ${RULES.minMargin}")`,
          element: obj
        });
      }
      
      if (obj.x + obj.w > SLIDE_SIZE.width - RULES.minMargin) {
        issues.push({
          slide: slideNumber,
          type: "warning",
          code: "MARGIN_VIOLATION",
          message: `"${obj.id}" violates right margin`,
          element: obj
        });
      }
      
      if (obj.y < RULES.minMargin) {
        issues.push({
          slide: slideNumber,
          type: "warning",
          code: "MARGIN_VIOLATION",
          message: `"${obj.id}" violates top margin`,
          element: obj
        });
      }
      
      if (obj.y + obj.h > SLIDE_SIZE.height - RULES.minMargin) {
        issues.push({
          slide: slideNumber,
          type: "warning",
          code: "MARGIN_VIOLATION",
          message: `"${obj.id}" violates bottom margin`,
          element: obj
        });
      }
    }
  }
  
  // Check font sizes
  if (slide.objects) {
    for (const obj of slide.objects) {
      if (obj.type === "title" && obj.fontSize < RULES.minFontTitle) {
        issues.push({
          slide: slideNumber,
          type: "warning",
          code: "FONT_TOO_SMALL",
          message: `Title "${obj.id}" font size ${obj.fontSize}pt is below minimum ${RULES.minFontTitle}pt`,
          element: obj,
          suggestion: `Change to ${RULES.minFontTitle}pt or higher`
        });
      }
      
      if (obj.type === "body" && obj.fontSize < RULES.minFontBody) {
        issues.push({
          slide: slideNumber,
          type: "warning",
          code: "FONT_TOO_SMALL",
          message: `Body text "${obj.id}" font size ${obj.fontSize}pt is below minimum ${RULES.minFontBody}pt`,
          element: obj,
          suggestion: `Change to ${RULES.minFontBody}pt or higher`
        });
      }
    }
  }
  
  // Check fill ratio
  if (slide.objects) {
    for (const obj of slide.objects) {
      if (obj.w && obj.h) {
        const textArea = obj.content ? obj.content.length * obj.fontSize * 0.05 : 0;
        const shapeArea = obj.w * obj.h;
        const fillRatio = textArea / shapeArea;
        
        if (fillRatio < 0.1 && obj.type !== "shape") {
          issues.push({
            slide: slideNumber,
            type: "info",
            code: "LOW_FILL_RATIO",
            message: `"${obj.id}" has very low fill ratio (${(fillRatio * 100).toFixed(0)}%). Shape looks empty.`,
            element: obj,
            suggestion: `Consider increasing font size to ${Math.ceil(shapeArea * 0.5 / (obj.content?.length || 1) / 0.05)}pt`
          });
        }
      }
    }
  }
  
  return issues;
}

function checkOverlap(a, b) {
  // a: {x, y, w, h}
  // b: {x, y, w, h}
  
  if (!a.w || !a.h || !b.w || !b.h) return false;
  
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;
  
  // No overlap conditions
  if (a.x >= bRight || aRight <= b.x) return false;
  if (a.y >= bBottom || aBottom <= b.y) return false;
  
  return true;
}

function checkGap(a, b) {
  if (!a.w || !a.h || !b.w || !b.h) return null;
  
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;
  
  // Calculate gaps
  const gaps = [];
  
  // Horizontal gap (a is to the left of b)
  if (aRight < b.x) {
    gaps.push(b.x - aRight);
  }
  
  // Horizontal gap (b is to the left of a)
  if (bRight < a.x) {
    gaps.push(a.x - bRight);
  }
  
  // Vertical gap (a is above b)
  if (aBottom < b.y) {
    gaps.push(b.y - aBottom);
  }
  
  // Vertical gap (b is above a)
  if (bBottom < a.y) {
    gaps.push(a.y - bBottom);
  }
  
  return gaps.length > 0 ? Math.min(...gaps) : null;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("Usage: node validate-layout.js slides.json [--fix]");
    console.error("       node validate-layout.js slides.json [--fix --output fixed.json]");
    process.exit(1);
  }
  
  const inputPath = args[0];
  const fix = args.includes("--fix");
  const outputPath = args[args.indexOf("--output") + 1] || null;
  
  // Read input
  let slides;
  try {
    slides = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch (e) {
    console.error(`Error reading file: ${e.message}`);
    process.exit(1);
  }
  
  // Normalize input
  if (!Array.isArray(slides)) {
    if (slides.slides) {
      slides = slides.slides;
    } else {
      slides = [slides];
    }
  }
  
  // Validate each slide
  const allIssues = [];
  
  for (let i = 0; i < slides.length; i++) {
    const slideIssues = validateSlide(slides[i], i + 1);
    allIssues.push(...slideIssues);
  }
  
  // Report
  console.log("\n=== Layout Validation Report ===\n");
  
  if (allIssues.length === 0) {
    console.log("No issues found! All slides pass validation.\n");
    return;
  }
  
  // Group by slide
  const bySlide = {};
  for (const issue of allIssues) {
    if (!bySlide[issue.slide]) {
      bySlide[issue.slide] = [];
    }
    bySlide[issue.slide].push(issue);
  }
  
  // Report by slide
  for (const [slideNum, issues] of Object.entries(bySlide)) {
    console.log(`Slide ${slideNum}:`);
    for (const issue of issues) {
      const icon = issue.type === "error" ? "❌" : issue.type === "warning" ? "⚠️" : "ℹ️";
      console.log(`  ${icon} [${issue.code}] ${issue.message}`);
      if (issue.suggestion) {
        console.log(`     → ${issue.suggestion}`);
      }
    }
    console.log("");
  }
  
  // Summary
  const errors = allIssues.filter(i => i.type === "error").length;
  const warnings = allIssues.filter(i => i.type === "warning").length;
  const info = allIssues.filter(i => i.type === "info").length;
  
  console.log("=== Summary ===");
  console.log(`Total issues: ${allIssues.length}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Warnings: ${warnings}`);
  console.log(`  Info: ${info}`);
  
  // Fix mode
  if (fix) {
    console.log("\n=== Auto-fix not implemented ===");
    console.log("Please manually fix the issues above.");
  }
  
  // Exit code
  process.exit(errors > 0 ? 1 : 0);
}

main();
