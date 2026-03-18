---
name: openspec-skill
description: 遵循 OpenSpec 规范的工程方法与工具集成
tools: [functions.write_file, functions.bash, functions.read_file]
equality.auto-generated: true
equality.source-model: gpt-4o-2024-11-20
equality.created: 2026-03-16
---

## 任务说明

OpenSpec 是一个围绕规范驱动开发（Spec-Driven Development, SDD）的框架工具，旨在帮助团队清晰地定义需求、设计与任务并保持持续迭代。本 Skill 帮助用户在技术项目中遵循 OpenSpec 的核心实践原则。包括：
- 提取需求并生成规范（proposal/spec/task）。
- 构建与管理工程目录的模版化结构。
- 自动化脚本检查与测试。

## 使用方法

### 参数表格

| 参数名          | 含义                                       | 类型   |
|-----------------|------------------------------------------|--------|
| project_name    | 项目名称（生成的目录名）                    | String |
| spec_description | 需求的核心描述，生成 proposal 的内容            | String |

### 完整的执行步骤

1. **依赖安装**  
    确保 Node.js 环境支持 20.19.0 或更高版本。安装 OpenSpec 到全局：  
    ```bash
    npm install -g @fission-ai/openspec@latest
    ```

2. **项目初始化**  
    在 terminal 中设置工作目录并运行：  
    ```bash
    mkdir <project_name>
    cd <project_name>
    openspec init
    ```
    上述命令会生成初始工程目录结构，包括以下内容：
      - `proposal.md`：需求内容。
      - 目录结构：`specs`, `design`, `tasks`。

3. **需求编写与任务分解**  
    通过运行下列命令生成需求方案（建议在 OpenSpec 提供的框架内撰写）：  
    ```bash
    openspec propose "<spec_description>"
    ```
    自动生成：
      - proposal.md（需求描述）
      - specs/（方案文件夹）
      - design.md（技术实现设计）
      - tasks.md（任务列表）。

4. **验证与同步更新**  
    使用 OpenSpec 命令，确保 proposal 与设计文件在工程执行的过程中保持一致。例如：
    ```bash
    openspec verify
    openspec sync
    ```

5. **持续改进**  
    修改需求后，可运行如下命令更新整个设计方案：  
    ```bash
    openspec new
    ```

6. **归档已完成任务**  
    针对已完成的内容，可归档历史设计：  
    ```bash
    openspec archive
    ```

### 示例脚本模板
以下是为项目初始化编写的脚本模板：

#### setup_project.py
```python
import os
import subprocess

def initialize_project(project_name, spec_description):
    # 1. 创建项目目录
    os.makedirs(project_name, exist_ok=True)
    os.chdir(project_name)

    # 2. 初始化 OpenSpec 项目
    subprocess.run(["openspec", "init"])

    # 3. 生成规格提案
    subprocess.run(["openspec", "propose", spec_description])

project_name = "example_project"
spec_description = "新增用户搜索功能，支持模糊匹配"
initialize_project(project_name, spec_description)
```

执行步骤：
1. 将上述脚本保存为 `setup_project.py`。
2. 运行命令初始化项目：
   ```bash
   python setup_project.py
   ```
3. 查看生成的目录结构和文件。

## 注意事项
- 在安装和使用 OpenSpec 时，请确保网络环境稳定。
- 如果工具版本更新，建议运行 `openspec update` 以同步最新的命令和功能。