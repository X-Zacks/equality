import requests
import json

base_url = 'https://ai.ludp.lenovo.com/ics-apps/projects/115/SY-SLM-Chat-Agent/aiverse/endpoint/v1'
headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-sG9YDAuX257XSz4E4bZLJD'
}

# 尝试不同的端点
endpoints = [
    '',
    '/chat/completions',
    '/v1/chat/completions',
    '/completions'
]

payload = {
    'model': 'Qwen3-VL-30B-A3B-Instruct',
    'messages': [
        {'role': 'user', 'content': 'Hello'}
    ],
    'max_tokens': 10
}

for ep in endpoints:
    url = base_url + ep
    print(f"\nTesting: {url}")
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        print(f'  Status: {resp.status_code}')
        if resp.status_code != 404:
            print(f'  Response: {resp.text[:500]}')
    except Exception as e:
        print(f'  Error: {e}')
