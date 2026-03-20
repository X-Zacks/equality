import json
import subprocess
import sys
from pathlib import Path

def main():
    data_dir = "C:/software/excel-data-sample"
    
    print("=" * 60)
    print("Step 1: 运行主数据分析（跳过 cost_center）...")
    print("=" * 60)
    
    # 运行主数据分析脚本
    result = subprocess.run(
        [sys.executable, "tmp_excel_cost_diff.py", data_dir, "cost"],
        capture_output=True,
        text=True,
        cwd="C:/software/equality/packages/core",
        timeout=600
    )
    
    if result.returncode != 0:
        print("ERROR:", result.stderr)
        sys.exit(1)
    
    main_data = json.loads(result.stdout)
    
    # 删除 cost_center 维度（我们会单独处理）
    if "cost_center" in main_data.get("dimensions", {}):
        del main_data["dimensions"]["cost_center"]
    
    print("主数据获取成功!")
    print(f"  - 文件: {main_data['files']}")
    print(f"  - 季度: {main_data['quarters']}")
    print(f"  - 维度: {list(main_data['dimensions'].keys())}")
    
    print()
    print("=" * 60)
    print("Step 2: 运行 cost_center 分析...")
    print("=" * 60)
    
    # 运行 cost_center 分析脚本
    cc_result = subprocess.run(
        [sys.executable, "tmp_cc_analysis_v3.py"],
        capture_output=True,
        text=True,
        cwd="C:/software/equality/packages/core",
        timeout=600
    )
    
    if cc_result.returncode != 0:
        print("ERROR:", cc_result.stderr)
        sys.exit(1)
    
    cc_data = json.loads(cc_result.stdout)
    
    print("Cost Center 数据获取成功!")
    print(f"  - 总成本中心数: {cc_data['total_cost_centers']}")
    print(f"  - Top 增长: {len(cc_data['top_increase'])} 条")
    print(f"  - Top 下降: {len(cc_data['top_decrease'])} 条")
    
    # 合并 cost_center 数据
    main_data["dimensions"]["cost_center"] = cc_data
    
    print()
    print("=" * 60)
    print("Step 3: 生成报告...")
    print("=" * 60)
    
    # 生成报告
    report_result = subprocess.run(
        [sys.executable, "generate_full_report.py"],
        input=json.dumps(main_data),
        capture_output=True,
        text=True,
        cwd="C:/software/equality/packages/core",
        timeout=60
    )
    
    if report_result.returncode != 0:
        print("ERROR:", report_result.stderr)
        sys.exit(1)
    
    md_content = report_result.stdout
    
    # 保存 Markdown 报告
    md_path = Path(data_dir) / "cost_diff_report.md"
    md_path.write_text(md_content, encoding="utf-8")
    print(f"Markdown 报告已保存: {md_path}")
    
    # 生成 HTML
    print()
    print("=" * 60)
    print("Step 4: 生成 HTML 报告...")
    print("=" * 60)
    
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>费用分摊差异分析报告 - Q3 vs Q4</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f7fa; }}
        .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3); }}
        .header h1 {{ font-size: 2em; margin-bottom: 10px; }}
        .header p {{ opacity: 0.9; }}
        .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .card {{ background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
        .card h3 {{ color: #667eea; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }}
        .card .value {{ font-size: 1.8em; font-weight: bold; color: #333; }}
        .card .sub {{ font-size: 0.85em; color: #888; margin-top: 4px; }}
        .card.highlight {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }}
        .card.highlight h3 {{ color: rgba(255,255,255,0.8); }}
        .card.highlight .value {{ color: white; }}
        .card.highlight .sub {{ color: rgba(255,255,255,0.7); }}
        .section {{ background: white; border-radius: 12px; padding: 30px; margin-bottom: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
        .section h2 {{ color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 12px; margin-bottom: 20px; font-size: 1.3em; }}
        .section h3 {{ color: #764ba2; margin: 20px 0 12px; font-size: 1.1em; }}
        table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
        th, td {{ padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }}
        th {{ background: #f8f9fa; font-weight: 600; color: #555; }}
        tr:hover {{ background: #f8f9fa; }}
        .tag {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 500; }}
        .tag.red {{ background: #fee; color: #c33; }}
        .tag.green {{ background: #efe; color: #3c3; }}
        .tag.yellow {{ background: #ffe; color: #a63; }}
        .tag.blue {{ background: #eef; color: #36f; }}
        .alert {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 4px; margin: 16px 0; }}
        .alert.info {{ background: #d1ecf1; border-color: #17a2b8; }}
        .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: bold; }}
        .badge.up {{ background: #d4edda; color: #155724; }}
        .badge.down {{ background: #f8d7da; color: #721c24; }}
        .toc {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 24px; }}
        .toc h4 {{ margin-bottom: 12px; color: #667eea; }}
        .toc ul {{ list-style: none; }}
        .toc li {{ padding: 6px 0; }}
        .toc a {{ color: #667eea; text-decoration: none; }}
        .toc a:hover {{ text-decoration: underline; }}
        .footer {{ text-align: center; padding: 30px; color: #888; font-size: 0.9em; }}
        @media (max-width: 768px) {{ .summary {{ grid-template-columns: 1fr; }} table {{ font-size: 0.85em; }} }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 两个季度费用分摊差异分析报告</h1>
            <p>Q3 vs Q4 | 全面分析费用变化、结构性迁移与异常波动</p>
        </div>
        
        <div class="toc">
            <h4>📑 目录</h4>
            <ul>
                <li><a href="#scope">1. 分析范围</a></li>
                <li><a href="#summary">2. 总体结论</a></li>
                <li><a href="#dimensions">3. 分维度分析</a></li>
                <li><a href="#judgment">4. 综合判断</a></li>
                <li><a href="#action">5. 建议复核点</a></li>
            </ul>
        </div>
        
        <div class="summary">
            <div class="card">
                <h3>Q3 总费用</h3>
                <div class="value">{main_data['totals'][main_data['quarters'][0]]:,.2f}</div>
            </div>
            <div class="card">
                <h3>Q4 总费用</h3>
                <div class="value">{main_data['totals'][main_data['quarters'][1]]:,.2f}</div>
            </div>
            <div class="card highlight">
                <h3>差异</h3>
                <div class="value">+{main_data['totals']['diff']:,.2f}</div>
                <div class="sub">变化率: +{main_data['totals']['pct_change']*100:.2f}%</div>
            </div>
        </div>
        
        <div class="section" id="scope">
            <h2>1. 分析范围</h2>
            <table>
                <tr><th>项目</th><th>内容</th></tr>
                <tr><td>Q3 文件</td><td>{Path(main_data['files'][0]).name}</td></tr>
                <tr><td>Q4 文件</td><td>{Path(main_data['files'][1]).name}</td></tr>
            </table>
        </div>
        
        <div class="section" id="summary">
            <h2>2. 总体结论</h2>
            <div class="alert info">
                <strong>✅ 一句话判断：</strong>整体平稳，略有增长 (+0.83%)，增幅在正常业务波动范围内。
            </div>
        </div>
        
        <div class="section" id="dimensions">
            <h2>3. 分维度分析</h2>
            
            <h3>3.1 TCO 一级分类</h3>
            <table>
                <tr><th>分类</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    # 填充 TCO 数据
    for item in main_data['dimensions'].get('new_tco_l1', {}).get('top_increase', [])[:6]:
        pct_val = f"+{item['pct_change']*100:.1f}%" if item.get('pct_change') else "N/A"
        md += f"| {item['new_tco_l1']} | {item[main_data['quarters'][0]]:,.2f} | {item[main_data['quarters'][1]]:,.2f} | {item['diff']:,.2f} | {pct_val} |\n"
        badge_class = "up" if item.get('pct_change', 0) > 0 else "down"
        html_content += f"""                <tr><td>{item['new_tco_l1']}</td><td>{item[main_data['quarters'][0]]:,.2f}</td><td>{item[main_data['quarters'][1]]:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            
            <h3>3.2 BG（业务群组）</h3>
            <table>
                <tr><th>BG</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    # 填充 BG 数据
    for item in main_data['dimensions'].get('bg', {}).get('top_increase', [])[:10]:
        pct_val = f"+{item['pct_change']*100:.1f}%" if item.get('pct_change') else "N/A"
        badge_class = "up" if item.get('pct_change', 0) > 0 else "down"
        html_content += f"""                <tr><td>{item['bg']}</td><td>{item[main_data['quarters'][0]]:,.2f}</td><td>{item[main_data['quarters'][1]]:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            <div class="alert">
                <strong>🔍 重要发现 - 组织归属迁移：</strong>DCG（Q3: 3,452万）→ ISG（Q4: 8,613万），疑似组织架构调整，建议确认迁移真实性。
            </div>
            
            <h3>3.3 Function（职能部门）</h3>
            <table>
                <tr><th>Function</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    for item in main_data['dimensions'].get('function', {}).get('top_increase', [])[:5]:
        pct_val = f"+{item['pct_change']*100:.1f}%" if item.get('pct_change') else "N/A"
        badge_class = "up" if item.get('pct_change', 0) > 0 else "down"
        html_content += f"""                <tr><td>{item['function']}</td><td>{item[main_data['quarters'][0]]:,.2f}</td><td>{item[main_data['quarters'][1]]:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            
            <h3>3.4 Allocation Key（分摊规则）</h3>
            <table>
                <tr><th>分摊规则</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    for item in main_data['dimensions'].get('allocation_key', {}).get('top_increase', [])[:6]:
        pct_val = f"+{item['pct_change']*100:.1f}%" if item.get('pct_change') else "N/A"
        badge_class = "up" if item.get('pct_change', 0) > 0 else "down"
        html_content += f"""                <tr><td>{item['allocation_key']}</td><td>{item[main_data['quarters'][0]]:,.2f}</td><td>{item[main_data['quarters'][1]]:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            <div class="alert">
                <strong>🔍 重要发现 - COPILOT 爆发式增长：</strong>COPILOT +40.3%，E5 -5.9%，建议核实 license 采购量与激活用户数是否匹配。
            </div>
            
            <h3>3.5 Application（应用维度）</h3>
            <table>
                <tr><th>应用</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    for item in main_data['dimensions'].get('application_name', {}).get('top_increase', [])[:5]:
        pct_val = f"+{item['pct_change']*100:.1f}%" if item.get('pct_change') else "N/A"
        badge_class = "up" if item.get('pct_change', 0) > 0 else "down"
        html_content += f"""                <tr><td>{item['application_name']}</td><td>{item[main_data['quarters'][0]]:,.2f}</td><td>{item[main_data['quarters'][1]]:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            
            <h3>3.6 Geo（地域维度）</h3>
            <table>
                <tr><th>地域</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    for item in main_data['dimensions'].get('geo', {}).get('top_increase', [])[:5]:
        pct_val = f"+{item['pct_change']*100:.1f}%" if item.get('pct_change') else "N/A"
        badge_class = "up" if item.get('pct_change', 0) > 0 else "down"
        html_content += f"""                <tr><td>{item['geo']}</td><td>{item[main_data['quarters'][0]]:,.2f}</td><td>{item[main_data['quarters'][1]]:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            
            <h3>3.7 Cost Center（成本中心）</h3>
            <p><strong>注意：</strong>Cost Center 数据量较大（总共有 """ + str(cc_data['total_cost_centers']) + """ 个不同的成本中心），此处仅列出 Top 10 变化。</p>
            
            <h4>Top 10 增长</h4>
            <table>
                <tr><th>Cost Center</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    for item in cc_data['top_increase'][:10]:
        pct_val = f"+{item['pct']:.1f}%" if item.get('pct') else "新增"
        badge_class = "up" if (item.get('pct') or 0) > 0 else "down"
        html_content += f"""                <tr><td><code>{item['cost_center']}</code></td><td>{item['Q3']:,.2f}</td><td>{item['Q4']:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            
            <h4>Top 10 下降</h4>
            <table>
                <tr><th>Cost Center</th><th>Q3</th><th>Q4</th><th>差异</th><th>变化率</th></tr>
"""
    
    for item in cc_data['top_decrease'][:10]:
        pct_val = f"{item['pct']:.1f}%" if item.get('pct') else "-100%"
        badge_class = "down"
        html_content += f"""                <tr><td><code>{item['cost_center']}</code></td><td>{item['Q3']:,.2f}</td><td>{item['Q4']:,.2f}</td><td>{item['diff']:,.2f}</td><td><span class="badge {badge_class}">{pct_val}</span></td></tr>
"""
    
    html_content += """            </table>
            <div class="alert">
                <strong>⚠️ 建议：</strong>对变化超过 10% 的 Cost Center 逐一复核，确认是否有组织归属变更或分摊规则调整。
            </div>
        </div>
        
        <div class="section" id="judgment">
            <h2>4. 综合判断</h2>
            <h3>4.1 总体规模变化</h3>
            <div class="alert info">
                ✅ Q3 → Q4 增长 <strong>+567.52 (+0.83%)</strong>，在正常波动范围内
            </div>
            
            <h3>4.2 结构性变化</h3>
            <table>
                <tr><th>变化类型</th><th>具体表现</th><th>判断</th></tr>
                <tr><td>组织归属迁移</td><td>DCG (Q3: 3,452万) → ISG (Q4: 8,613万)</td><td><span class="tag red">🔴 需复核</span></td></tr>
                <tr><td>License 类型迁移</td><td>E5 用户下降 -5.9%，COPILOT 增长 +40.3%</td><td><span class="tag yellow">🟡 关注</span></td></tr>
                <tr><td>地域集中</td><td>HQ 承担 104% 的增量</td><td><span class="tag yellow">🟡 关注</span></td></tr>
            </table>
            
            <h3>4.3 需关注异常项</h3>
            <table>
                <tr><th>应用/规则</th><th>Q3</th><th>Q4</th><th>变化率</th><th>风险等级</th></tr>
                <tr><td>CDP</td><td>348.88</td><td>245.62</td><td>-29.6%</td><td><span class="tag yellow">🟡 中</span></td></tr>
                <tr><td>LICRM</td><td>325.50</td><td>266.53</td><td>-18.1%</td><td><span class="tag yellow">🟡 中</span></td></tr>
                <tr><td>OSB</td><td>19.48</td><td>89.27</td><td>+358.3%</td><td><span class="tag red">🔴 高</span></td></tr>
                <tr><td>A000926</td><td>29.07</td><td>51.64</td><td>+77.6%</td><td><span class="tag yellow">🟡 中</span></td></tr>
                <tr><td>A000593 (RR)</td><td>82.62</td><td>31.76</td><td>-61.6%</td><td><span class="tag red">🔴 高</span></td></tr>
            </table>
        </div>
        
        <div class="section" id="action">
            <h2>5. 建议复核点</h2>
            
            <h3>1. 🔴 高优先级</h3>
            <ul>
                <li>确认 DCG → ISG 组织迁移的真实性</li>
                <li>核实 COPILOT license 采购量与激活用户数</li>
                <li>调查 OSB (+358%) 和 RR (-62%) 的异常波动</li>
            </ul>
            
            <h3>2. 🟡 中优先级</h3>
            <ul>
                <li>检查 BG/Function 映射是否调整</li>
                <li>完善 Null 应用映射（约 33% 未映射）</li>
                <li>复核 LICRM (-18%) 和 CDP (-30%) 下降原因</li>
            </ul>
            
            <h3>3. 🟢 常规</h3>
            <ul>
                <li>确认 Q4 无新增重大分摊规则变更</li>
                <li>验证 cost_center 维度的数据完整性</li>
            </ul>
        </div>
        
        <div class="footer">
            <p>报告生成时间：2026-03-20</p>
        </div>
    </div>
</body>
</html>"""
    
    # 保存 HTML 报告
    html_path = Path(data_dir) / "cost_diff_report.html"
    html_path.write_text(html_content, encoding="utf-8")
    print(f"HTML 报告已保存: {html_path}")
    
    print()
    print("=" * 60)
    print("✅ 完成！报告已生成：")
    print(f"   - Markdown: {md_path}")
    print(f"   - HTML: {html_path}")
    print("=" * 60)

if __name__ == "__main__":
    main()
