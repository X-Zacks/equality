---
name: excel-quarterly-cost-diff-analysis
description: 对同一目录下两个不同季度的费用分摊 Excel 表进行多维度汇总对比，分析 cost 差异、结构变化与组织归属迁移，输出 MD 和 HTML 报告
tools:
  - list_dir
  - glob
  - read_file
  - bash
  - write_file
  - read_pdf
  - read_image
  - grep
equality:
  auto-generated: true
  source-model: MiniMax-M2.7
  created: 2026-03-20
---

# 两个季度费用分摊 Excel 差异分析 Skill

## 任务说明

当用户提供一个目录，目录下包含两个不同季度（例如 Q3、Q4）的费用分摊 Excel 文件时，本 Skill 用于：

- 自动识别两个季度文件
- 读取主数据 sheet，智能选择包含 cost 和关键维度的 sheet
- 识别 `cost` 作为费用字段
- 按多个维度（BG、Function、Geo、Allocation Key、Application、Cost Center 等）汇总两个季度费用
- 计算绝对差异与变化率
- 识别结构变化、组织归属迁移与分摊规则变化
- 生成 Markdown + HTML 双格式报告
- **所有输出文件（Python 脚本、MD、HTML）统一存放到 Excel 同目录下的一个文件夹中**

适用于费用分摊、IT cost allocation、shared service allocation 等 Excel 数据对比场景。

---

## 输入参数

| 参数 | 说明 | 是否必填 | 示例 |
|---|---|---:|---|
| data_dir | 存放两个季度 Excel 文件的目录 | 是 | `C:/software/excel-data-sample` |
| cost_field | 费用字段名，默认 `cost` | 否 | `cost` |
| output_folder | 输出文件夹名（不填则自动生成日期文件夹） | 否 | `cost_analysis` |

---

## 输出规范（重要）

所有输出文件必须存放在 **Excel 文件所在目录** 下的一个**新建文件夹**中：

```
C:/software/excel-data-sample/
├── allocation_raw_data_fy2526_q3.xlsx    ← 原始 Excel
├── allocation_raw_data_fy2526_q4.xlsx    ← 原始 Excel
└── cost_analysis_20260320/               ← 自动创建的输出文件夹
    ├── analyze.py                        ← 分析用 Python 脚本
    ├── full_report.md                    ← Markdown 报告（含 CC Top10）
    └── full_report.html                  ← HTML 报告（可浏览器查看）
```

---

## 执行步骤

### 第 1 步：查看目录并确认 Excel 文件

先列出目录内容，确认有两个 Excel 文件：

- 使用 `list_dir` 查看目录
- 必要时使用 `glob` 搜索 `*.xlsx` 和 `*.xls`
- 优先选择文件名中包含季度标识（如 `q1/q2/q3/q4`）的文件

如目录中超过两个 Excel 文件，应根据文件名、修改时间、业务命名判断要比较的两个文件。

---

### 第 2 步：创建输出文件夹

在 Excel 所在目录下创建一个以日期命名的文件夹（如 `cost_analysis_20260320`），用于存放：
- Python 分析脚本
- Markdown 报告
- HTML 报告

---

### 第 3 步：用 write_file 保存 Python 脚本

将下面脚本保存为独立 Python 文件，**存放到 Excel 同目录下的输出文件夹中**：

```
C:/software/excel-data-sample/cost_analysis_20260320/analyze.py
```

> 注意：必须先用 `write_file` 保存脚本，再用 `bash` 执行 `python xxx.py`。不要使用 heredoc。

#### Python 脚本模板

