---
name: pdf-contract-llm-extract
description: 批量处理目录中的合同 PDF，先转图片与 OCR，再用视觉模型识别页面内容，最后合并信息并汇总输出到 Excel，提取合同编号、license 名称、数量、金额、签署/到期时间、签署双方、关键条款等字段。
tools:
  - list_dir
  - glob
  - write_file
  - read_file
  - bash
  - read_image
  - read_pdf
  - apply_patch
  - edit_file
equality:
  auto-generated: true
  source-model: gpt-5.4
  created: 2026-03-17
---

# 批量提取合同 PDF 信息并汇总到 Excel

## 适用场景

当用户需要对某个目录中的多个合同 PDF 进行批量识别，并输出结构化 Excel 时使用本 Skill。

适合提取的字段包括：
- 合同编号
- License 名称
- 数量
- 合同金额/币种
- 签署时间
- 到期时间 / 服务期 / 订阅期
- 签署双方名称
- 关键条款
- 付款条款
- 自动续约 / 终止条款
- 来源文件名
- 备注/补充信息

## 为什么这样设计

这个 Skill 兼容 GPT-5.4 和 GPT-4o：

1. **不要在 Python 脚本中直接调用 `functions` 或 `read_image`**。
   - 这些是 Equality 工具，不是用户本地 Python 模块。
   - 正确方式是：Python 只做本地文件处理；视觉识别由助手通过 `read_image` 工具逐页完成。

2. **提示词尽量结构化、显式、低歧义**。
   - GPT-4o 在图像结构化抽取上通常需要更明确的字段定义。
   - 因此本 Skill 使用固定字段、固定输出格式、明确“未知填空”的提示。

3. **先 OCR，再视觉识别，再二次整合**。
   - OCR 擅长可复制文本。
   - 视觉模型擅长表格、版式、模糊扫描件、签章区域、页眉页脚和非标准字段。
   - 最后再统一整合，减少漏提取和字段冲突。

4. **对 GPT-4o 必须做断点化、分批化、强落盘设计**。
   - 4o 更容易在长流程里“说要继续”，但没有真正继续落盘。
   - 因此本 Skill 增加：分 PDF 处理、分页批次、状态文件、结果中间文件、完成检查清单。

## 输入参数

| 参数 | 是否必填 | 说明 | 示例 |
|---|---|---|---|
| pdf_dir | 是 | 待处理 PDF 所在目录 | `C:/Users/zz/Desktop/OCR Testing` |
| output_excel | 否 | 输出 Excel 路径；默认在 pdf_dir 下生成 | `C:/Users/zz/Desktop/OCR Testing/Contract_Summary_LLM_Merged.xlsx` |
| image_dir | 否 | 中间图片输出目录；默认 `pdf_dir/output_images` | `C:/Users/zz/Desktop/OCR Testing/output_images` |
| languages | 否 | OCR 语言，默认 `eng`，可按文档情况扩展 | `eng` / `eng+chi_sim` |

## 标准输出字段

最终 Excel 至少包含以下列：

- source_file
- page_range_used
- contract_number
- license_name
- quantity
- unit
- contract_amount
- currency
- signing_date
- effective_date
- expiration_date
- term
- party_a
- party_b
- key_terms
- payment_terms
- renewal_terms
- termination_terms
- support_or_subscription_period
- products_or_services
- notes
- confidence

说明：
- 未识别到时填 `未提取到`
- 多值可用 `；` 分隔
- `confidence` 可写 `高 / 中 / 低`

## 执行步骤

### 第 1 步：扫描 PDF 文件

使用 `list_dir` 或 `glob` 找出目录中的所有 PDF。

优先使用：
- `glob` 模式：`*.pdf` 或 `**/*.pdf`

如果目录下已有 `output_images`，不要把其中图片当作输入 PDF。

---

### 第 2 步：用 Python 将 PDF 转图片，并顺带导出 OCR 中间结果

**必须遵守 Windows 兼容规则：先写脚本文件，再运行。不要用 heredoc。**

