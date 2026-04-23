#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class ParsedTable:
    headers: list[str]
    rows: list[list[str]]


def strip_markdown(text: str) -> str:
    text = text.replace("**", "").replace("__", "")
    text = text.replace("`", "")
    text = text.replace("<NULL>", "NULL")
    text = re.sub(r"^[-*+]\s+", "", text.strip())
    return text.strip()


def safe_id(value: str) -> str:
    value = strip_markdown(value)
    value = re.sub(r"[^A-Za-z0-9]+", "_", value)
    value = value.strip("_")
    return (value or "item")[:64]


def parse_float(value: str) -> float | None:
    raw = strip_markdown(value)
    raw = raw.replace(",", "").replace("，", "")
    raw = raw.replace("+", "")
    raw = raw.replace("%", "")
    raw = raw.replace("万", "")
    raw = raw.strip()
    if not raw or raw in {"-", "新增", "N/A", "NA"}:
        return None
    try:
        return float(raw)
    except ValueError:
        match = re.search(r"-?\d+(?:\.\d+)?", raw)
        return float(match.group(0)) if match else None


def parse_percent_rate(value: str) -> float | None:
    number = parse_float(value)
    if number is None:
        return None
    return number / 100.0


def extract_metadata(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    patterns = {
        "generatedAt": r"\*\*生成时间\*\*:\s*(.+)",
        "period": r"\*\*对比期间\*\*:\s*(.+)",
        "dataSource": r"\*\*数据来源\*\*:\s*(.+)",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            result[key] = strip_markdown(match.group(1))
    title_match = re.search(r"^#\s+(.+)$", text, flags=re.MULTILINE)
    if title_match:
        result["title"] = strip_markdown(title_match.group(1))
    footer_match = re.search(r"\*报告由\s+(.+?)\s+自动生成\s*\|\s*(\d{4}-\d{2}-\d{2})\*", text)
    if footer_match:
        result["author"] = strip_markdown(footer_match.group(1))
        result.setdefault("generatedAt", footer_match.group(2))
    return result


def between(text: str, start: str, end: str | None) -> str:
    start_idx = text.find(start)
    if start_idx == -1:
        return ""
    start_idx += len(start)
    if end:
        end_idx = text.find(end, start_idx)
        if end_idx == -1:
            end_idx = len(text)
    else:
        end_idx = len(text)
    return text[start_idx:end_idx].strip()


def extract_table_blocks(section: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for raw_line in section.splitlines():
        line = raw_line.rstrip()
        if line.strip().startswith("|") and line.strip().endswith("|"):
            current.append(line.strip())
            continue
        if current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)
    return blocks


def parse_table(lines: list[str]) -> ParsedTable | None:
    if len(lines) < 2:
        return None
    header = [strip_markdown(cell) for cell in lines[0].strip("|").split("|")]
    rows: list[list[str]] = []
    for line in lines[2:]:
        row = [strip_markdown(cell) for cell in line.strip("|").split("|")]
        if len(row) == len(header):
            rows.append(row)
    return ParsedTable(headers=header, rows=rows)


def section_tables(section: str) -> list[ParsedTable]:
    tables: list[ParsedTable] = []
    for block in extract_table_blocks(section):
        parsed = parse_table(block)
        if parsed:
            tables.append(parsed)
    return tables


def table_to_records(table: ParsedTable) -> list[dict[str, str]]:
    return [dict(zip(table.headers, row)) for row in table.rows]


def find_record(records: list[dict[str, str]], key_name: str, key_value: str) -> dict[str, str] | None:
    for record in records:
        if strip_markdown(record.get(key_name, "")) == strip_markdown(key_value):
            return record
    return None


def records_from_combined_tables(tables: list[ParsedTable], key_name: str) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    for table in tables:
        for row in table_to_records(table):
            if row.get(key_name):
                merged.append(row)
    return merged


def first_nonempty(*values: str | None) -> str | None:
    for value in values:
        if value:
            return value
    return None


def build_analysis(text: str, meta: dict[str, str], input_name: str) -> dict[str, Any]:
    sec2 = between(text, "## 2. 总体结论", "## 3. 分维度分析")
    sec32 = between(text, "### 3.2 BG（业务群组）", "### 3.3 Function（职能部门）")
    sec34 = between(text, "### 3.4 Allocation Key（分摊规则）", "### 3.5 Application（应用维度）")
    sec35 = between(text, "### 3.5 Application（应用维度）", "### 3.6 Geo（地域维度）")
    sec36 = between(text, "### 3.6 Geo（地域维度）", "### 3.7 Cost Center（成本中心）")
    sec37 = between(text, "### 3.7 Cost Center（成本中心）", "## 4. 综合判断")
    sec5 = between(text, "## 5. 关键发现汇总", "## 6. 建议复核清单")

    total_table = section_tables(sec2)[0]
    total_records = table_to_records(total_table)
    total_cost = find_record(total_records, "指标", "总费用") or {}
    cc_count = find_record(total_records, "指标", "Cost Center 数量") or {}

    bg_tables = section_tables(sec32)
    bg_records = table_to_records(bg_tables[0]) if bg_tables else []
    bg_shift_records = table_to_records(bg_tables[1]) if len(bg_tables) > 1 else []

    allocation_tables = section_tables(sec34)
    allocation_records = records_from_combined_tables(allocation_tables[:2], "分摊规则")
    allocation_shift_records = table_to_records(allocation_tables[2]) if len(allocation_tables) > 2 else []

    application_tables = section_tables(sec35)
    application_records = records_from_combined_tables(application_tables[:2], "应用")
    app_mapping_records = table_to_records(application_tables[2]) if len(application_tables) > 2 else []

    geo_tables = section_tables(sec36)
    geo_records = records_from_combined_tables(geo_tables[:2], "地域")

    cc_tables = section_tables(sec37)
    cc_growth_records = table_to_records(cc_tables[0]) if cc_tables else []
    cc_decline_records = table_to_records(cc_tables[1]) if len(cc_tables) > 1 else []
    cc_findings_records = table_to_records(cc_tables[2]) if len(cc_tables) > 2 else []

    sec5_high = between(sec5, "### 🔴 高优先级（需立即确认）", "### 🟡 中优先级（需跟进）")
    sec5_medium = between(sec5, "### 🟡 中优先级（需跟进）", None)
    priority_tables = section_tables(sec5_high) + section_tables(sec5_medium)
    priority_rows: list[list[str | int | float | bool | None]] = []
    for priority_label, table in [("高", priority_tables[0] if len(priority_tables) > 0 else None), ("中", priority_tables[1] if len(priority_tables) > 1 else None)]:
        if not table:
            continue
        for row in table.rows:
            priority_rows.append([priority_label, *row])

    q3_total = parse_float(total_cost.get("Q3", "0")) or 0.0
    q4_total = parse_float(total_cost.get("Q4", "0")) or 0.0
    total_diff = parse_float(total_cost.get("差异", "0")) or (q4_total - q3_total)
    total_change_rate = parse_percent_rate(total_cost.get("变化率", "0%")) or 0.0
    cost_center_count = int(parse_float(cc_count.get("Q3", "0")) or 0)

    isg_shift = find_record(bg_shift_records, "迁移方向", "ISG（新增）") or {}
    dcg_shift = find_record(bg_shift_records, "迁移方向", "DCG（消失）") or {}
    isg_value = parse_float(isg_shift.get("Q4", "0")) or 0.0
    dcg_value = parse_float(dcg_shift.get("Q3", "0")) or 0.0

    copilot_shift = find_record(allocation_shift_records, "License 类型", "Active_User_by_COPILOT") or {}
    e5_shift = find_record(allocation_shift_records, "License 类型", "Active_User_by_E5") or {}
    copilot_change_rate = parse_percent_rate(copilot_shift.get("变化率", "0%")) or 0.0
    copilot_change_value = parse_float(copilot_shift.get("差异", "0")) or 0.0

    null_ratio = find_record(app_mapping_records, "指标", "占总费用比例") or {}
    null_ratio_q4 = parse_percent_rate(null_ratio.get("Q4", "0%")) or 0.0
    null_amount = find_record(app_mapping_records, "指标", "Null 应用费用") or {}

    cc_critical = find_record(cc_findings_records, "发现", "3001419657 异常增长") or {}
    cc_3001419657 = find_record(cc_growth_records, "Cost Center", "3001419657") or {}

    row_count_match = re.search(r"各\s*(\d{1,3}(?:,\d{3})*)\s*行样本", sec37)
    per_quarter_rows = int(parse_float(row_count_match.group(1)) or 0) if row_count_match else 0
    total_rows = per_quarter_rows * 2 if per_quarter_rows else 0

    def bar_chart(chart_id: str, title: str, caption: str, x_axis: list[str], q3_data: list[float], q4_data: list[float]) -> dict[str, Any]:
        return {
            "id": chart_id,
            "title": title,
            "kind": "bar",
            "caption": caption,
            "spec": {
                "xAxis": x_axis,
                "series": [
                    {"name": "Q3", "data": q3_data},
                    {"name": "Q4", "data": q4_data},
                ],
            },
        }

    overall_chart = {
        "id": "overall_metrics_chart",
        "title": "Q3 与 Q4 总费用对比",
        "kind": "bar",
        "caption": "整体规模变化很小，Q4 较 Q3 增长 0.83%。",
        "spec": {
            "xAxis": ["Q3", "Q4"],
            "series": [{"name": "总费用", "data": [q3_total, q4_total]}],
        },
    }

    bg_selected = ["ISG", "DCG", "CHQ", "PCSD"]
    bg_q3 = []
    bg_q4 = []
    for key in bg_selected:
        record = find_record(bg_records, "BG", key) or {}
        bg_q3.append(parse_float(record.get("Q3", "0")) or 0.0)
        bg_q4.append(parse_float(record.get("Q4", "0")) or 0.0)
    bg_chart = bar_chart(
        "bg_shift_chart",
        "BG 维度组织迁移",
        "DCG 在 Q4 归零，而 ISG 从 0 增长到 8,613.04。",
        bg_selected,
        bg_q3,
        bg_q4,
    )

    alloc_selected = ["AD_account", "Active_User_by_COPILOT", "By_data_usage", "Active_User_by_E5"]
    alloc_label_map = {
        "AD_account": "AD_account",
        "Active_User_by_COPILOT": "COPILOT",
        "By_data_usage": "By_data_usage",
        "Active_User_by_E5": "E5",
    }
    alloc_q3 = []
    alloc_q4 = []
    alloc_x = []
    for key in alloc_selected:
        record = find_record(allocation_records, "分摊规则", key) or {}
        alloc_x.append(alloc_label_map[key])
        alloc_q3.append(parse_float(record.get("Q3", "0")) or 0.0)
        alloc_q4.append(parse_float(record.get("Q4", "0")) or 0.0)
    allocation_chart = bar_chart(
        "allocation_key_chart",
        "关键 License / 分摊规则变化",
        "COPILOT 增长最显著，而 E5 略有回落。",
        alloc_x,
        alloc_q3,
        alloc_q4,
    )

    app_selected = ["Null", "O365 Collaboration", "OSB", "CDP", "LICRM"]
    app_q3 = []
    app_q4 = []
    for key in app_selected:
        record = find_record(application_records, "应用", key) or {}
        app_q3.append(parse_float(record.get("Q3", "0")) or 0.0)
        app_q4.append(parse_float(record.get("Q4", "0")) or 0.0)
    application_chart = bar_chart(
        "application_change_chart",
        "应用维度代表性变化",
        "Null 应用持续占比约 33%，同时 OSB、CDP、LICRM 出现显著变化。",
        app_selected,
        app_q3,
        app_q4,
    )

    geo_selected = ["HQ", "EMEA", "ISO HQ", "AP", "PRC"]
    geo_q3 = []
    geo_q4 = []
    for key in geo_selected:
        record = find_record(geo_records, "地域", key) or {}
        geo_q3.append(parse_float(record.get("Q3", "0")) or 0.0)
        geo_q4.append(parse_float(record.get("Q4", "0")) or 0.0)
    geo_chart = bar_chart(
        "geo_change_chart",
        "地域维度变化",
        "HQ 承担了绝大多数净增量，地域整体分布仍相对稳定。",
        geo_selected,
        geo_q3,
        geo_q4,
    )

    top_growth_display = cc_growth_records[:5]
    growth_x = [record.get("Cost Center", "-") for record in top_growth_display]
    growth_diff = [parse_float(record.get("差异", "0")) or 0.0 for record in top_growth_display]
    cc_growth_chart = {
        "id": "cost_center_growth_chart",
        "title": "Top Growth Cost Center",
        "kind": "bar",
        "caption": "异常增量高度集中在少量新增或暴涨的 Cost Center 上。",
        "spec": {
            "xAxis": growth_x,
            "series": [{"name": "差异", "data": growth_diff}],
        },
    }

    analysis = {
        "datasetSummary": {
            "rowCount": total_rows,
            "columnCount": 0,
            "periodLabel": meta.get("period", "未提供"),
            "currency": "CNY",
            "dataSources": [
                item.strip() for item in re.split(r"\s*&\s*", meta.get("dataSource", "")) if item.strip()
            ] + [input_name],
        },
        "metrics": [
            {
                "id": "total_cost_q3",
                "label": "Q3 总费用",
                "value": q3_total,
                "unit": "CNYM",
                "formattedValue": total_cost.get("Q3", f"{q3_total:.2f}"),
                "trend": "flat",
                "emphasis": "normal",
            },
            {
                "id": "total_cost_q4",
                "label": "Q4 总费用",
                "value": q4_total,
                "unit": "CNYM",
                "formattedValue": total_cost.get("Q4", f"{q4_total:.2f}"),
                "trend": "up" if q4_total >= q3_total else "down",
                "emphasis": "warning" if q4_total >= q3_total else "normal",
            },
            {
                "id": "total_cost_diff",
                "label": "总费用差异",
                "value": total_diff,
                "unit": "CNYM",
                "formattedValue": total_cost.get("差异", f"{total_diff:+.2f}"),
                "changeValue": total_diff,
                "changeRate": total_change_rate,
                "trend": "up" if total_diff >= 0 else "down",
                "emphasis": "warning",
            },
            {
                "id": "cost_center_count",
                "label": "Cost Center 数量",
                "value": cost_center_count,
                "formattedValue": cc_count.get("Q3", str(cost_center_count)),
                "trend": "flat",
                "emphasis": "normal",
            },
            {
                "id": "dcg_to_isg_shift",
                "label": "组织迁移规模",
                "value": isg_value or dcg_value,
                "unit": "CNYM",
                "formattedValue": f"{(isg_value or dcg_value):,.2f}",
                "changeValue": isg_value or dcg_value,
                "trend": "mixed",
                "emphasis": "negative",
            },
            {
                "id": "copilot_growth_rate",
                "label": "COPILOT 增长率",
                "value": round(copilot_change_rate * 100, 2),
                "unit": "%",
                "formattedValue": copilot_shift.get("变化率", f"+{copilot_change_rate * 100:.1f}%"),
                "changeValue": copilot_change_value,
                "changeRate": copilot_change_rate,
                "trend": "up",
                "emphasis": "negative",
            },
            {
                "id": "null_app_ratio_q4",
                "label": "Q4 Null 应用占比",
                "value": round(null_ratio_q4 * 100, 2),
                "unit": "%",
                "formattedValue": null_ratio.get("Q4", f"{null_ratio_q4 * 100:.1f}%"),
                "trend": "flat",
                "emphasis": "warning",
            },
            {
                "id": "cc_3001419657_growth_rate",
                "label": "3001419657 增长率",
                "value": parse_float(cc_3001419657.get("变化率", "0")) or 0.0,
                "unit": "%",
                "formattedValue": cc_3001419657.get("变化率", "+0%"),
                "changeValue": parse_float(cc_3001419657.get("差异", "0")) or 0.0,
                "changeRate": (parse_float(cc_3001419657.get("变化率", "0")) or 0.0) / 100.0,
                "trend": "up",
                "emphasis": "negative",
            },
        ],
        "insights": [
            {
                "id": "overall_stable",
                "title": f"总体费用仅增长 {total_cost.get('变化率', '+0.83%')}，整体平稳但存在结构性异常",
                "detail": strip_markdown(re.search(r"\*\*整体平稳，略有增长.*", sec2).group(0)) if re.search(r"\*\*整体平稳，略有增长.*", sec2) else "Q3 到 Q4 总费用变化不大，但结构性风险需要单独复核。",
                "severity": "warning",
                "metricRefs": ["total_cost_diff", "cost_center_count"],
                "chartRefs": ["overall_metrics_chart"],
            },
            {
                "id": "org_migration",
                "title": "DCG 消失而 ISG 新增，疑似大规模组织归属迁移",
                "detail": "BG 与 Function 两个维度都出现 DCG 归零、ISG 新增的镜像变化，优先级最高。",
                "severity": "critical",
                "metricRefs": ["dcg_to_isg_shift"],
                "chartRefs": ["bg_shift_chart"],
            },
            {
                "id": "copilot_shift",
                "title": "E5 用户下降的同时 COPILOT 增长 40.3%，存在 License 迁移迹象",
                "detail": "Allocation Key 显示 Active_User_by_COPILOT 增长，而 Active_User_by_E5 回落，需核实采购与激活匹配关系。",
                "severity": "warning",
                "metricRefs": ["copilot_growth_rate"],
                "chartRefs": ["allocation_key_chart"],
            },
            {
                "id": "null_mapping",
                "title": "Null 应用费用占比维持在约三分之一，应用映射仍不完整",
                "detail": f"Q3/Q4 的 Null 应用费用分别为 {null_amount.get('Q3', '-') } 和 {null_amount.get('Q4', '-') }，占总费用约 33%，会限制应用维度分析精度。",
                "severity": "warning",
                "metricRefs": ["null_app_ratio_q4"],
                "chartRefs": ["application_change_chart"],
            },
            {
                "id": "cc_anomaly",
                "title": "3001419657 从 2 暴涨到 5,745，是最显著的异常成本中心",
                "detail": first_nonempty(cc_critical.get("详情"), "Top 10 增长清单中多个新增/暴涨 CC 集中出现，需要逐条复核业务背景。"),
                "severity": "critical",
                "metricRefs": ["cc_3001419657_growth_rate"],
                "chartRefs": ["cost_center_growth_chart"],
            },
        ],
        "charts": [overall_chart, bg_chart, allocation_chart, application_chart, geo_chart, cc_growth_chart],
        "tables": [
            {
                "id": "priority_findings_table",
                "title": "关键发现优先级汇总",
                "columns": ["优先级", "序号", "发现", "风险"],
                "rows": priority_rows,
            },
            {
                "id": "cost_center_growth_table",
                "title": "Top 10 费用增长 Cost Center",
                "columns": cc_tables[0].headers if cc_tables else ["排名", "Cost Center", "Q3", "Q4", "差异", "变化率"],
                "rows": [[cell for cell in row] for row in (cc_tables[0].rows if cc_tables else [])],
            },
            {
                "id": "cost_center_decline_table",
                "title": "Top 10 费用下降 Cost Center",
                "columns": cc_tables[1].headers if len(cc_tables) > 1 else ["排名", "Cost Center", "Q3", "Q4", "差异", "变化率"],
                "rows": [[cell for cell in row] for row in (cc_tables[1].rows if len(cc_tables) > 1 else [])],
            },
        ],
    }
    return analysis


def parse_checklist(text: str) -> dict[str, list[str]]:
    sec6 = between(text, "## 6. 建议复核清单", None)
    groups = {
        "high": between(sec6, "### 🔴 高优先级", "### 🟡 中优先级"),
        "medium": between(sec6, "### 🟡 中优先级", "### 🟢 常规"),
        "low": between(sec6, "### 🟢 常规", None),
    }
    result: dict[str, list[str]] = {}
    for key, section in groups.items():
        result[key] = [strip_markdown(match) for match in re.findall(r"^- \[[ xX]\] (.+)$", section, flags=re.MULTILINE)]
    return result


def build_story(meta: dict[str, str], analysis: dict[str, Any], text: str) -> dict[str, Any]:
    checklist = parse_checklist(text)
    return {
        "title": meta.get("title", "分析报告"),
        "subtitle": f"{meta.get('period', '未提供')} | 结构性变化与异常项复核",
        "audience": "management",
        "slides": [
            {
                "id": "cover",
                "type": "cover",
                "title": meta.get("title", "分析报告"),
                "subtitle": f"{meta.get('period', '未提供')} | {meta.get('dataSource', '未知数据源')}",
                "periodLabel": meta.get("generatedAt", "未提供"),
                "authorLabel": meta.get("author", "Equality"),
            },
            {
                "id": "summary",
                "type": "summary-list",
                "title": "一句话结论：整体平稳，但存在三类结构性风险",
                "items": [
                    "总费用仅增长 +0.83%，整体规模变化不大",
                    "DCG 消失且 ISG 新增，组织归属迁移需要最高优先级确认",
                    "COPILOT 增长 +40.3%，疑似 License 结构迁移",
                    "3001419657 与多条 HK 前缀 Cost Center 在 Q4 暴涨",
                    "Null 应用占比约 33%，应用映射仍限制分析精度",
                ],
                "style": "bullets",
                "insightRefs": [
                    "overall_stable",
                    "org_migration",
                    "copilot_shift",
                    "cc_anomaly",
                    "null_mapping",
                ],
            },
            {
                "id": "metrics",
                "type": "metric-cards",
                "title": "关键指标总览",
                "metricRefs": [
                    "total_cost_q3",
                    "total_cost_q4",
                    "total_cost_diff",
                    "cost_center_count",
                    "copilot_growth_rate",
                    "null_app_ratio_q4",
                ],
                "layout": "2x3",
                "highlightMetricRef": "total_cost_diff",
            },
            {
                "id": "overall_chart",
                "type": "single-chart",
                "title": "Q4 仅小幅高于 Q3，规模变化本身不是主要问题",
                "chartRef": "overall_metrics_chart",
                "summary": "真正需要关注的不是总额，而是组织归属、License 结构与异常 Cost Center 的变化。",
                "highlightPoints": [
                    f"总费用增加 {analysis['metrics'][2]['formattedValue']}",
                    f"变化率仅 {analysis['metrics'][2]['changeRate'] * 100:.2f}%",
                    f"Cost Center 数量保持 {analysis['metrics'][3]['formattedValue']} 不变",
                ],
            },
            {
                "id": "org_shift",
                "type": "insight-with-chart",
                "title": "DCG → ISG 迁移是本次报告最需要优先复核的结构性变化",
                "insightRef": "org_migration",
                "chartRef": "bg_shift_chart",
                "evidenceItems": [
                    "BG 维度：ISG 从 0 增至 8,613.04，DCG 从 8,675.54 归零",
                    "Function 维度同步出现 10026-ISG 新增、10026-DCG 消失",
                    "更像组织归属迁移，而不是总体规模增长",
                ],
            },
            {
                "id": "license_shift",
                "type": "insight-with-chart",
                "title": "COPILOT 爆发式增长，可能在吞噬 E5 人群",
                "insightRef": "copilot_shift",
                "chartRef": "allocation_key_chart",
                "evidenceItems": [
                    "Active_User_by_COPILOT：454.69 → 637.83（+40.3%）",
                    "Active_User_by_E5：567.84 → 534.10（-5.9%）",
                    "建议核实 License 采购量、激活用户数与分摊规则口径",
                ],
            },
            {
                "id": "app_geo_compare",
                "type": "compare-two-columns",
                "title": "应用映射不完整与地域增量集中，是两项持续性问题",
                "leftTitle": "应用侧",
                "leftBody": [
                    "Null 应用费用 Q4 为 22,684.36，占比 33.1%",
                    "OSB 增长 +358.3%，CDP 下降 -29.6%，LICRM 下降 -18.1%",
                    "应用映射不完整会放大分析盲区",
                ],
                "rightTitle": "地域侧",
                "rightBody": [
                    "HQ 增长 +591.74，占整体净增量的 104%",
                    "AP 略降 -31.10，PRC 基本持平",
                    "地域分布总体稳定，但增量高度集中在 HQ",
                ],
                "chartRef": "geo_change_chart",
            },
            {
                "id": "cc_anomaly_slide",
                "type": "insight-with-chart",
                "title": "异常 Cost Center 呈现“单点暴涨 + HK 集中新增”模式",
                "insightRef": "cc_anomaly",
                "chartRef": "cost_center_growth_chart",
                "evidenceItems": [
                    "3001419657：2 → 5,745（+295881%）",
                    "HK08008489、HK08085813 等在 Q4 集中新增/暴涨",
                    "10x 系列 CC 普遍下降 30%~40%，疑似归属重分配",
                ],
            },
            {
                "id": "recommendations",
                "type": "recommendation",
                "title": "建议复核清单（按优先级）",
                "items": [
                    {
                        "title": checklist["high"][0] if len(checklist["high"]) > 0 else "确认 DCG → ISG 组织迁移真实性",
                        "detail": "核对组织架构调整记录，确认是否为真实归属迁移而非口径变更。",
                        "priority": "high",
                        "owner": "财务BP / 组织管理",
                    },
                    {
                        "title": checklist["high"][1] if len(checklist["high"]) > 1 else "复核 3001419657 与 HK 前缀 CC 暴涨原因",
                        "detail": "逐条检查是否存在新项目上线、集中调拨或异常入账。",
                        "priority": "high",
                        "owner": "成本中心管理员",
                    },
                    {
                        "title": checklist["high"][3] if len(checklist["high"]) > 3 else "核实 COPILOT License 采购与激活匹配度",
                        "detail": "重点看 E5 → COPILOT 的迁移逻辑是否与分摊规则一致。",
                        "priority": "high",
                        "owner": "IT 资产 / License 管理",
                    },
                    {
                        "title": checklist["medium"][2] if len(checklist["medium"]) > 2 else "完善 Null 应用映射",
                        "detail": "将未映射应用从约 33% 压低，否则应用维度结论长期不稳。",
                        "priority": "medium",
                        "owner": "应用台账负责人",
                    },
                    {
                        "title": checklist["medium"][3] if len(checklist["medium"]) > 3 else "复核 LICRM 和 CDP 下降原因",
                        "detail": "结合业务量、迁移计划或停服安排解释变化。",
                        "priority": "medium",
                        "owner": "应用 Owner",
                    },
                ],
            },
            {
                "id": "appendix_priority",
                "type": "appendix-table",
                "title": "附录：关键发现优先级汇总",
                "tableRef": "priority_findings_table",
                "pageSize": 10,
                "showIndex": False,
            },
            {
                "id": "appendix_cc_growth",
                "type": "appendix-table",
                "title": "附录：Top 10 费用增长 Cost Center",
                "tableRef": "cost_center_growth_table",
                "pageSize": 10,
                "showIndex": False,
            },
        ],
    }


def build_manifest(meta: dict[str, str], source_kind: str, source_label: str | None) -> dict[str, Any]:
    created_date = meta.get("generatedAt", "2026-01-01")
    created_at = f"{created_date}T00:00:00+08:00" if re.match(r"\d{4}-\d{2}-\d{2}$", created_date) else created_date
    label = source_label or meta.get("dataSource", "")
    return {
        "formatVersion": "1.0",
        "reportType": "slide-report",
        "title": meta.get("title", "分析报告"),
        "description": f"基于 {label or '输入 Markdown'} 的差异分析，聚焦总体规模、组织迁移、License 变化、应用映射与异常成本中心。",
        "defaultLanguage": "zh-CN",
        "generator": {
            "name": "Equality",
            "version": "0.1.0",
        },
        "rendererVersion": "1.1.0",
        "theme": "deep-tech-presentation",
        "createdAt": created_at,
        "source": {
            "kind": source_kind,
            "label": label,
        },
        "tags": [
            "markdown-to-package",
            "finance",
            "allocation",
            "copilot",
            "organization-migration",
        ],
    }


def build_theme(footer_text: str | None) -> dict[str, Any]:
    return {
        "name": "deep-tech-presentation",
        "mode": "dark",
        "brand": {
            "primaryColor": "#c084fc",
            "accentColor": "#f472b6",
            "fontFamily": "Microsoft YaHei",
        },
        "layout": {
            "aspectRatio": "16:9",
            "showPageNumber": True,
            "showFooter": True,
            "footerText": footer_text or "Equality Slide Report",
            "showDataSource": True,
        },
        "presentation": {
            "shellMode": "dark",
            "shellBackground": {
                "type": "gradient",
                "from": "#0b1020",
                "to": "#4c1d95",
                "angle": 135,
            },
            "toolbarColor": "#090d18",
            "sidebarColor": "#111322",
            "sidebarActiveColor": "#c084fc",
            "stageColor": "#140f24",
            "slideSurface": "dark",
            "slideGradientFrom": "#5b1738",
            "slideGradientTo": "#22143f",
            "slideGradientAngle": 135,
            "slideTextColor": "#f8fafc",
            "slideMutedTextColor": "#d8bfd8",
            "cardBackgroundColor": "#2a1b3f",
            "cardBorderColor": "#6b3fa0",
            "thumbnailTextColor": "#f5e9ff",
        },
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def create_zip(source_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(source_dir.rglob("*")):
            if file_path.is_file():
                zf.write(file_path, file_path.relative_to(source_dir).as_posix())


def validate_expected_sections(text: str) -> None:
    required_markers = [
        "## 2. 总体结论",
        "### 3.2 BG（业务群组）",
        "### 3.4 Allocation Key（分摊规则）",
        "### 3.5 Application（应用维度）",
        "### 3.6 Geo（地域维度）",
        "### 3.7 Cost Center（成本中心）",
        "## 6. 建议复核清单",
    ]
    missing = [marker for marker in required_markers if marker not in text]
    if missing:
        raise ValueError("Markdown 结构不符合当前脚本支持的分析模板，缺少章节：" + "；".join(missing))


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Equality analysis markdown into a VM-report-service report package.")
    parser.add_argument("--input", required=True, help="输入 Markdown 文件路径")
    parser.add_argument("--output-dir", required=True, help="输出 report package 目录")
    parser.add_argument("--zip-output", help="可选：输出 ZIP 文件路径")
    parser.add_argument("--copy-markdown", action="store_true", help="复制原始 Markdown 到输出目录")
    parser.add_argument("--source-kind", default="excel", choices=["excel", "csv", "manual", "api"], help="manifest.source.kind")
    parser.add_argument("--source-label", help="manifest.source.label，默认使用 Markdown 里的数据来源")
    parser.add_argument("--footer-text", default="Equality Slide Report | Generated from Markdown", help="theme.layout.footerText")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    zip_output = Path(args.zip_output).resolve() if args.zip_output else None

    text = input_path.read_text(encoding="utf-8")
    validate_expected_sections(text)
    meta = extract_metadata(text)
    analysis = build_analysis(text, meta, input_path.name)
    story = build_story(meta, analysis, text)
    manifest = build_manifest(meta, args.source_kind, args.source_label)
    theme = build_theme(args.footer_text)

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    write_json(output_dir / "manifest.json", manifest)
    write_json(output_dir / "analysis.json", analysis)
    write_json(output_dir / "story.json", story)
    write_json(output_dir / "theme.json", theme)

    if args.copy_markdown:
        shutil.copy2(input_path, output_dir / input_path.name)

    if zip_output:
        create_zip(output_dir, zip_output)

    print(json.dumps({
        "outputDir": output_dir.as_posix(),
        "zipOutput": zip_output.as_posix() if zip_output else None,
        "title": manifest["title"],
        "slides": len(story["slides"]),
        "metrics": len(analysis["metrics"]),
        "charts": len(analysis["charts"]),
        "tables": len(analysis["tables"]),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
