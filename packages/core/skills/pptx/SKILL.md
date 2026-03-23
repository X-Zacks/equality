---
name: pptx
description: '读取、提取、创建或编辑 PowerPoint 演示文稿（.pptx 文件）。Use when: 用户提交了 .pptx 文件需要提取内容/分析结构，或需要生成新的 PPT。NOT for: Word 文档、PDF、Excel 表格、Google Slides 在线文档。'
---

## 概述

`markitdown` 是 Microsoft 开源的文档转 Markdown 工具（MIT 协议），**本地运行，无需 LLM**，支持 PPTX、DOCX、PDF、Excel 等格式。

## 安装

```bash
# 仅 PPTX 支持
pip install "markitdown[pptx]"

# 全格式支持（推荐）
pip install "markitdown[all]"
```

---

## 提取内容（最常用）

```bash
# 命令行：直接提取 PPT 全文为 Markdown
markitdown presentation.pptx -o output.md

# 或输出到控制台
markitdown presentation.pptx
```

```python
# Python API
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("presentation.pptx")
print(result.text_content)
```

输出包含：幻灯片编号、标题、正文文字、表格内容、演讲者备注。

---

## 从 PPT 提取需求信息

当用户提交需求 PPT 时：

```bash
# 1. 提取全文
markitdown requirements.pptx -o requirement.md

# 2. 读取内容
cat requirement.md
```

提取后重点关注：
- 产品定义幻灯片（标题 + 一句话描述）
- 功能列表幻灯片（通常是 bullet points）
- 用户角色/用户场景幻灯片
- 技术架构图（文字部分可以提取，图形需要用 `read_image`）
- 时间线/路线图幻灯片

**PPT 中的图片**（UI 设计图、架构图）不会被提取为文字，需要单独处理：

```python
# 提取 PPT 中的图片并分析（需要 LLM）
# 如果有 OpenAI/兼容 API：
from markitdown import MarkItDown
from openai import OpenAI

client = OpenAI(base_url="your-api-base-url", api_key="your-key")
md = MarkItDown(llm_client=client, llm_model="gpt-4o")
result = md.convert("presentation.pptx")
print(result.text_content)  # 图片会被描述为文字
```

或者：直接用 `read_image` 工具分析设计图截图。

---

## 创建新 PPT

使用 `pptx`（python-pptx）：

```bash
pip install python-pptx
```

```python
# create_pptx.py
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
slide_layout = prs.slide_layouts[1]  # 标题+内容布局
slide = prs.slides.add_slide(slide_layout)

title = slide.shapes.title
body = slide.placeholders[1]

title.text = "幻灯片标题"
body.text = "内容第一行\n内容第二行"

prs.save("output.pptx")
print("PPT 已创建")
```

---

## 格式转图片（视觉检查用）

如果需要把 PPT 转为图片查看（需要 LibreOffice）：

```powershell
# Windows - LibreOffice 默认路径
& "C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to pdf presentation.pptx
```

然后用 `read_image` 工具查看转换出的图片页面。

---

## Windows 特别说明

- `markitdown` 在 Windows 上原生支持，直接 `pip install` 即可
- 图片内容提取（可选）需要兼容 OpenAI 格式的 API，与使用哪个模型无关
- LibreOffice 仅在需要转图片时才需要，纯文字提取不需要