将下面脚本保存为：

`<pdf_dir>/prepare_pdf_images_and_ocr.py`

脚本作用：
- 扫描目录下所有 PDF
- 每个 PDF 每页转 PNG
- 对每页执行 OCR
- 生成中间 JSON，供后续 LLM 整合使用
- 每处理一页都打印日志，避免超时无输出

```python
import json
import os
from pathlib import Path

import pytesseract
from pdf2image import convert_from_path
from PIL import Image

PDF_DIR = Path(r"C:/Users/zz/Desktop/OCR Testing")
IMAGE_DIR = PDF_DIR / "output_images"
OCR_JSON = PDF_DIR / "ocr_results.json"
LANG = "eng"

# 如本机未配置环境变量，可取消注释并改成实际路径
# pytesseract.pytesseract.tesseract_cmd = r"C:/Program Files/Tesseract-OCR/tesseract.exe"

IMAGE_DIR.mkdir(parents=True, exist_ok=True)

all_results = []

pdf_files = sorted([p for p in PDF_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"])
print(f"Found {len(pdf_files)} PDF files")

for pdf_index, pdf_path in enumerate(pdf_files, start=1):
    print(f"[{pdf_index}/{len(pdf_files)}] Processing PDF: {pdf_path.name}", flush=True)
    try:
        images = convert_from_path(str(pdf_path))
    except Exception as e:
        print(f"Failed to convert PDF {pdf_path.name}: {e}", flush=True)
        all_results.append({
            "source_file": pdf_path.name,
            "status": "pdf_convert_failed",
            "error": str(e),
            "pages": []
        })
        continue

    pdf_entry = {
        "source_file": pdf_path.name,
        "status": "ok",
        "pages": []
    }

    for page_num, image in enumerate(images, start=1):
        image_name = f"{pdf_path.stem}_page_{page_num}.png"
        image_path = IMAGE_DIR / image_name
        image.save(str(image_path), "PNG")
        print(f"  Saved image: {image_name}", flush=True)

        try:
            text = pytesseract.image_to_string(Image.open(str(image_path)), lang=LANG)
            print(f"  OCR done: {image_name} (chars={len(text)})", flush=True)
        except Exception as e:
            text = ""
            print(f"  OCR failed: {image_name}: {e}", flush=True)

        pdf_entry["pages"].append({
            "page": page_num,
            "image_path": str(image_path).replace('\\', '/'),
            "ocr_text": text
        })

    all_results.append(pdf_entry)

with open(OCR_JSON, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"OCR json saved to: {OCR_JSON}", flush=True)
```

然后执行：

```powershell
python "C:/Users/zz/Desktop/OCR Testing/prepare_pdf_images_and_ocr.py"
```

如缺依赖，先安装：

```powershell
pip install pdf2image pytesseract pillow
```

---

### 第 3 步：读取 OCR 中间结果

用 `read_file` 读取：

- `<pdf_dir>/ocr_results.json`

按 PDF 分组处理。

如果文件很大，可以分段读取，或先只读取部分行确认结构。

---

### 第 4 步：逐页调用视觉模型识别图片

对每一页图片使用 `read_image`。

**关键要求（为 GPT-4o 稳定性专门补充）：**
- 不要一口气处理整个目录全部图片
- 必须按 **单个 PDF** 分组处理
- 每个 PDF 内部再按 **每批 3~5 页** 分批调用 `read_image`
- 每完成 1 页或 1 批，就立刻把结果写入中间文件，避免中途停止后前功尽弃
- 如果页数很多，优先处理：首页、签字页、报价/订单明细页、金额页、条款页
- 当模型开始出现“继续处理剩余页面”之类表述时，不要停留在口头承诺，必须继续实际调用工具直到当前 PDF 的目标页处理完，并把结果落盘
- **若本轮只完成部分 PDF，也必须把已完成部分写入中间文件，并明确标记未完成状态，禁止只在回复里口头说明**

#### 推荐提示词（兼容 GPT-5.4 / GPT-4o）

