import requests
import json

url = 'https://ai.ludp.lenovo.com/ics-apps/projects/115/SY-SLM-Chat-Agent/aiverse/endpoint/v1'
headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-sG9YDAuX257XSz4E4bZLJD'
}

# 先测试简单对话
payload = {
    'model': 'Qwen3-VL-30B-A3B-Instruct',
    'messages': [
        {'role': 'user', 'content': 'Hello, respond with just "OK"'}
    ],
    'max_tokens': 10
}

print("Testing API...")
resp = requests.post(url, headers=headers, json=payload, timeout=60)
print(f'Status: {resp.status_code}')
print(f'Response: {resp.text}')
