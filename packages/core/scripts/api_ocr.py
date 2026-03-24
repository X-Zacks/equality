import base64
import requests
import json

# 读取图片并转为 base64
img_path = r'C:\Users\zz\Desktop\OCR Testing\output_images\adobe_page_10.png'
with open(img_path, 'rb') as f:
    img_base64 = base64.b64encode(f.read()).decode('utf-8')

print(f"图片大小: {len(img_base64)} 字符 (base64)", flush=True)

# 正确的 API 端点
url = 'https://ai.ludp.lenovo.com/ics-apps/projects/115/SY-SLM-Chat-Agent/aiverse/endpoint/v1/chat/completions'
headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-sG9YDAuX257XSz4E4bZLJD'
}

# 构建多模态请求
payload = {
    'model': 'Qwen3-VL-30B-A3B-Instruct',
    'messages': [
        {
            'role': 'user',
            'content': [
                {'type': 'text', 'text': '请识别这张图片中的所有文字内容，保持原有格式。'},
                {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{img_base64}'}}
            ]
        }
    ],
    'max_tokens': 4096
}

# 发送请求
print("正在调用 API (Qwen3-VL-30B-A3B-Instruct)...", flush=True)
resp = requests.post(url, headers=headers, json=payload, timeout=180)
print(f'Status: {resp.status_code}', flush=True)

if resp.status_code == 200:
    result = resp.json()
    content = result['choices'][0]['message']['content']
    print("\n" + "="*60, flush=True)
    print("识别结果:", flush=True)
    print("="*60, flush=True)
    print(content, flush=True)
else:
    print(f'\nError: {resp.text}', flush=True)