对每张图片都使用**短提示词、明确字段、严格规则**，避免模型自由发挥。

模板如下：

```text
请识别这页合同/订单/报价单中的关键信息，并尽量逐字保留原文，不要总结改写。

重点提取：
- 合同编号 / agreement number / contract number / quote number / order form number
- license 名称 / 产品名称 / 订阅名称 / SKU / edition
- 数量 / seats / units / license count
- 金额相关：单价、总价、币种、税费、subtotal、total、annual fee、payment amount
- 日期相关：签署日期、生效日期、起始日期、到期日期、服务期、订阅期、renewal date
- 签署双方名称：customer、vendor、seller、supplier、reseller、Adobe、Splunk 等
- 关键条款：付款、续约、终止、自动续费、支持服务、限制条件
- 其他重要信息：订单号、采购单号、联系人、地区、账单周期、折扣、服务范围

输出规则：
- 只输出结构化文本
- 每一项单独一行，格式 `字段名: 值`
- 缺失时输出 `字段名: 未提取到`
- 如果有表格，把与 license / quantity / amount 相关的每一行都列出来
- 不要输出任何说明性句子
```

#### 字段名建议固定为

- 页面摘要
- 合同编号
- 产品或License名称
- 数量
- 单位
- 单价
- 总金额
- 币种
- 签署日期
- 生效日期
- 到期日期
- 服务期或订阅期
- 甲方/客户
- 乙方/供应商
- 付款条款
- 续约条款
- 终止条款
- 关键限制或备注
- 页面中的产品明细

> 说明：之所以这样设计，是为了让 GPT-4o 也能稳定输出。字段名固定、提示词更短、要求逐行输出、缺失时写“未提取到”，可以显著降低格式漂移和半途停下的问题。

#### 建议的中间落盘文件

为避免 GPT-4o 做到一半中断，建议在处理视觉识别时同步维护：

- `<pdf_dir>/vision_page_results.json`
- `<pdf_dir>/vision_progress.json`

`vision_page_results.json` 结构示例：

```json
[
  {
    "source_file": "adobe.pdf",
    "page": 1,
    "image_path": "C:/Users/zz/Desktop/OCR Testing/output_images/adobe_page_1.png",
    "vision_result": "页面摘要: ..."
  }
]
```

`vision_progress.json` 结构示例：

```json
{
  "current_pdf": "adobe.pdf",
  "completed_pdfs": ["Splunk.pdf"],
  "pending_pdfs": ["adobe.pdf", "jd.pdf"],
  "page_status": {
    "adobe.pdf": {
      "done_pages": [1, 2, 3],
      "pending_pages": [4, 5, 6],
      "last_updated": "2026-03-17T16:52:40"
    }
  }
}
```

执行要求：
- 处理完一页，就把该页结果追加到 `vision_page_results.json`
- 每完成一批页面，同步更新 `vision_progress.json`
- 如果 JSON 已存在，先读取已有记录，跳过已完成页面
- 如果中途中断，下一次优先从 `vision_progress.json` 和 `vision_page_results.json` 继续
- **处理完成后必须核对：`ocr_results.json` 中每个 PDF 的目标页面，是否都在 `vision_page_results.json` 中有对应记录**

#### 4o 专用执行检查清单

在视觉识别阶段，每处理完一个 PDF，都要自检以下项目：

- 是否真的调用了该 PDF 所需页面的 `read_image`
- 是否把每页结果写进 `vision_page_results.json`
- 是否更新了 `vision_progress.json`
- 是否记录该 PDF 为 completed，而不是只在回复里说“已完成”
- 若未完成，是否明确记录 pending_pages
- 是否避免把“下一步继续”当成完成标记

只有以上全部满足，才算该 PDF 真正完成。

---

### 第 5 步：将 OCR 文本 + 视觉识别结果再次交给模型整合

**不要简单拼接后人工判断。**
必须由模型再次做融合提取。

对于每个 PDF，把该 PDF 的：
- 所有页 OCR 文本
- 所有页视觉识别结果

