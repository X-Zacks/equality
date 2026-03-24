import json
import pandas as pd
from datetime import datetime

# 读取 JSON 文件
with open(r"C:\Users\zz\Desktop\OCR Testing\ocr_results_incremental.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# 构建合同信息列表
contracts = []

for item in data:
    filename = item.get("filename", "")
    content = item.get("content", "")
    page = item.get("page", "")
    
    # 解析 JD 合同
    if "JD_page_" in filename:
        contracts.append({
            "合同编号": "CW2679070-1",
            "基础协议编号": "CW2219441",
            "供应商": "eSOON China Limited",
            "客户": "Lenovo HK Services Ltd",
            "合同类型": "Non-Technical Services Agreement (SOW)",
            "产品/服务": "Genesys Subscription Service",
            "生效日期": "2024-12-31",
            "到期日期": "2025-12-31",
            "续约报价": "$833,617.13",
            "平台": "JD-Voice CC + LI Sales CC",
            "文件来源": filename,
            "页码": page
        })
        continue
    
    # 解析 Splunk 合同 (page_1.png 和 page_2.png)
    if "page_1.png" == filename or "page_2.png" == filename:
        # 只在第一页添加合同信息
        if "page_1.png" == filename:
            contracts.append({
                "合同编号": "CW2568992",
                "基础协议编号": "CW2564504",
                "供应商": "北京信诺时代科技发展有限公司",
                "客户": "联想（北京）有限公司",
                "合同类型": "采购订单 (Splunk Enterprise Term License)",
                "产品/服务": "Splunk Enterprise - Term License with Standard Success Plan",
                "生效日期": "2023-05-01",
                "到期日期": "2026-04-30",
                "合同总价": "¥5,675,604 (含税)",
                "不含税价": "¥5,022,658.41",
                "税额": "¥652,945.59",
                "文件来源": filename,
                "页码": page
            })
        continue
    
    # 解析 Adobe 合同
    if "adobe_page_" in filename:
        # 提取关键信息
        adobe_info = {
            "adobe_page_1.png": {
                "合同编号": "Sales Order (Adobe)",
                "协议类型": "Adobe Enterprise Term License Agreement",
                "产品": "Adobe Experience Cloud Products",
                "签订日期": "Refer to Sales Order"
            }
        }
        info = adobe_info.get(filename, {})
        contracts.append({
            "合同编号": info.get("合同编号", "Adobe Agreement"),
            "协议类型": info.get("协议类型", "Adobe Support Services Agreement"),
            "供应商": "Adobe",
            "客户": "Lenovo",
            "合同类型": "EXHIBIT A & B - PSLT & Support Services",
            "产品/服务": info.get("产品", "Adobe Experience Manager: Cloud Service, Creative Cloud, etc."),
            "文件来源": filename,
            "页码": page
        })

# 创建 DataFrame
df = pd.DataFrame(contracts)

# 保存为 Excel（多个 Sheet）
output_path = r"C:\Users\zz\Desktop\OCR Testing\合同信息汇总.xlsx"

with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
    # Sheet 1: 合同汇总
    df_summary = df[["合同编号", "供应商", "客户", "合同类型", "产品/服务", "生效日期", "到期日期", "续约报价", "合同总价"]]
    df_summary.to_excel(writer, sheet_name="合同汇总", index=False)
    
    # Sheet 2: JD 合同明细
    df_jd = df[df["文件来源"].str.contains("JD", na=False)]
    if not df_jd.empty:
        df_jd.to_excel(writer, sheet_name="JD合同明细", index=False)
    
    # Sheet 3: Adobe 合同明细
    df_adobe = df[df["文件来源"].str.contains("adobe", na=False)]
    if not df_adobe.empty:
        df_adobe.to_excel(writer, sheet_name="Adobe合同明细", index=False)
    
    # Sheet 4: Splunk 合同明细
    df_splunk = df[df["文件来源"].str.contains("page_", na=False)]
    if not df_splunk.empty:
        df_splunk.to_excel(writer, sheet_name="Splunk合同明细", index=False)
    
    # Sheet 5: 完整数据
    df.to_excel(writer, sheet_name="完整数据", index=False)

print(f"Excel 文件已生成: {output_path}")
print(f"\n合同汇总:")
print(df_summary.to_string(index=False))
