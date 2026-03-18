---
name: wechat-push
description: 企业微信群机器人 Webhook 消息推送
tools:
  - bash
  - web_fetch
---

# 企业微信群机器人推送 Skill

通过企业微信群机器人 Webhook 发送消息通知。

## Webhook 地址

用户需提供 Webhook Key（不是完整 URL），格式如：
`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<KEY>`

## 消息类型

### 文本消息

```bash
curl.exe -s -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY" -H "Content-Type: application/json" -d '{
  "msgtype": "text",
  "text": {
    "content": "这是一条测试消息",
    "mentioned_list": ["@all"]
  }
}'
```

### Markdown 消息

```bash
curl.exe -s -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY" -H "Content-Type: application/json" -d '{
  "msgtype": "markdown",
  "markdown": {
    "content": "# 标题\n> 引用\n**加粗** 普通文本"
  }
}'
```

### 图片消息

需要 base64 编码 + md5：

```powershell
$bytes = [System.IO.File]::ReadAllBytes("image.png")
$base64 = [Convert]::ToBase64String($bytes)
$md5 = (Get-FileHash -Algorithm MD5 -Path "image.png").Hash.ToLower()
```

## 注意事项

- 每个机器人每分钟最多发 20 条消息
- Markdown 支持有限：支持标题、加粗、链接、引用、代码，不支持表格和图片
- `mentioned_list` 可 @ 指定成员（用 userid）或 `@all`
- 密钥不要硬编码，建议用环境变量 `$env:WECHAT_WEBHOOK_KEY`
