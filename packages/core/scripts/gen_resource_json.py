import pandas as pd
import json
import base64
from io import BytesIO
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
plt.rcParams['font.family'] = ['DejaVu Sans', 'Arial Unicode MS', 'sans-serif']

df = pd.read_excel(r'C:\Users\zz\Downloads\Resource Plan Detail (1).xlsx')
df.columns = df.columns.str.strip()

# 按Resource_Plan_Code、Project、Month、Source_Type汇总
grouped = df.groupby(['Resource_Plan_Code', 'Project', 'Month', 'Source_Type']).agg({
    'Submit': 'sum',
    'Confirm': 'sum',
    'Gap': 'sum'
}).reset_index()

# 总体统计
feb_ext = grouped[(grouped['Month'] == 'Feb') & (grouped['Source_Type'] == 'External')]
feb_int = grouped[(grouped['Month'] == 'Feb') & (grouped['Source_Type'] == 'Internal')]
mar_ext = grouped[(grouped['Month'] == 'Mar') & (grouped['Source_Type'] == 'External')]
mar_int = grouped[(grouped['Month'] == 'Mar') & (grouped['Source_Type'] == 'Internal')]

summary = {
    'feb_external': {'submit': float(feb_ext['Submit'].sum()), 'confirm': float(feb_ext['Confirm'].sum()), 'gap': float(feb_ext['Gap'].sum())},
    'feb_internal': {'submit': float(feb_int['Submit'].sum()), 'confirm': float(feb_int['Confirm'].sum()), 'gap': float(feb_int['Gap'].sum())},
    'mar_external': {'submit': float(mar_ext['Submit'].sum()), 'confirm': float(mar_ext['Confirm'].sum()), 'gap': float(mar_ext['Gap'].sum())},
    'mar_internal': {'submit': float(mar_int['Submit'].sum()), 'confirm': float(mar_int['Confirm'].sum()), 'gap': float(mar_int['Gap'].sum())},
}

# Low Lights Top 10 (按Gap降序)
feb_ext_top10 = feb_ext.nlargest(10, 'Gap')[['Resource_Plan_Code', 'Project', 'Gap']].to_dict('records')
feb_int_top10 = feb_int.nlargest(10, 'Gap')[['Resource_Plan_Code', 'Project', 'Gap']].to_dict('records')
mar_ext_top10 = mar_ext.nlargest(10, 'Gap')[['Resource_Plan_Code', 'Project', 'Gap']].to_dict('records')
mar_int_top10 = mar_int.nlargest(10, 'Gap')[['Resource_Plan_Code', 'Project', 'Gap']].to_dict('records')

# 异常项目：confirm > 0 且 <= 0.1
anomalies_feb = grouped[(grouped['Month'] == 'Feb') & (grouped['Confirm'] > 0) & (grouped['Confirm'] <= 0.1)][
    ['Resource_Plan_Code', 'Project', 'Source_Type', 'Submit', 'Confirm', 'Gap']
].to_dict('records')

anomalies_mar = grouped[(grouped['Month'] == 'Mar') & (grouped['Confirm'] > 0) & (grouped['Confirm'] <= 0.1)][
    ['Resource_Plan_Code', 'Project', 'Source_Type', 'Submit', 'Confirm', 'Gap']
].to_dict('records')

data = {
    'summary': summary,
    'feb_ext_top10': feb_ext_top10,
    'feb_int_top10': feb_int_top10,
    'mar_ext_top10': mar_ext_top10,
    'mar_int_top10': mar_int_top10,
    'anomalies_feb': anomalies_feb,
    'anomalies_mar': anomalies_mar,
    'anomalies_feb_count': len(anomalies_feb),
    'anomalies_mar_count': len(anomalies_mar),
}

# 保存JSON
with open(r'C:\Users\zz\Downloads\resource_plan_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('JSON saved!')
print('\nSummary:')
for k, v in summary.items():
    rate = v['confirm'] / v['submit'] * 100 if v['submit'] > 0 else 0
    print(f"  {k}: submit={v['submit']:.0f}, confirm={v['confirm']:.0f}, gap={v['gap']:.0f}, rate={rate:.1f}%")

print(f'\nAnomalies Feb: {len(anomalies_feb)}, Mar: {len(anomalies_mar)}')
print('\nFeb Top 10 Ext:')
for a in feb_ext_top10[:5]:
    print(f"  {a['Resource_Plan_Code']} | {a['Project']} | Gap={a['Gap']:.0f}")
print('\nMar Top 10 Ext:')
for a in mar_ext_top10[:5]:
    print(f"  {a['Resource_Plan_Code']} | {a['Project']} | Gap={a['Gap']:.0f}")
