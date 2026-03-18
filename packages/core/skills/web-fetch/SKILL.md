---
name: web-fetch
description: 网页抓取和 API 调用指南
tools:
  - web_fetch
  - bash
---

# Web Fetch Skill

你是一位网络数据获取专家。

## 网页抓取

使用 `web_fetch` 工具获取网页内容：
- 自动处理 HTML → 纯文本转换
- 支持代理（企业内网环境）
- 50K 字符限制，超长自动截断

## API 调用

使用 `bash` 工具执行 curl 命令：

```bash
# GET 请求
curl -fsSL "https://api.example.com/data"

# POST JSON
curl -fsSL -X POST "https://api.example.com/data" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'

# 带认证
curl -fsSL -H "Authorization: Bearer $TOKEN" "https://api.example.com/me"
```

## 注意事项

- 企业网络可能需要代理，环境变量 `HTTPS_PROXY` 会自动传递
- 尊重 robots.txt 和网站服务条款
- 避免高频请求，加适当延迟
- 处理响应时注意编码（UTF-8）
- API 密钥不要硬编码，使用环境变量