```python
import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

import pandas as pd


def norm_col(c):
    return str(c).strip()


def pick_main_sheet(xlsx_path: Path):
    xl = pd.ExcelFile(xlsx_path)
    best = None
    best_score = -1
    best_df = None
    for sheet in xl.sheet_names:
        try:
            df = pd.read_excel(xlsx_path, sheet_name=sheet)
        except Exception:
            continue
        cols = [norm_col(c) for c in df.columns]
        lower_cols = [c.lower() for c in cols]
        score = 0
        if "cost" in lower_cols:
            score += 10
        for key in ["bg", "function", "geo", "allocation_key", "application_name", "cost_center", "company_code", "new_tco_l1", "new_tco_l2"]:
            if key in lower_cols:
                score += 2
        score += min(len(df), 1000) / 1000
        if score > best_score:
            best_score = score
            best = sheet
            best_df = df.copy()
    if best is None:
        raise ValueError(f"No readable sheet found: {xlsx_path}")
    best_df.columns = [norm_col(c) for c in best_df.columns]
    return best, best_df


def quarter_key(path: Path):
    m = re.search(r"q([1-4])", path.name, flags=re.I)
    if m:
        return int(m.group(1))
    return 999


def clean_df(df: pd.DataFrame, cost_field: str):
    if cost_field not in df.columns:
        lower_map = {c.lower(): c for c in df.columns}
        if cost_field.lower() in lower_map:
            cost_field = lower_map[cost_field.lower()]
        else:
            raise ValueError(f"cost field not found: {cost_field}")
    out = df.copy()
    out[cost_field] = pd.to_numeric(out[cost_field], errors="coerce").fillna(0.0)
    return out, cost_field


def summarize_dim(df1, df2, dim, cost_field, q1_name, q2_name):
    s1 = df1.groupby(dim, dropna=False)[cost_field].sum()
    s2 = df2.groupby(dim, dropna=False)[cost_field].sum()
    all_idx = s1.index.union(s2.index)
    result = pd.DataFrame({
        q1_name: s1.reindex(all_idx, fill_value=0.0),
        q2_name: s2.reindex(all_idx, fill_value=0.0),
    }).reset_index()
    result[dim] = result[dim].fillna("<NULL>").astype(str)
    result["diff"] = result[q2_name] - result[q1_name]
    result["pct_change"] = result.apply(
        lambda r: None if r[q1_name] == 0 else r["diff"] / r[q1_name], axis=1
    )
    result = result.sort_values("diff", ascending=False)
    return result


def top_changes(table, dim, top_n=10):
    inc = table.sort_values("diff", ascending=False).head(top_n)
    dec = table.sort_values("diff", ascending=True).head(top_n)
    return {
        "top_increase": inc[[dim, table.columns[1], table.columns[2], "diff", "pct_change"]].to_dict(orient="records"),
        "top_decrease": dec[[dim, table.columns[1], table.columns[2], "diff", "pct_change"]].to_dict(orient="records"),
    }


def detect_dims(df, requested=None):
    cols = list(df.columns)
    lower_map = {c.lower(): c for c in cols}
    default_dims = [
        "new_tco_l1", "new_tco_l2", "bg", "function", "geo", "cc_geo",
        "allocation_key", "company_code", "application_name", "application_id",
        "cost_center"
    ]
    dims = requested or default_dims
    actual = []
    for d in dims:
        if d.lower() in lower_map:
            actual.append(lower_map[d.lower()])
    return actual


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python analyze.py <data_dir> [cost_field]")

    data_dir = Path(sys.argv[1])
    cost_field = sys.argv[2] if len(sys.argv) > 2 else "cost"

    files = sorted([p for p in data_dir.iterdir() if p.suffix.lower() in [".xlsx", ".xls"]], key=quarter_key)
    if len(files) < 2:
        raise ValueError("Need at least two Excel files")
    files = files[:2] if len(files) == 2 else sorted(files, key=quarter_key)[:2]

    f1, f2 = files[0], files[1]
    q1_name = re.search(r"q[1-4]", f1.name, flags=re.I).group(0).upper() if re.search(r"q[1-4]", f1.name, flags=re.I) else f1.stem
    q2_name = re.search(r"q[1-4]", f2.name, flags=re.I).group(0).upper() if re.search(r"q[1-4]", f2.name, flags=re.I) else f2.stem

    sheet1, df1 = pick_main_sheet(f1)
    sheet2, df2 = pick_main_sheet(f2)
    df1, cost_field = clean_df(df1, cost_field)
    df2, cost_field = clean_df(df2, cost_field)

    dims = sorted(set(detect_dims(df1) + detect_dims(df2)))

    total1 = float(df1[cost_field].sum())
    total2 = float(df2[cost_field].sum())
    total_diff = total2 - total1
    total_pct = None if total1 == 0 else total_diff / total1

    result = {
        "files": [str(f1), str(f2)],
        "sheets": {str(f1.name): sheet1, str(f2.name): sheet2},
        "quarters": [q1_name, q2_name],
        "cost_field": cost_field,
        "totals": {
            q1_name: total1,
            q2_name: total2,
            "diff": total_diff,
            "pct_change": total_pct,
        },
        "dimensions": {},
    }

    for dim in dims:
        try:
            table = summarize_dim(df1, df2, dim, cost_field, q1_name, q2_name)
            result["dimensions"][dim] = {
                "count_q1": int(df1[dim].nunique(dropna=False)),
                "count_q2": int(df2[dim].nunique(dropna=False)),
                **top_changes(table, dim, top_n=10),
            }
        except Exception as e:
            result["dimensions"][dim] = {"error": str(e)}

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
```

