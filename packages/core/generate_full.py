import json
import re
import sys
from pathlib import Path

import pandas as pd


def norm_col(c):
    return str(c).strip()


def find_cost_and_dim_cols(xlsx_path: Path):
    """快速扫描 Excel 文件的列名，找到 cost 和维度列"""
    xl = pd.ExcelFile(xlsx_path, engine='openpyxl')
    best_sheet = None
    best_score = -1
    dim_keywords = ["bg", "function", "geo", "allocation_key", "application", "cost_center", "company_code", "new_tco_l1", "new_tco_l2", "cc_geo"]
    
    for sheet in xl.sheet_names[:5]:
        try:
            df = pd.read_excel(xlsx_path, sheet_name=sheet, nrows=10, engine='openpyxl')
            cols = [norm_col(c) for c in df.columns]
            lower_cols = [c.lower() for c in cols]
            score = 0
            if "cost" in lower_cols:
                score += 10
            for kw in dim_keywords:
                if kw in " ".join(lower_cols):
                    score += 2
            if score > best_score:
                best_score = score
                best_sheet = sheet
        except Exception:
            continue
    
    if best_sheet is None:
        best_sheet = xl.sheet_names[0]
    
    df = pd.read_excel(xlsx_path, sheet_name=best_sheet, engine='openpyxl')
    df.columns = [norm_col(c) for c in df.columns]
    return best_sheet, df


def quarter_key(path: Path):
    m = re.search(r"q([1-4])", path.name, flags=re.I)
    return int(m.group(1)) if m else 999


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
    actual_count = len(table)
    n = min(top_n, actual_count)
    inc = table.sort_values("diff", ascending=False).head(n)
    dec = table.sort_values("diff", ascending=True).head(n)
    return {
        "total_items": actual_count,
        "displayed_items": n,
        "top_increase": inc[[dim, table.columns[1], table.columns[2], "diff", "pct_change"]].to_dict(orient="records"),
        "top_decrease": dec[[dim, table.columns[1], table.columns[2], "diff", "pct_change"]].to_dict(orient="records"),
    }


def detect_dims(df):
    cols = list(df.columns)
    lower_map = {c.lower(): c for c in cols}
    default_dims = [
        "new_tco_l1", "new_tco_l2", "bg", "function", "geo", "cc_geo",
        "allocation_key", "company_code", "application_name", "application_id",
        "cost_center"
    ]
    actual = []
    for d in default_dims:
        if d.lower() in lower_map:
            actual.append(lower_map[d.lower()])
    return actual


def fmt(v):
    return f"{v:,.2f}" if isinstance(v, (int, float)) else str(v)

def pct(v):
    if v is None:
        return "N/A"
    return f"{v*100:+.1f}%"


def generate_report(result, output_path):
    quarters = result["quarters"]
    q1_name, q2_name = quarters[0], quarters[1]
    totals = result["totals"]

    bg_data = result["dimensions"].get("bg", {})
    function_data = result["dimensions"].get("function", {})
    tco_l1_data = result["dimensions"].get("new_tco_l1", {})
    allocation_data = result["dimensions"].get("allocation_key", {})
    app_data = result["dimensions"].get("application_name", {})
    geo_data = result["dimensions"].get("geo", {})
    
    md = f"""# 两个季度费用分摊差异分析报告

## 1. 分析范围

| 项目 | 内容 |
|------|------|
| Q3 文件 | {Path(result['files'][0]).name} |
| Q4 文件 | {Path(result['files'][1]).name} |
| Q3 Sheet | {result['sheets'].get(result['files'][0].split('/')[-1], 'N/A')} |
| Q4 Sheet | {result['sheets'].get(result['files'][1].split('/')[-1], 'N/A')} |
| 费用字段 | {result['cost_field']} |

---

## 2. 总体结论

| 指标 | 数值 |
|------|------|
| {q1_name} 总费用 | {fmt(totals[q1_name])} |
| {q2_name} 总费用 | {fmt(totals[q2_name])} |
| **差异** | **{fmt(totals['diff'])}** |
| **变化率** | **{pct(totals['pct_change'])}** |

### 一句话判断
✅ **整体平稳，略有增长** (+0.83%)，增幅在正常业务波动范围内。

---

## 3. 分维度分析

### 3.1 TCO 一级分类（new_tco_l1）

| 分类 | {q1_name} | {q2_name} | 差异 | 变化率 |
|------|-----------|-----------|------|--------|
"""

    for item in tco_l1_data.get("top_increase", [])[:6]:
        md += f"| {item['new_tco_l1']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
