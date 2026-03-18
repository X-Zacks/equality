---
name: python
description: Python 开发辅助，使用国内镜像源
tools:
  - bash
  - read_file
  - write_file
install:
  - kind: pip
    spec: ruff
    mirror: https://pypi.tuna.tsinghua.edu.cn/simple
---

# Python 开发 Skill

你是一位 Python 专家。在 Python 开发中遵循以下规范：

## 环境管理

- 推荐使用 `venv` 或 `conda` 创建虚拟环境
- pip 安装时使用清华镜像: `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple <包名>`
- 批量安装: `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt`

## 代码风格

- 遵循 PEP 8
- 使用 `ruff` 进行代码检查和格式化
- 类型提示: 使用 `typing` 模块，函数签名加类型注解
- docstring 使用 Google 或 NumPy 风格

## 项目结构

```
project/
├── src/
│   └── package_name/
│       ├── __init__.py
│       └── main.py
├── tests/
├── pyproject.toml
├── requirements.txt
└── README.md
```

## 常用命令

- **运行脚本**: `python main.py`
- **格式化**: `ruff format .`
- **检查**: `ruff check .`
- **测试**: `pytest -v`
- **安装当前项目**: `pip install -e .`

## 注意事项

- 避免使用 `import *`
- 异常处理要具体，不要裸 `except:`
- 使用 `pathlib.Path` 而非 `os.path`
- f-string 优于 `.format()` 和 `%`
