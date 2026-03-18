---
name: excel-cost-diff-analysis
description: 对两个季度的费用分摊 Excel 表按多维度汇总对比，分析 cost 差异及结构变化
tools:
  - bash
  - write_file
  - read_file
  - list_dir
  - glob
  - grep
  - edit_file
equality:
  auto-generated: true
  source-model: gpt-5.4
  created: 2026-03-15
---

# Excel 两季度费用差异分析 Skill

## 任务说明

用于分析同一主题下两个不同季度（或两个不同期间）的费用分摊 Excel 文件，识别总费用变化、结构变化以及主要驱动因素。

默认业务口径：
- `cost` 为费用字段
- 两个 Excel 分别代表两个季度或两个期间
- 输出按多个维度汇总的差异分析结论

适用于：
- 财务分摊分析
- IT 成本分析
- 季度费用波动复盘
- 给管理层输出费用差异摘要

---

## 参数

| 参数 | 说明 | 是否必填 | 示例 |
|---|---|---:|---|
| folder_path | Excel 文件所在目录 | 是 | `C:\software\excel-data-sample` |
| file_a | 第一个期间文件名，通常为上期 | 否 | `allocation_raw_data_fy2526_q3.xlsx` |
| file_b | 第二个期间文件名，通常为本期 | 否 | `allocation_raw_data_fy2526_q4.xlsx` |
| cost_field | 费用字段名 | 否 | `cost` |
| dimensions | 需要分析的维度列表 | 否 | `new_tco_l1,new_tco_l2,bg,function,geo,allocation_key,company_code` |
| output_style | 输出风格：摘要/明细/管理层汇报 | 否 | `管理层汇报` |

说明：
- 如果未显式提供 `file_a` 和 `file_b`，先从目录中识别最相关的两个 Excel 文件。
- 如果未提供 `dimensions`，优先分析常见业务维度以及表中实际存在的关键字段。

---

## 执行步骤

> **⚠️ 重要：Windows 执行规则**
> 1. 不要用 heredoc（`<<EOF`）传递 Python 代码，PowerShell 不支持
> 2. 正确做法：先用 `write_file` 把 Python 脚本保存为 `.py` 文件，再用 `bash` 执行 `python script.py`
> 3. Python 脚本中的中文字符串使用 UTF-8 编码
> 4. 执行命令示例：`python C:/software/excel-data-sample/analyze.py`

### 1. 识别输入文件

1. 列出目标目录中的 Excel 文件（`.xlsx`、`.xls`）。
2. 根据文件名中的季度、月份、时间戳或用户说明，确定需要对比的两个文件。
3. 如有多个候选文件，优先选择：
   - 文件名最接近用户主题
   - 期间最连续的两个版本
   - 同类命名规则的两份文件

### 2. 读取和检查数据结构

1. 读取两个 Excel 的工作表结构和字段名。
2. 确认以下信息：
   - `cost` 字段是否存在
   - 是否存在可用于维度分析的字段，如：
     - `new_tco_l1`
     - `new_tco_l2`
     - `bg`
     - `function`
     - `geo`
     - `cc_geo`
     - `allocation_key`
     - `company_code`
     - `application_name`
     - `application_id`
3. 检查是否存在空值、格式异常、数字字段为文本等问题。

### 3. 数据清洗

1. 将 `cost` 转换为数值。
2. 对维度字段做基础标准化：
   - 去除首尾空格
   - 保留空值但可统一标记为“空值/缺失”
3. 如果一个文件包含多个 sheet：
   - 优先使用主数据 sheet
   - 必要时根据行数、字段完整性判断主表

### 4. 计算总体差异

1. 计算两个期间的总费用：
   - `total_a`
   - `total_b`
2. 计算：
   - 绝对差异 = `total_b - total_a`
   - 环比变化率 = `(total_b - total_a) / total_a`
3. 先给出整体结论，判断是上升、下降还是基本持平。

### 5. 按维度汇总分析

对每个分析维度分别执行：

1. 按维度汇总两个期间的 `cost`。
2. 做外连接对比，缺失值按 0 处理。
3. 计算每个维度值的：
   - 上期费用
   - 本期费用
   - 差异值
   - 变化率
4. 识别：
   - 增长最大的项目
   - 下降最大的项目
   - 新增项目（上期为 0，本期 > 0）
   - 消失项目（上期 > 0，本期为 0）
5. 提炼业务解释，判断是：
   - 真实费用增长
   - 组织归属迁移
   - 分摊规则变化
   - 数据口径变化

### 6. 输出重点洞察

至少总结以下内容：

1. **整体费用变化**：总额、差额、变化率。
2. **结构变化最明显的维度**：例如 BG、Function、TCO 分类。
3. **真正拉动增长的维度**：例如 HQ、平台类费用、某类 allocation key。
4. **可能的口径变化线索**：例如某个组织清零、另一个组织同步新增。
5. **建议复核点**：给业务或财务进一步排查的方向。

