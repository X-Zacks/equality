---
name: dingtalk
description: 钉钉群机器人 Webhook 消息推送
tools:
  - bash
  - web_fetch
---

# 钉钉群机器人推送 Skill

通过钉钉自定义机器人 Webhook 发送群消息。

## Webhook 地址

格式：`https://oapi.dingtalk.com/robot/send?access_token=<TOKEN>`

如果配置了签名安全（推荐），还需要计算签名。

## 消息类型

### 文本消息

```bash
curl.exe -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN" -H "Content-Type: application/json" -d '{
  "msgtype": "text",
  "text": {
    "content": "这是一条测试消息"
  },
  "at": {
    "isAtAll": false
  }
}'
```

### Markdown 消息

```bash
curl.exe -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN" -H "Content-Type: application/json" -d '{
  "msgtype": "markdown",
  "markdown": {
    "title": "通知标题",
    "text": "# 标题\n> 引用\n\n**加粗** 普通文本\n\n[链接](https://example.com)"
  }
}'
```

### 签名计算（PowerShell）

```powershell
$secret = $env:DINGTALK_SECRET
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$stringToSign = "$timestamp`n$secret"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($stringToSign))
$sign = [Uri]::EscapeDataString([Convert]::ToBase64String($hash))
# 最终 URL: &timestamp=$timestamp&sign=$sign
```

## 注意事项

- 每分钟最多 20 条消息
- 安全设置推荐「加签」模式
- `content` 中必须包含自定义关键词（如果配置了关键词安全）
- 密钥用环境变量：`$env:DINGTALK_TOKEN`、`$env:DINGTALK_SECRET`