组合成一个分析输入，再让模型输出该 PDF 的最终结构化结果。

#### 二次整合提示词模板

```text
你现在需要从一份合同文档的多页信息中，提取最终结构化字段。
我会提供两类信息：
1. OCR 提取文本：可能更完整，但会有识别噪音
2. 图片视觉识别结果：更擅长版式、表格和字段定位，但也可能漏字

请你综合两类信息，交叉验证，输出这份文档最可信的结果。

提取目标字段：
- contract_number
- license_name
- quantity
- unit
- contract_amount
- currency
- signing_date
- effective_date
- expiration_date
- term
- party_a
- party_b
- key_terms
- payment_terms
- renewal_terms
- termination_terms
- support_or_subscription_period
- products_or_services
- notes
- confidence

规则：
- 只输出上述字段，每行一个，格式 `字段名: 值`
- 若字段存在多个值，使用 `；` 分隔
- 若不确定，写最可能值，并在 notes 说明依据
- 完全无法确认时填 `未提取到`
- 不要输出 JSON，不要输出解释性前言
- 如果 license 有多项，license_name / quantity / amount 可用 `项目1=...；项目2=...` 的形式保留
- 如果 OCR 与视觉结果冲突，优先选择证据更强的一方，并在 notes 说明冲突
```

然后在提示词下附上：

```text
【OCR 提取文本】
...这里放 OCR 汇总...

【图片视觉识别结果】
...这里放每页 read_image 的结果汇总...
```

#### 建议的最终结果落盘方式

建议持续维护：

- `<pdf_dir>/final_contract_results.json`
- `<pdf_dir>/final_contract_progress.json`

`final_contract_progress.json` 可记录：
- 已完成整合的 PDF
- 待整合的 PDF
- 最近一次整合到哪个文件
- 是否已经写入 Excel

这样即使整合阶段被打断，也能继续，而不会重复处理全部 PDF。

---

### 第 6 步：把最终结果写入 Excel

推荐用 pandas 写 Excel。

将下面脚本保存为：

`<pdf_dir>/write_contract_summary_excel.py`

```python
import json
from pathlib import Path
import pandas as pd

PDF_DIR = Path(r"C:/Users/zz/Desktop/OCR Testing")
INPUT_JSON = PDF_DIR / "final_contract_results.json"
OUTPUT_XLSX = PDF_DIR / "Contract_Summary_LLM_Merged.xlsx"

with open(INPUT_JSON, "r", encoding="utf-8") as f:
    rows = json.load(f)

# rows 应为 list[dict]
df = pd.DataFrame(rows)
df.to_excel(OUTPUT_XLSX, index=False)
print(f"Excel saved to: {OUTPUT_XLSX}")
```

执行：

```powershell
python "C:/Users/zz/Desktop/OCR Testing/write_contract_summary_excel.py"
```

如果缺依赖：

```powershell
pip install pandas openpyxl
```

---

## 建议的数据中间格式

建议在执行过程中维护一个中间文件：

`<pdf_dir>/final_contract_results.json`

结构示例：

```json
[
  {
    "source_file": "Splunk.pdf",
    "page_range_used": "1-6",
    "contract_number": "未提取到",
    "license_name": "Splunk Enterprise；Splunk Cloud",
    "quantity": "100 GB/day；50 users",
    "unit": "GB/day；users",
    "contract_amount": "120000；30000",
    "currency": "USD",
    "signing_date": "2024-01-15",
    "effective_date": "2024-02-01",
    "expiration_date": "2025-01-31",
    "term": "12 months",
    "party_a": "Customer Name",
    "party_b": "Splunk Inc.",
    "key_terms": "含软件订阅及支持服务；按年计费",
    "payment_terms": "Net 30",
    "renewal_terms": "自动续约，除非提前30天书面通知",
    "termination_terms": "重大违约可终止",
    "support_or_subscription_period": "2024-02-01 至 2025-01-31",
    "products_or_services": "Splunk Enterprise subscription；Support services",
    "notes": "金额来自订单汇总页；合同编号在首页未清晰识别",
    "confidence": "中"
  }
]
```