---

### 第 4 步：执行脚本

使用 `bash` 执行，**输出路径指向新创建的文件夹**：

```powershell
python C:/software/excel-data-sample/cost_analysis_20260320/analyze.py C:/software/excel-data-sample cost
```

如果环境中 `python` 不可用，可尝试：

```powershell
py C:/software/excel-data-sample/cost_analysis_20260320/analyze.py C:/software/excel-data-sample cost
```

---

### 第 5 步：分析输出结果

重点分析以下维度：

1. **总费用变化**
   - 比较两个季度总额、差异值、变化率
   - 判断是平稳、小幅波动还是显著变化

2. **TCO 分类维度**
   - `new_tco_l1`
   - `new_tco_l2`
   - 判断增长集中在哪些大类/子类

3. **组织维度**
   - `bg`
   - `function`
   - 重点识别"一个清零、另一个新增且金额接近"的迁移模式

4. **地域维度**
   - `geo`
   - `cc_geo`
   - 判断净增长是否集中在某个区域，如 HQ

5. **分摊规则维度**
   - `allocation_key`
   - 识别用户数、账号数、数据量、license 类型变化

6. **公司与成本中心维度**
   - `company_code`
   - `cost_center`
   - 用于下钻到财务明细排查

7. **应用维度**
   - `application_name`
   - `application_id`
   - 判断具体系统/平台的涨跌情况
   - 注意 `NULL` 值金额占比是否过高

---

### 第 6 步：生成完整报告（Markdown + HTML）

**重要**：读懂 Python 脚本输出的 JSON 数据后，需要：
1. 生成包含**所有维度分析**的完整 Markdown 报告（包括 Cost Center Top 10）
2. 将 Markdown 内容转换为 HTML 格式
3. **输出文件必须存放到 Excel 同目录下的输出文件夹中**

报告结构：
```
1. 分析范围
2. 总体结论
3. 分维度分析
   ├── 3.1 TCO 一级分类
   ├── 3.2 TCO 二级分类
   ├── 3.3 BG（业务群组）
   ├── 3.4 Function（职能部门）
   ├── 3.5 Allocation Key
   ├── 3.6 Application
   ├── 3.7 Geo（地域）
   └── 3.8 Cost Center（成本中心）⭐ 重点
4. 综合判断
5. 建议复核点
```

---

## 注意事项

1. Excel 中可能存在多个 sheet，不要默认取第一个 sheet，要优先选择包含 `cost` 和关键维度字段的主数据 sheet。
2. 维度字段名可能大小写不一致，应做大小写兼容处理。
3. `cost` 字段必须转成数值，异常值按 0 处理。
4. 对于空值维度，应统一显示为 `<NULL>`，防止遗漏。
5. 若出现 `DCG -> ISG`、`旧 function -> 新 function` 这类"一个下降、一个新增且金额接近"的情况，要明确提示可能是组织映射迁移。
6. 若 `application_name` 大量为空，应提示应用映射不完整，影响解释精度。
7. **Windows 环境下不要使用 heredoc，必须先保存 `.py` 文件再执行。**
8. **所有输出文件必须存放到 Excel 同目录下的新建文件夹中，不要散落在其他位置。**
