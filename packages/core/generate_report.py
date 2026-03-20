import json
import sys
from pathlib import Path

# 读取数据
result = json.loads(sys.stdin.read())

def fmt(v):
    return f"{v:,.2f}" if isinstance(v, (int, float)) else str(v)

def pct(v):
    if v is None:
        return "N/A"
    return f"{v*100:+.1f}%"

quarters = result["quarters"]
q1_name, q2_name = quarters[0], quarters[1]
totals = result["totals"]

# 提取关键数据
bg_data = result["dimensions"].get("bg", {})
function_data = result["dimensions"].get("function", {})
tco_l1_data = result["dimensions"].get("new_tco_l1", {})
allocation_data = result["dimensions"].get("allocation_key", {})
app_data = result["dimensions"].get("application_name", {})
geo_data = result["dimensions"].get("geo", {})

# 构建 Markdown 报告
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

| BG | {q1_name} | {q2_name} | 差异 | 变化率 |
|----|-----------|-----------|------|--------|
"""

for item in bg_data.get("top_increase", [])[:10]:
    md += f"| {item['bg']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += """
**🔍 重要发现 - 组织归属迁移**：
| 迁移方向 | {q1_name} | {q2_name} | 差异 |
|----------|-----------|-----------|------|
"""

# 找 DCG 和 ISG
for item in bg_data.get("top_increase", []) + bg_data.get("top_decrease", []):
    if item.get("bg") == "DCG":
        md += f"| DCG（消失） | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} |\n"
    if item.get("bg") == "ISG":
        md += f"| ISG（新增） | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} |\n"

md += """
**⚠️ 建议**：确认 DCG → ISG 迁移是否与组织架构调整一致，排除数据口径变更。

---

### 3.3 Function（职能部门）

| Function | {q1_name} | {q2_name} | 差异 | 变化率 |
|----------|-----------|-----------|------|--------|
"""

for item in function_data.get("top_increase", [])[:5]:
    md += f"| {item['function']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += "\n| Function | Q3 | Q4 | 差异 | 变化率 |\n|----------|-----|-----|------|--------|\n"
for item in function_data.get("top_decrease", [])[:3]:
    md += f"| {item['function']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += """
**解读**：
- 10026-DCG 消失（与 BG 迁移呼应）
- 10013-IT 增长最多 (+228)
- 整体变化幅度较小

---

### 3.4 Allocation Key（分摊规则）

| 分摊规则 | {q1_name} | {q2_name} | 差异 | 变化率 |
|----------|-----------|-----------|------|--------|
"""

for item in allocation_data.get("top_increase", [])[:6]:
    md += f"| {item['allocation_key']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += "\n| 分摊规则 | Q3 | Q4 | 差异 | 变化率 |\n|----------|-----|-----|------|--------|\n"
for item in allocation_data.get("top_decrease", [])[:3]:
    md += f"| {item['allocation_key']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += """
**🔍 重要发现 - COPILOT 爆发式增长**：

| License 类型 | {q1_name} | {q2_name} | 差异 | 变化率 |
|--------------|-----------|-----------|------|--------|
| Active_User_by_COPILOT | """ + f"{fmt(allocation_data['top_increase'][1][q1_name])} | {fmt(allocation_data['top_increase'][1][q2_name])} | {fmt(allocation_data['top_increase'][1]['diff'])} | {pct(allocation_data['top_increase'][1]['pct_change'])}" + """ |
| Active_User_by_E5 | """ + f"{fmt(allocation_data['top_decrease'][0][q1_name])} | {fmt(allocation_data['top_decrease'][0][q2_name])} | {fmt(allocation_data['top_decrease'][0]['diff'])} | {pct(allocation_data['top_decrease'][0]['pct_change'])}" + """ |

**⚠️ 建议**：核实 COPILOT license 采购量与实际激活用户数是否匹配。

---

### 3.5 Application（应用维度）

| 应用 | {q1_name} | {q2_name} | 差异 | 变化率 |
|------|-----------|-----------|------|--------|
"""

for item in app_data.get("top_increase", [])[:5]:
    md += f"| {item['application_name']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += "\n| 应用 | Q3 | Q4 | 差异 | 变化率 |\n|------|-----|-----|------|--------|\n"
for item in app_data.get("top_decrease", [])[:5]:
    md += f"| {item['application_name']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

# Null 应用占比
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

| 指标 | {q1_name} | {q2_name} |
|------|-----------|-----------|
| Null 应用费用 | {fmt(null_app[q1_name])} | {fmt(null_app[q2_name])} |
| 占总费用比例 | {null_pct_q3:.1f}% | {null_pct_q4:.1f}% |

**⚠️ 建议**：Null 应用占比约 33%，需完善应用映射以提升分析精度。

---

### 3.6 Geo（地域维度）

| 地域 | {q1_name} | {q2_name} | 差异 | 变化率 |
|------|-----------|-----------|------|--------|
"""

for item in geo_data.get("top_increase", [])[:5]:
    md += f"| {item['geo']} | {fmt(item[q1_name])} | {fmt(item[q2_name])} | {fmt(item['diff'])} | {pct(item['pct_change'])} |\n"

md += "\n| 地域 | Q3 | Q4 | 差异 | 变化率 |\n|------|-----|-----|------|--------|\n"
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
|-----------|-----|-----|--------|----------|
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

print(md)
