import json
import base64
from io import BytesIO
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
plt.rcParams['font.family'] = ['DejaVu Sans', 'Arial Unicode MS', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

# 读取JSON
with open(r'C:\Users\zz\Downloads\resource_plan_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

summary = data['summary']

# 生成图表
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('Resource Plan Analysis', fontsize=16, fontweight='bold')

# 图1: Submit vs Confirm by Month/Type
ax1 = axes[0, 0]
categories = ['Feb\nExternal', 'Feb\nInternal', 'Mar\nExternal', 'Mar\nInternal']
submits = [summary['feb_external']['submit'], summary['feb_internal']['submit'],
           summary['mar_external']['submit'], summary['mar_internal']['submit']]
confirms = [summary['feb_external']['confirm'], summary['feb_internal']['confirm'],
            summary['mar_external']['confirm'], summary['mar_internal']['confirm']]
x = range(len(categories))
width = 0.35
bars1 = ax1.bar([i - width/2 for i in x], submits, width, label='Submit', color='#4ECDC4')
bars2 = ax1.bar([i + width/2 for i in x], confirms, width, label='Confirm', color='#FF6B6B')
ax1.set_ylabel('MD')
ax1.set_title('Submit vs Confirm by Month/Type')
ax1.set_xticks(x)
ax1.set_xticklabels(categories)
ax1.legend()
ax1.bar_label(bars1, fmt='%.0f', fontsize=8)
ax1.bar_label(bars2, fmt='%.0f', fontsize=8)

# 图2: 确认率
ax2 = axes[0, 1]
rates = [
    summary['feb_external']['confirm']/summary['feb_external']['submit']*100 if summary['feb_external']['submit'] > 0 else 0,
    summary['feb_internal']['confirm']/summary['feb_internal']['submit']*100 if summary['feb_internal']['submit'] > 0 else 0,
    summary['mar_external']['confirm']/summary['mar_external']['submit']*100 if summary['mar_external']['submit'] > 0 else 0,
    summary['mar_internal']['confirm']/summary['mar_internal']['submit']*100 if summary['mar_internal']['submit'] > 0 else 0,
]
colors = ['#95E1D3' if r >= 95 else '#F38181' for r in rates]
bars = ax2.bar(categories, rates, color=colors)
ax2.axhline(y=95, color='red', linestyle='--', label='95% threshold')
ax2.set_ylabel('Confirmation Rate (%)')
ax2.set_title('Confirmation Rate by Month/Type')
ax2.set_ylim(0, 105)
ax2.bar_label(bars, fmt='%.1f%%', fontsize=9)
ax2.legend()

# 图3: Feb External Top 10 Gap
ax3 = axes[1, 0]
feb_ext = data['feb_ext_top10']
if feb_ext:
    projects = [p['Project'][:25] + '...' if len(p['Project']) > 25 else p['Project'] for p in feb_ext]
    gaps = [p['Gap'] for p in feb_ext]
    ax3.barh(projects, gaps, color='#FF6B6B')
    ax3.set_xlabel('Gap (MD)')
    ax3.set_title('Feb External: Top 10 Gap')
    ax3.invert_yaxis()

# 图4: Mar External Top 10 Gap
ax4 = axes[1, 1]
mar_ext = data['mar_ext_top10']
if mar_ext:
    projects = [p['Project'][:25] + '...' if len(p['Project']) > 25 else p['Project'] for p in mar_ext]
    gaps = [p['Gap'] for p in mar_ext]
    ax4.barh(projects, gaps, color='#4ECDC4')
    ax4.set_xlabel('Gap (MD)')
    ax4.set_title('Mar External: Top 10 Gap')
    ax4.invert_yaxis()

plt.tight_layout()
buf1 = BytesIO()
plt.savefig(buf1, format='png', dpi=150, bbox_inches='tight')
buf1.seek(0)
chart1_base64 = base64.b64encode(buf1.read()).decode()
plt.close()

# 图表2: Internal对比 + 异常项目
fig2, axes2 = plt.subplots(1, 2, figsize=(14, 6))
fig2.suptitle('Internal Resource Plan & Anomalies', fontsize=14, fontweight='bold')

# 图1: Feb vs Mar Internal Top 10 Gap
ax = axes2[0]
feb_int = data['feb_int_top10']
mar_int = data['mar_int_top10']
if feb_int and mar_int:
    all_projects = list(set([p['Project'][:20] for p in feb_int[:5]] + [p['Project'][:20] for p in mar_int[:5]]))[:8]
    feb_gaps = [next((p['Gap'] for p in feb_int if p['Project'][:20] == proj), 0) for proj in all_projects]
    mar_gaps = [next((p['Gap'] for p in mar_int if p['Project'][:20] == proj), 0) for proj in all_projects]
    x = range(len(all_projects))
    width = 0.35
    ax.barh([i - width/2 for i in x], feb_gaps, width, label='Feb', color='#FF6B6B')
    ax.barh([i + width/2 for i in x], mar_gaps, width, label='Mar', color='#4ECDC4')
    ax.set_yticks(x)
    ax.set_yticklabels(all_projects)
    ax.set_xlabel('Gap (MD)')
    ax.set_title('Internal: Feb vs Mar Top Gaps')
    ax.legend()
    ax.invert_yaxis()

# 图2: 异常项目可视化
ax2 = axes2[1]
anomalies = data['anomalies_mar'][:8]
if anomalies:
    labels = [f"{a['Resource_Plan_Code']}\n{a['Project'][:15]}..." if len(a['Project']) > 15 else f"{a['Resource_Plan_Code']}\n{a['Project']}" for a in anomalies]
    confirms = [a['Confirm'] for a in anomalies]
    colors = ['#F38181' if c <= 0.05 else '#FCE38A' for c in confirms]
    ax2.bar(labels, confirms, color=colors)
    ax2.axhline(y=0.1, color='red', linestyle='--', label='Threshold (0.1 MD)')
    ax2.set_ylabel('Confirm (MD)')
    ax2.set_title('Mar Anomalies (0 < Confirm <= 0.1 MD)')
    ax2.legend()
    plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, ha='right')

plt.tight_layout()
buf2 = BytesIO()
plt.savefig(buf2, format='png', dpi=150, bbox_inches='tight')
buf2.seek(0)
chart2_base64 = base64.b64encode(buf2.read()).decode()
plt.close()

# 生成HTML
html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resource Plan Analysis Report</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; padding: 20px; color: #fff; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ text-align: center; color: #4ECDC4; margin-bottom: 30px; font-size: 2.5em; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }}
        h2 {{ color: #FF6B6B; margin: 25px 0 15px 0; border-left: 4px solid #FF6B6B; padding-left: 15px; font-size: 1.5em; }}
        h3 {{ color: #FCE38A; margin: 15px 0 10px 0; }}
        
        .summary {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }}
        .card {{ background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border-radius: 15px; padding: 25px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }}
        .card h3 {{ font-size: 1em; color: #aaa; margin-bottom: 10px; }}
        .card .value {{ font-size: 2em; font-weight: bold; color: #4ECDC4; }}
        .card .rate {{ font-size: 1.2em; color: #FCE38A; margin-top: 5px; }}
        .card .rate.low {{ color: #FF6B6B; }}
        .card .gap {{ font-size: 0.9em; color: #888; margin-top: 5px; }}
        
        .chart-section {{ background: rgba(255,255,255,0.05); border-radius: 15px; padding: 20px; margin-bottom: 20px; }}
        .chart-section img {{ width: 100%; border-radius: 10px; }}
        
        .low-lights {{ background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 15px; padding: 20px; margin-bottom: 20px; }}
        .low-lights h2 {{ border-left-color: #FF6B6B; }}
        
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; }}
        th {{ background: #4ECDC4; color: #1a1a2e; padding: 12px; text-align: left; font-weight: 600; }}
        td {{ padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }}
        tr:hover {{ background: rgba(255,255,255,0.05); }}
        .rp-code {{ font-family: monospace; color: #FCE38A; font-size: 0.9em; }}
        .confirm-low {{ color: #FF6B6B; font-weight: bold; }}
        .confirm-mid {{ color: #FCE38A; }}
        
        .anomaly-section {{ background: rgba(252,227,138,0.1); border: 1px solid rgba(252,227,138,0.3); border-radius: 15px; padding: 20px; margin-bottom: 20px; }}
        .anomaly-section h2 {{ border-left-color: #FCE38A; color: #FCE38A; }}
        
        .suggestions {{ background: rgba(78,205,196,0.1); border: 1px solid rgba(78,205,196,0.3); border-radius: 15px; padding: 20px; }}
        .suggestions ul {{ margin-left: 20px; }}
        .suggestions li {{ margin: 10px 0; color: #ccc; }}
        .suggestions li strong {{ color: #4ECDC4; }}
        
        .badge {{ display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 0.8em; margin-left: 10px; }}
        .badge-ext {{ background: #4ECDC4; color: #1a1a2e; }}
        .badge-int {{ background: #FCE38A; color: #1a1a2e; }}
        
        .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
        @media (max-width: 900px) {{ .summary {{ grid-template-columns: 1fr 1fr; }} .two-col {{ grid-template-columns: 1fr; }} }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Resource Plan Analysis Report</h1>
        
        <h2>📈 Overall Summary</h2>
        <div class="summary">
            <div class="card">
                <h3>Feb External</h3>
                <div class="value">{summary['feb_external']['confirm']:,.0f} / {summary['feb_external']['submit']:,.0f}</div>
                <div class="rate {"low" if summary['feb_external']['confirm']/summary['feb_external']['submit']*100 < 95 else ""}">{summary['feb_external']['confirm']/summary['feb_external']['submit']*100:.1f}%</div>
                <div class="gap">Gap: {summary['feb_external']['gap']:,.0f} MD</div>
            </div>
            <div class="card">
                <h3>Feb Internal</h3>
                <div class="value">{summary['feb_internal']['confirm']:,.0f} / {summary['feb_internal']['submit']:,.0f}</div>
                <div class="rate {"low" if summary['feb_internal']['confirm']/summary['feb_internal']['submit']*100 < 95 else ""}">{summary['feb_internal']['confirm']/summary['feb_internal']['submit']*100:.1f}%</div>
                <div class="gap">Gap: {summary['feb_internal']['gap']:,.0f} MD</div>
            </div>
            <div class="card">
                <h3>Mar External</h3>
                <div class="value">{summary['mar_external']['confirm']:,.0f} / {summary['mar_external']['submit']:,.0f}</div>
                <div class="rate {"low" if summary['mar_external']['confirm']/summary['mar_external']['submit']*100 < 95 else ""}">{summary['mar_external']['confirm']/summary['mar_external']['submit']*100:.1f}%</div>
                <div class="gap">Gap: {summary['mar_external']['gap']:,.0f} MD</div>
            </div>
            <div class="card">
                <h3>Mar Internal</h3>
                <div class="value">{summary['mar_internal']['confirm']:,.0f} / {summary['mar_internal']['submit']:,.0f}</div>
                <div class="rate {"low" if summary['mar_internal']['confirm']/summary['mar_internal']['submit']*100 < 95 else ""}">{summary['mar_internal']['confirm']/summary['mar_internal']['submit']*100:.1f}%</div>
                <div class="gap">Gap: {summary['mar_internal']['gap']:,.0f} MD</div>
            </div>
        </div>
        
        <div class="chart-section">
            <h2>📊 Charts Analysis</h2>
            <img src="data:image/png;base64,{chart1_base64}" alt="Chart 1">
            <img src="data:image/png;base64,{chart2_base64}" alt="Chart 2" style="margin-top: 20px;">
        </div>
        
        <div class="low-lights">
            <h2>🔴 Low Lights - External Resource Plan Gap Top 10</h2>
            <div class="two-col">
                <div>
                    <h3>February</h3>
                    <table>
                        <tr><th>RP Code</th><th>Project</th><th>Gap (MD)</th></tr>
                        {"".join(f'<tr><td class="rp-code">{p["Resource_Plan_Code"]}</td><td>{p["Project"]}</td><td>{p["Gap"]:.0f}</td></tr>' for p in data['feb_ext_top10'][:10])}
                    </table>
                </div>
                <div>
                    <h3>March</h3>
                    <table>
                        <tr><th>RP Code</th><th>Project</th><th>Gap (MD)</th></tr>
                        {"".join(f'<tr><td class="rp-code">{p["Resource_Plan_Code"]}</td><td>{p["Project"]}</td><td>{p["Gap"]:.0f}</td></tr>' for p in data['mar_ext_top10'][:10])}
                    </table>
                </div>
            </div>
            
            <h3 style="margin-top: 20px;">Internal Resource Plan Gap Top 10</h3>
            <div class="two-col">
                <div>
                    <h3>February</h3>
                    <table>
                        <tr><th>RP Code</th><th>Project</th><th>Gap (MD)</th></tr>
                        {"".join(f'<tr><td class="rp-code">{p["Resource_Plan_Code"]}</td><td>{p["Project"]}</td><td>{p["Gap"]:.0f}</td></tr>' for p in data['feb_int_top10'][:10])}
                    </table>
                </div>
                <div>
                    <h3>March</h3>
                    <table>
                        <tr><th>RP Code</th><th>Project</th><th>Gap (MD)</th></tr>
                        {"".join(f'<tr><td class="rp-code">{p["Resource_Plan_Code"]}</td><td>{p["Project"]}</td><td>{p["Gap"]:.0f}</td></tr>' for p in data['mar_int_top10'][:10])}
                    </table>
                </div>
            </div>
        </div>
        
        <div class="anomaly-section">
            <h2>⚠️ Anomaly Projects (0 < Confirm <= 0.1 MD)</h2>
            <p>These projects have very low confirmation (< 0.1 MD). Please verify budget coverage.</p>
            
            <h3>February ({data["anomalies_feb_count"]} items)</h3>
            <table>
                <tr><th>RP Code</th><th>Project</th><th>Source Type</th><th>Submit (MD)</th><th>Confirm (MD)</th><th>Gap (MD)</th></tr>
                {"".join(f'<tr><td class="rp-code">{p["Resource_Plan_Code"]}</td><td>{p["Project"]}</td><td><span class="badge badge-{"ext" if p["Source_Type"]=="External" else "int"}">{p["Source_Type"]}</span></td><td>{p["Submit"]:.1f}</td><td class="{"confirm-low" if p["Confirm"] <= 0.05 else "confirm-mid"}">{p["Confirm"]:.2f}</td><td>{p["Gap"]:.1f}</td></tr>' for p in data['anomalies_feb'])}
            </table>
            
            <h3>March ({data["anomalies_mar_count"]} items)</h3>
            <table>
                <tr><th>RP Code</th><th>Project</th><th>Source Type</th><th>Submit (MD)</th><th>Confirm (MD)</th><th>Gap (MD)</th></tr>
                {"".join(f'<tr><td class="rp-code">{p["Resource_Plan_Code"]}</td><td>{p["Project"]}</td><td><span class="badge badge-{"ext" if p["Source_Type"]=="External" else "int"}">{p["Source_Type"]}</span></td><td>{p["Submit"]:.1f}</td><td class="{"confirm-low" if p["Confirm"] <= 0.05 else "confirm-mid"}">{p["Confirm"]:.2f}</td><td>{p["Gap"]:.1f}</td></tr>' for p in data['anomalies_mar'])}
            </table>
        </div>
        
        <div class="suggestions">
            <h2>💡 Key Suggestions</h2>
            <ul>
                <li><strong>Employee Agent</strong> (RP25039870): Mar External Gap 24 MD - highest priority to confirm</li>
                <li><strong>System Compliance Budget Initiative</strong>: Multiple RPs with significant gaps in Mar</li>
                <li><strong>CEC IVA Phase II</strong>: 3 RPs with Confirm <= 0.1 MD in Mar, total Submit 35 MD unconfirmed</li>
                <li><strong>SSC US X-DOCK Project</strong>: 4 RPs with Confirm <= 0.1 MD in Mar, total Submit 58 MD</li>
                <li><strong>E2: ISS UKM2.0 FY25, PX & HawkEye</strong>: 3 RPs with Confirm <= 0.1 MD in Mar</li>
            </ul>
        </div>
    </div>
</body>
</html>'''

with open(r'C:\Users\zz\Downloads\resource_plan_report.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('HTML report generated: C:\\Users\\zz\\Downloads\\resource_plan_report.html')