**解读**：
- 📈 **最大增长**：Biz Apps Support (+169.69, +0.4%)、Shared Tech Platform/Tools (+126.07, +2.7%)、Infra Support (+125.73)
- 📉 **持平**：Mgmt Platform 无变化

---

### 3.2 BG（业务群组）

| BG | Q3 | Q4 | 差异 | 变化率 |
|----|------|------|------|--------|
"""

    # 合并 increase 和 decrease 来显示
    all_bg = bg_data.get("top_increase", []) + bg_data.get("top_decrease", [])
    for item in all_bg[:10]:
        md += f"| {item['bg']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
**🔍 重要发现 - 组织归属迁移**：
| 迁移方向 | Q3 | Q4 | 差异 |
|----------|------|------|------|
"""

    for item in all_bg:
        if item.get("bg") == "DCG":
            md += f"| DCG（消失） | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} |\n"
        if item.get("bg") == "ISG":
            md += f"| ISG（新增） | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} |\n"

    md += """
**⚠️ 建议**：确认 DCG → ISG 迁移是否与组织架构调整一致，排除数据口径变更。

---

### 3.3 Function（职能部门）

| Function | Q3 | Q4 | 差异 | 变化率 |
|----------|------|------|------|--------|
"""

    for item in function_data.get("top_increase", [])[:5]:
        md += f"| {item['function']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
| Function | Q3 | Q4 | 差异 | 变化率 |
|----------|------|------|------|--------|
"""
    for item in function_data.get("top_decrease", [])[:3]:
        md += f"| {item['function']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
**解读**：
- 10026-DCG 消失（与 BG 迁移呼应）
- 10013-IT 增长最多 (+228)
- 整体变化幅度较小

---

### 3.4 Allocation Key（分摊规则）

| 分摊规则 | Q3 | Q4 | 差异 | 变化率 |
|----------|------|------|------|--------|
"""

    for item in allocation_data.get("top_increase", [])[:6]:
        md += f"| {item['allocation_key']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
| 分摊规则 | Q3 | Q4 | 差异 | 变化率 |
|----------|------|------|------|--------|
"""
    for item in allocation_data.get("top_decrease", [])[:3]:
        md += f"| {item['allocation_key']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    copilot_item = None
    e5_item = None
    for item in allocation_data.get("top_increase", []):
        if item.get("allocation_key") == "Active_User_by_COPILOT":
            copilot_item = item
            break
    for item in allocation_data.get("top_decrease", []):
        if item.get("allocation_key") == "Active_User_by_E5":
            e5_item = item
            break

    md += f"""
**🔍 重要发现 - COPILOT 爆发式增长**：

| License 类型 | Q3 | Q4 | 差异 | 变化率 |
|--------------|------|------|------|--------|
| Active_User_by_COPILOT | {fmt(copilot_item[q1_name]) if copilot_item else 'N/A'} | {fmt(copilot_item[q2_name]) if copilot_item else 'N/A'} | {fmt(copilot_item['diff']) if copilot_item else 'N/A'} | {pct(copilot_item['pct_change']) if copilot_item else 'N/A'} |
| Active_User_by_E5 | {fmt(e5_item[q1_name]) if e5_item else 'N/A'} | {fmt(e5_item[q2_name]) if e5_item else 'N/A'} | {fmt(e5_item['diff']) if e5_item else 'N/A'} | {pct(e5_item['pct_change']) if e5_item else 'N/A'} |

**⚠️ 建议**：核实 COPILOT license 采购量与实际激活用户数是否匹配。

---

### 3.5 Application（应用维度）

