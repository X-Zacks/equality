---
name: pdf
description: '读取、提取、合并、拆分或创建 PDF 文件。Use when: 用户提交了 PDF 文件需要提取文本/表格内容、合并/拆分 PDF、添加水印、填写表单，或生成新的 PDF。NOT for: Word 文档、Excel 表格、图片文件（不含 PDF 封装的图片）。'
---

## 快速参考

| 任务 | 工具 | 方法 |
|------|------|------|
| 提取文本 | pdfplumber | `page.extract_text()` |
| 提取表格 | pdfplumber | `page.extract_tables()` |
| 合并 PDF | pypdf | `writer.add_page(page)` |
| 拆分 PDF | pypdf | 逐页写出 |
| 创建 PDF | reportlab | Canvas 或 Platypus |
| 扫描件 OCR | pytesseract | 先转图片再 OCR |

---

## 安装依赖

```bash
pip install pypdf pdfplumber reportlab
```

---

## 读取内容（最常用）

```python
# read_pdf.py
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    print(f"共 {len(pdf.pages)} 页")
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        print(f"=== 第 {i+1} 页 ===")
        print(text)
```

```bash
python read_pdf.py
```

---

## 从 PDF 提取需求信息

当用户提交需求文档（PDF 格式）时：

```python
# extract_requirements.py
import pdfplumber

with pdfplumber.open("requirements.pdf") as pdf:
    full_text = ""
    all_tables = []
    
    for i, page in enumerate(pdf.pages):
        # 提取文本
        text = page.extract_text()
        if text:
            full_text += f"\n--- 第{i+1}页 ---\n{text}"
        
        # 提取表格（功能列表、字段定义等常用表格形式）
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            all_tables.append({
                "page": i + 1,
                "table_idx": j,
                "data": table
            })

print("=== 文档全文 ===")
print(full_text)

if all_tables:
    print(f"\n=== 发现 {len(all_tables)} 个表格 ===")
    for t in all_tables:
        print(f"\n第{t['page']}页 表格{t['table_idx']+1}:")
        for row in t["data"]:
            print(row)
```

---

## 合并 PDF

```python
from pypdf import PdfReader, PdfWriter

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
print("合并完成")
```

---

## 扫描件 OCR（图片型 PDF）

如果 `extract_text()` 返回空，说明是扫描件，需要 OCR：

```bash
pip install pytesseract pdf2image
# Windows 还需要：
# 1. 安装 Tesseract：https://github.com/UB-Mannheim/tesseract/wiki
# 2. 安装 Poppler：https://github.com/oschwartz10612/poppler-windows/releases
```

```python
# ocr_pdf.py
import pytesseract
from pdf2image import convert_from_path

# Windows 需要指定路径（根据实际安装位置调整）
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

images = convert_from_path("scanned.pdf")
text = ""
for i, image in enumerate(images):
    text += f"\n--- 第{i+1}页 ---\n"
    text += pytesseract.image_to_string(image, lang="chi_sim+eng")

print(text)
```

---

## 创建新 PDF

```python
# create_pdf.py
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# 注册中文字体（Windows 系统字体）
try:
    pdfmetrics.registerFont(TTFont('SimSun', 'C:/Windows/Fonts/simsun.ttc'))
    font_name = 'SimSun'
except:
    font_name = 'Helvetica'  # 回退到英文字体

doc = SimpleDocTemplate("output.pdf", pagesize=A4)
styles = getSampleStyleSheet()
story = []

story.append(Paragraph("标题", styles['Title']))
story.append(Spacer(1, 12))
story.append(Paragraph("正文内容", styles['Normal']))

doc.build(story)
print("PDF 已创建")
```

---

## Windows 特别说明

- **Poppler**（pdf2image 依赖）：需手动安装并添加到 PATH，或指定 `poppler_path` 参数
- **中文 OCR**：需要下载 Tesseract 中文语言包 `chi_sim.traineddata`
- **中文 PDF 创建**：reportlab 默认不含中文字体，需注册系统字体
