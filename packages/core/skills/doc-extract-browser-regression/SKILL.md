---
name: doc-extract-browser-regression
description: 使用浏览器按测试计划对 Doc Extract 系统做多格式上传、解析与回归验证
tools:
  - read_file
  - write_file
  - list_dir
  - glob
  - browser
  - read_image
  - bash
equality.auto-generated: true
equality.source-model: gpt-5.4
equality.created: 2026-03-15
---

# Doc Extract 浏览器回归测试

用于对 Doc Extract Web 应用执行基于浏览器的回归测试，重点覆盖多格式文件上传、批量解析、结果查看及增强能力入口验证。适用于系统更新后快速确认主链路是否仍然可用。

## 适用场景

- 系统版本更新后做一次冒烟回归
- 新增解析能力后验证是否影响旧格式
- 需要根据既有 `BROWSER_TEST_PLAN.md` 生成一份结构化测试结论
- 需要用本地样例文件批量验证 PDF、DOCX、PPTX、XLSX、TXT、HTML、MD 等格式

## 参数

| 参数 | 说明 | 示例 |
|---|---|---|
| base_url | Doc Extract 系统首页地址 | http://10.122.133.143:32025/ |
| test_plan_path | 浏览器测试计划 Markdown 文件路径 | C:/software/workspace-python/doc-extract-v2/doc-extract-api/openspec/BROWSER_TEST_PLAN.md |
| sample_dir | 本地样例文件目录 | C:/software/sample |
| upload_patterns | 需要优先选取的文件类型 glob 列表 | *.pdf, *.docx, *.pptx, *.xlsx, *.txt, *.html, *.md |
| report_path | 可选，输出测试报告路径 | C:/software/sample/doc-extract-regression-report.md |

## 推荐输入文件类型

优先从 `sample_dir` 中选取以下类型各 1 个或多个：

- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`
- `.txt`
- `.html`
- `.md`
- 如有额外样本，可继续补 `.csv`、`.eml`、重复文件副本、异常格式文件（如 `.zip`）

## 执行步骤

### 1. 读取测试计划并确认目标场景

1. 用 `read_file` 读取 `{{test_plan_path}}`
2. 提取重点测试模块：
   - 语言切换
   - 单文件/批量上传
   - 同步或异步解析
   - Markdown 预览与源码
   - 文档属性
   - 图片查看/图注注入
   - 缩略词
   - 下载入口
   - 异常文件与缓存命中
3. 将本轮计划分成三类：
   - 已测核心主链路
   - 可选增强能力
   - 本轮未覆盖项

### 2. 扫描样例目录并建立测试文件清单

1. 用 `list_dir` 查看 `{{sample_dir}}`
2. 用 `glob` 收集目标文件，例如：
   - `{{sample_dir}}/*.pdf`
   - `{{sample_dir}}/*.docx`
   - `{{sample_dir}}/*.pptx`
   - `{{sample_dir}}/*.xlsx`
   - `{{sample_dir}}/*.txt`
   - `{{sample_dir}}/*.html`
   - `{{sample_dir}}/*.md`
3. 为每种格式选出代表性样本，记录到报告草稿中
4. 如需验证缓存命中，可复制一个已选文件生成重复副本

### 3. 启动浏览器并进入系统

1. 用 `browser start`
2. 用 `browser navigate` 打开 `{{base_url}}`
3. 用 `browser snapshot` 识别页面主元素
4. 如测试计划要求双语，点击语言切换按钮并确认文案变化

### 4. 执行批量上传与解析

1. 优先一次性上传多种类型文件
2. 使用 `browser act kind=upload` 上传本地文件，文件路径使用逗号分隔
3. 观察上传后列表是否出现：
   - 文件名
   - 类型
   - 大小
   - 页数
   - 状态
4. 点击 `批量解析` 或等效按钮
5. 用 `browser snapshot` / `browser act kind=wait` 轮询状态变化，记录：
   - 已上传
   - 等待中
   - 解析中
   - 已完成
   - 失败（如有）
6. 对耗时较长的 PDF / PPTX 单独持续观察，避免与已完成任务混淆

### 5. 对各类型逐项验证结果入口

至少检查以下内容：

- `查看`：能否打开结果页
- `MD` 或 `下载 Markdown`：按钮是否存在
- `原始`：原文件下载入口是否存在
- `缩略词`：按钮是否出现
- `注入属性`：是否出现在支持的文档类型上
- `图片`：带图文档是否显示图片数量
- `注入图注`：带图文档是否出现入口
- `重解析`：是否存在

建议优先顺序：

1. MD / TXT / HTML：验证结果查看和源码切换
2. DOCX：验证图片、属性、图注等增强能力入口
3. XLSX：验证解析与属性入口
4. PDF / PPTX：验证长任务是否最终完成，以及查看入口是否可用

### 6. 验证 Markdown 预览与源码切换

1. 打开一个已完成任务的 `查看`
2. 确认默认是否为预览模式
3. 切换到 `源码`
4. 记录：
   - 标题层级是否正常
   - 文本是否乱码
   - 源码是否真为 Markdown
5. 如果页面含图片或图表，可截图并用 `read_image` 辅助识别页面内容

### 7. 验证异常与补充场景（可选）

按时间和样本情况择优执行：

- 上传不支持格式（如 `.zip`）并观察错误提示
- 上传重复文件，观察是否命中缓存或出现重复任务提示
- 混合上传支持与不支持格式
- 验证异步解析入口
- 验证任务删除、批量下载或本地目录归集（如果页面支持）

### 8. 产出测试报告

将结果整理为以下结构：

```markdown
# Doc Extract 浏览器回归测试报告

## 测试环境
- 地址：{{base_url}}
- 测试计划：{{test_plan_path}}
- 样例目录：{{sample_dir}}
- 测试日期：YYYY-MM-DD

## 测试文件清单
| 类型 | 文件 | 结果 |
|---|---|---|

## 已通过项
- ...

## 部分通过项
- ...

## 未验证项
- ...

## 发现的问题与风险
- ...

## 结论
- ...
```

如果用户提供了 `{{report_path}}`，用 `write_file` 写入正式报告。

## 报告判定规则

### 通过

满足以下任一：

- 上传、解析、查看三段链路完整跑通
- 页面展示与测试计划预期一致
- 对应功能按钮存在且实际操作成功

### 部分通过

适用于：

- 上传成功但解析仍在进行
- 入口存在但本轮未完成闭环
- 样本不足导致仅验证到部分子场景

### 未验证

适用于：

- 样本目录中没有对应格式文件
- 当前会话时间不足，未进入该测试步骤
- 页面没有暴露对应入口，且无法确认是否为预期设计

## 注意事项

- 浏览器弹层打开时，底层任务按钮可能无法点击；需要先关闭查看器再继续操作
- 对大 PDF、PPTX 等长任务，应多次轮询，不要过早判定失败
- 如页面使用中文和英文双语，报告中保留页面原始按钮文案，避免歧义
- 对“入口存在但未点击”的能力，只能写“具备入口”或“部分通过”，不要直接写“通过”
- 如果要做脚本辅助整理结果，必须先用 `write_file` 保存脚本文件，再用 `bash` 执行，不能使用 heredoc

## PowerShell 脚本模板：生成基础报告骨架

先用 `write_file` 创建脚本文件，例如 `C:/software/sample/build_doc_extract_report.py`，内容如下：

```python
from pathlib import Path
from datetime import date

base_url = "{{base_url}}"
test_plan_path = Path(r"{{test_plan_path}}")
sample_dir = Path(r"{{sample_dir}}")
report_path = Path(r"{{report_path}}")

files = []
for pattern in ["*.pdf", "*.docx", "*.pptx", "*.xlsx", "*.txt", "*.html", "*.md"]:
    for path in sorted(sample_dir.glob(pattern)):
        files.append((path.suffix.lower(), path.name))

lines = []
lines.append("# Doc Extract 浏览器回归测试报告")
lines.append("")
lines.append("## 测试环境")
lines.append(f"- 地址：{base_url}")
lines.append(f"- 测试计划：{test_plan_path.as_posix()}")
lines.append(f"- 样例目录：{sample_dir.as_posix()}")
lines.append(f"- 测试日期：{date.today().isoformat()}")
lines.append("")
lines.append("## 测试文件清单")
lines.append("| 类型 | 文件 | 结果 |")
lines.append("|---|---|---|")
for suffix, name in files:
    lines.append(f"| {suffix} | {name} | 待填写 |")
lines.append("")
lines.append("## 已通过项")
lines.append("- 待填写")
lines.append("")
lines.append("## 部分通过项")
lines.append("- 待填写")
lines.append("")
lines.append("## 未验证项")
lines.append("- 待填写")
lines.append("")
lines.append("## 发现的问题与风险")
lines.append("- 待填写")
lines.append("")
lines.append("## 结论")
lines.append("- 待填写")
lines.append("")

report_path.write_text("\n".join(lines), encoding="utf-8")
print(report_path.as_posix())
```

然后再用 `bash` 执行：

```powershell
python C:/software/sample/build_doc_extract_report.py
```

## 结果输出建议

最终回复用户时，建议按以下顺序输出：

1. 本轮实际使用的样例文件
2. 与 `BROWSER_TEST_PLAN.md` 对应的测试项结果
3. 各文件类型的通过/部分通过情况
4. 主要风险点
5. 总体结论
6. 如已写报告，附上报告路径
