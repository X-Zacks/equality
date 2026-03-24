from pathlib import Path

p = Path(r'C:\Users\zz\Desktop\OCR Testing\ocr_results.md')
content = p.read_text(encoding='utf-8')
lines = content.splitlines()
print(f"File size: {p.stat().st_size / 1024:.1f} KB")
print(f"Line count: {len(lines)}")
print()
print("=== First 50 lines ===")
print("\n".join(lines[:50]))