---

## 断点续跑建议

### 1. 什么时候判定需要断点续跑
出现以下任一情况，就不要从头重跑，而应读取中间文件继续：
- 已经存在 `ocr_results.json`
- 已经存在 `vision_page_results.json`
- 已经存在 `vision_progress.json`
- 已经存在 `final_contract_results.json`
- 已经存在 `final_contract_progress.json`

### 2. 断点恢复顺序
建议优先级如下：
1. 先检查 `final_contract_progress.json`
2. 再检查 `vision_progress.json`
3. 再检查 `vision_page_results.json`
4. 最后才回退到 `ocr_results.json`

### 3. 恢复时的行为要求
- 已完成的 PDF 不重复视觉识别
- 已完成的页面不重复 `read_image`
- 已完成整合的 PDF 不重复整合
- 若 Excel 尚未写出，但 `final_contract_results.json` 已齐全，则直接写 Excel

---

## 实施细节建议

### 1. 页面很多时的处理方式
- 先整份 PDF 全部转图和 OCR
- 再优先识别：首页、签字页、报价/订单明细页、金额页、条款页
- 如果页数过多，可先用 OCR 文本判断哪几页可能包含金额、license、签约信息，再重点送视觉模型

### 2. 对 GPT-4o 的适配建议
- 提示词避免太长的抽象指令
- 多用固定字段名和固定输出格式
- 不要让模型自己设计 schema
- 每次 `read_image` 只做“单页识别”，最终整合再单独做一次
- 缺失时明确要求输出“未提取到”
- 表格类信息要求“逐行列出”
- 按单个 PDF 分组，不要跨多个 PDF 同时做视觉识别
- 每批只处理 3~5 页，处理后立即落盘到 `vision_page_results.json`
- 每批处理后必须同步更新 `vision_progress.json`
- 如执行中断，优先从 `vision_progress.json` 断点续跑，而不是从头开始
- 不要只回复“将继续处理剩余页面”，必须实际继续调用工具并保存结果
- 完成一个 PDF 后，必须执行一次“完成检查清单”

### 3. 对金额和日期的处理
- 金额保留原币种和原格式
- 日期尽量保留原文，如果模型能明确转换再标准化
- 多个金额要在 notes 标注用途，如 list price / net price / annual fee / total

### 4. 失败恢复
- 如果某页 `read_image` 失败，保留 OCR 结果继续
- 如果 Excel 写入失败，先写 JSON，再单独运行写 Excel 脚本
- 如果 OCR 质量差，可将 `LANG` 改为 `eng+chi_sim`

---

## 交付物清单

完成后应至少产出：

- `output_images/`：PDF 转图片结果
- `ocr_results.json`：每页 OCR 中间结果
- `vision_page_results.json`：每页视觉识别中间结果
- `vision_progress.json`：视觉识别进度状态
- `final_contract_results.json`：每个 PDF 的最终结构化结果
- `final_contract_progress.json`：最终整合进度状态
- `Contract_Summary_LLM_Merged.xlsx`：最终 Excel 汇总表

---

## 给执行者的简明操作顺序

1. 找到目标目录下所有 PDF
2. 用 Python 脚本转图片并做 OCR，生成 `ocr_results.json`
3. 如果已有中间文件，先判断是否应断点续跑
4. 按单个 PDF、每批 3~5 页，对图片调用 `read_image`
5. 每页结果写入 `vision_page_results.json`，每批更新 `vision_progress.json`
6. 对每个 PDF，把 OCR 汇总 + 视觉识别汇总再次交给模型整合
7. 将最终结构化结果保存为 `final_contract_results.json`
8. 更新 `final_contract_progress.json`
9. 用 pandas 脚本写入 Excel
10. 按完成检查清单核对所有 PDF 是否真正完成

这样可以保证：
- Windows 可执行
- GPT-5.4 可用
- GPT-4o 更稳定
- 中途停止后可恢复
- 不容易出现“做到一半只口头继续、但未真正落盘”的问题