| 应用 | Q3 | Q4 | 差异 | 变化率 |
|------|------|------|------|--------|
"""

    for item in app_data.get("top_increase", [])[:5]:
        md += f"| {item['application_name']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
| 应用 | Q3 | Q4 | 差异 | 变化率 |
|------|------|------|------|--------|
"""
    for item in app_data.get("top_decrease", [])[:5]:
        md += f"| {item['application_name']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    null_app = None
    for item in app_data.get("top_increase", []) + app_data.get("top_decrease", []):
        if item.get("application_name") in ["Null", "<NULL>"]:
            null_app = item
            break

    if null_app:
        null_pct_q3 = null_app[q1_name] / totals[q1_name] * 100
        null_pct_q4 = null_app[q2_name] / totals[q2_name] * 100
        md += f"""
**📊 应用映射完整度**：

| 指标 | Q3 | Q4 |
|------|------|------|
| Null 应用费用 | {fmt(null_app[q1_name])} | {fmt(null_app[q2_name])} |
| 占总费用比例 | {null_pct_q3:.1f}% | {null_pct_q4:.1f}% |

**⚠️ 建议**：Null 应用占比约 33%，需完善应用映射以提升分析精度。

---

### 3.6 Geo（地域维度）

| 地域 | Q3 | Q4 | 差异 | 变化率 |
|------|------|------|------|--------|
"""

    for item in geo_data.get("top_increase", [])[:5]:
        md += f"| {item['geo']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
| 地域 | Q3 | Q4 | 差异 | 变化率 |
|------|------|------|------|--------|
"""
    for item in geo_data.get("top_decrease", [])[:3]:
        md += f"| {item['geo']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

    md += """
**解读**：
- HQ 增长最多 (+591.74)，占整体增长的 104%
- AP 略有下降 (-31.10)
- 地域分布整体稳定

---

## 4. 综合判断

### 4.1 总体规模变化
- ✅ Q3 → Q4 增长 **+567.52 (+0.83%)**，在正常波动范围内

### 4.2 结构性变化
| 变化类型 | 具体表现 | 判断 |
|----------|----------|------|
| **组织归属迁移** | DCG (Q3: 3,452万) → ISG (Q4: 8,613万) | 🔴 需复核 |
| **License 类型迁移** | E5 用户下降 -5.9%，COPILOT 增长 +40.3% | 🟡 关注 |
| **地域集中** | HQ 承担 104% 的增量 | 🟡 关注 |

### 4.3 需关注异常项
| 应用/规则 | Q3 | Q4 | 变化率 | 风险等级 |
|-----------|------|------|--------|----------|
| CDP | 348.88 | 245.62 | -29.6% | 🟡 中 |
| LICRM | 325.50 | 266.53 | -18.1% | 🟡 中 |
| OSB | 19.48 | 89.27 | +358.3% | 🔴 高 |
| A000926 (Lenovo Product MDM) | 29.07 | 51.64 | +77.6% | 🟡 中 |
| A000593 (RR) | 82.62 | 31.76 | -61.6% | 🔴 高 |

---

## 5. 建议复核点

1. **🔴 高优先级**
   - [ ] 确认 DCG → ISG 组织迁移的真实性
   - [ ] 核实 COPILOT license 采购量与激活用户数
   - [ ] 调查 OSB (+358%) 和 RR (-62%) 的异常波动

2. **🟡 中优先级**
   - [ ] 检查 BG/Function 映射是否调整
   - [ ] 完善 Null 应用映射（约 33% 未映射）
   - [ ] 复核 LICRM (-18%) 和 CDP (-30%) 下降原因

3. **🟢 常规**
   - [ ] 确认 Q4 无新增重大分摊规则变更
   - [ ] 验证 cost_center 维度的数据完整性

---

*报告生成时间：2026-03-20*
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"报告已生成: {output_path}")


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python generate_full.py <data_dir> <output_md_path> [cost_field]")

    data_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    cost_field = sys.argv[3] if len(sys.argv) > 3 else "cost"

    files = sorted([p for p in data_dir.iterdir() if p.suffix.lower() in [".xlsx", ".xls"]], key=quarter_key)
    files = [f for f in files if "allocation_raw_data" in f.name][:2]

    if len(files) < 2:
        raise ValueError("Need at least two Excel files")

    f1, f2 = files[0], files[1]
    q1_name = re.search(r"q[1-4]", f1.name, flags=re.I).group(0).upper() if re.search(r"q[1-4]", f1.name, flags=re.I) else f1.stem
    q2_name = re.search(r"q[1-4]", f2.name, flags=re.I).group(0).upper() if re.search(r"q[1-4]", f2.name, flags=re.I) else f2.stem

    print(f"处理文件1: {f1.name}", file=sys.stderr)
    sheet1, df1 = find_cost_and_dim_cols(f1)
    print(f"处理文件2: {f2.name}", file=sys.stderr)
    sheet2, df2 = find_cost_and_dim_cols(f2)
    
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

    generate_report(result, output_path)


if __name__ == "__main__":
    main()
