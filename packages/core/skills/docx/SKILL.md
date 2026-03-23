---
name: docx
description: '读取、解析、创建或编辑 Word 文档（.docx 文件）。Use when: 用户提交了 .docx 文件需要提取内容、分析文档结构、编辑或生成新的 Word 文档。NOT for: PDF 文件、Excel 表格、纯文本文件、Google Docs 在线文档。'
---

## 概述

.docx 文件是包含 XML 文件的 ZIP 压缩包。

## 快速参考

| 任务 | 方法 |
|------|------|
| 读取/分析内容 | `pandoc` 转 Markdown，或解包查看 XML |
| 创建新文档 | 使用 `docx`（npm）生成 |
| 编辑已有文档 | 解包 → 编辑 XML → 重新打包 |

---

## 读取内容

```bash
# 提取文本（保留标题层级、列表结构）
pandoc document.docx -o output.md

# 提取含跟踪修订的文本
pandoc --track-changes=all document.docx -o output.md

# 解包查看原始 XML
python scripts/unpack.py document.docx unpacked/
```

**依赖安装：**
```bash
# Windows - 安装 pandoc
winget install JohnMacFarlane.Pandoc
# 或下载：https://pandoc.org/installing.html
```

---

## 从 Word 文档提取需求信息

当用户提交需求文档（Word 格式）时，按以下步骤提取关键信息：

```bash
# 1. 提取全文为 Markdown（保留结构）
pandoc document.docx -o requirement.md

# 2. 读取提取的内容
cat requirement.md
```

提取后重点关注：
- 功能列表（通常在标题/子标题下）
- 用户角色描述
- 数据字段定义（常见于表格中）
- 非功能性要求（性能、安全等）
- 界面描述或原型说明

---

## 解包与编辑

### 步骤 1：解包

```bash
# 创建解包脚本（因 Windows 无法直接用 unzip）
python -c "
import zipfile, shutil, os
src = 'document.docx'
dst = 'unpacked'
if os.path.exists(dst):
    shutil.rmtree(dst)
with zipfile.ZipFile(src, 'r') as z:
    z.extractall(dst)
print('解包完成')
"
```

主要内容在 `unpacked/word/document.xml`。

### 步骤 2：编辑 XML

用 `edit_file` 或 `replace_in_file` 工具直接编辑 XML 文件。

**关键 XML 元素：**
- `<w:p>` — 段落
- `<w:r>` — 文字 run
- `<w:t>` — 文本内容
- `<w:pStyle w:val="Heading1">` — 标题样式

### 步骤 3：重新打包

```bash
python -c "
import zipfile, os
src_dir = 'unpacked'
output = 'output.docx'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            filepath = os.path.join(root, file)
            arcname = os.path.relpath(filepath, src_dir)
            zf.write(filepath, arcname)
print(f'已打包为 {output}')
"
```

---

## 创建新文档

使用 Node.js 的 `docx` 库：

```bash
npm install -g docx
```

```javascript
// create_doc.js
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const fs = require('fs');

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun('标题')]
      }),
      new Paragraph({
        children: [new TextRun('正文内容')]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('output.docx', buffer);
  console.log('文档已创建');
});
```

```bash
node create_doc.js
```

---

## 处理 .doc 格式（旧版）

旧版 `.doc` 文件需要先转换（需要 LibreOffice）：

```bash
# 方法一：LibreOffice（如已安装）
soffice --headless --convert-to docx document.doc

# 方法二：提示用户手动转换
# 在 Word 中：文件 → 另存为 → .docx
```

---

## Windows 特别说明

- **pandoc**：Windows 下 `pandoc` 命令需要确认已添加到 PATH
- **LibreOffice**：默认安装路径 `C:\Program Files\LibreOffice\program\soffice.exe`
- **路径**：Windows 路径用反斜杠，在 Python 中用原始字符串 `r"C:\path\to\file.docx"`