### 7. 如用户需要，继续下钻

可继续下钻到：
- `application_name`
- `application_id`
- `cost_center`
- `vendor`
- `service_category`
- 任何表中存在且对解释波动有帮助的字段

目标是定位“哪些具体应用/对象”造成差异。

---

## 输出模板

### 简版结论模板

```markdown
## 整体结论
- 上期总费用：...
- 本期总费用：...
- 差异：...
- 变化率：...

## 主要增长来源
- 维度A：...
- 维度B：...
- 维度C：...

## 主要下降或迁移来源
- 维度X：...
- 维度Y：...

## 初步判断
- 整体变化主要由 ... 驱动
- 存在 ... 口径调整/组织迁移迹象

## 建议复核
1. ...
2. ...
3. ...
```

### 管理层汇报模板

```markdown
## 一、整体结论
说明总费用是上升还是下降，幅度多少。

## 二、按核心维度分析
分别概述 TCO、BG、Function、Geo、Allocation Key 等维度的主要变化。

## 三、关键结构变化
指出新增、清零、迁移最明显的项目，并说明可能含义。

## 四、综合判断
总结费用差异的主要原因：真实增长、归属变化、规则变化等。

## 五、后续建议
列出建议进一步核查的字段、对象和业务问题。
```

---

## 脚本模板

下面给出一个可复用的 Python 脚本模板，用于读取两个 Excel 并生成多维度差异分析。

```python
import pandas as pd
from pathlib import Path

folder = Path(r"C:\software\excel-data-sample")
file_a = folder / "q3.xlsx"
file_b = folder / "q4.xlsx"
cost_field = "cost"

dimensions = [
    "new_tco_l1",
    "new_tco_l2",
    "bg",
    "function",
    "geo",
    "cc_geo",
    "allocation_key",
    "company_code",
]


def load_excel(path: Path) -> pd.DataFrame:
    xls = pd.ExcelFile(path)
    # 默认取第一个 sheet，可按实际改成更智能的主表识别
    df = pd.read_excel(path, sheet_name=xls.sheet_names[0])
    df.columns = [str(c).strip() for c in df.columns]
    if cost_field not in df.columns:
        raise ValueError(f"{path.name} 缺少费用字段: {cost_field}")
    df[cost_field] = pd.to_numeric(df[cost_field], errors="coerce").fillna(0)
    return df


def compare_dimension(df_a, df_b, dim, cost_field="cost"):
    a = df_a.copy()
    b = df_b.copy()
    if dim not in a.columns and dim not in b.columns:
        return None
    if dim not in a.columns:
        a[dim] = "空值/缺失"
    if dim not in b.columns:
        b[dim] = "空值/缺失"

    a[dim] = a[dim].fillna("空值/缺失").astype(str).str.strip()
    b[dim] = b[dim].fillna("空值/缺失").astype(str).str.strip()

    sa = a.groupby(dim, dropna=False)[cost_field].sum().reset_index(name="cost_a")
    sb = b.groupby(dim, dropna=False)[cost_field].sum().reset_index(name="cost_b")

    merged = sa.merge(sb, on=dim, how="outer").fillna(0)
    merged["diff"] = merged["cost_b"] - merged["cost_a"]
    merged["pct"] = merged.apply(
        lambda r: None if r["cost_a"] == 0 else r["diff"] / r["cost_a"],
        axis=1,
    )
    return merged.sort_values("diff", ascending=False)


df_a = load_excel(file_a)
df_b = load_excel(file_b)

total_a = df_a[cost_field].sum()
total_b = df_b[cost_field].sum()
print("上期总费用:", total_a)
print("本期总费用:", total_b)
print("差异:", total_b - total_a)
print("变化率:", (total_b - total_a) / total_a if total_a else None)

for dim in dimensions:
    if dim in df_a.columns or dim in df_b.columns:
        result = compare_dimension(df_a, df_b, dim, cost_field)
        print(f"\n===== {dim} =====")
        print(result.head(10).to_string(index=False))
        print("---- 下降最大 ----")
        print(result.sort_values("diff").head(10).to_string(index=False))
```

---

## 使用建议

- 如果用户只说“分析两个季度费用差异”，优先按高复用维度自动分析。
- 如果发现某个维度有“一个值清零、另一个值新增且金额接近”，应重点提示可能存在**组织归属迁移**。
- 如果 `allocation_key` 波动大，应提示可能存在**分摊规则或驱动因子变化**。
- 如果 `geo` 或 `HQ` 集中增长，应提示可能是**总部平台费用上涨**。
- 输出面向管理层时，结论优先于明细，先讲总体变化和核心原因，再列明细。
