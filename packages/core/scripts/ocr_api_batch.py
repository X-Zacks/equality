#!/usr/bin/env python3
"""使用 API 批量识别图片并生成 MD 文件"""

import os
import base64
import json
import time
import requests
from pathlib import Path

# 配置
API_URL = "https://ai.ludp.lenovo.com/ics-apps/projects/115/SY-SLM-Chat-Agent/aiverse/endpoint/v1/chat/completions"
API_KEY = "sk-sG9YDAuX257XSz4E4bZLJD"
MODEL = "Qwen3-VL-30B-A3B-Instruct"
IMAGE_DIR = r"C:\Users\zz\Desktop\OCR Testing\output_images"
OUTPUT_MD = r"C:\Users\zz\Desktop\OCR Testing\ocr_results.md"
OUTPUT_JSON = r"C:\Users\zz\Desktop\OCR Testing\ocr_results_incremental.json"
RATE_LIMIT = 50  # 每分钟请求数
INTERVAL = 60.0 / RATE_LIMIT + 0.2  # 1.2秒间隔

def encode_image(image_path):
    """将图片编码为 base64"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def call_vision_api(image_path, page_num):
    """调用 API 识别单张图片"""
    base64_image = encode_image(image_path)
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""请识别这张图片中的所有文字内容，保持原始文档结构。
- 如果是表格，保持表格格式
- 如果有编号或列表，保持编号结构
- 如果是多页文档的一部分，在开头注明"第 X 页"
- 只输出识别结果，不要额外的解释"""
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 8192,
        "temperature": 0.1
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        
        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            return {"success": True, "content": content, "page": page_num}
        else:
            return {"success": False, "error": "No content in response", "page": page_num}
    except Exception as e:
        return {"success": False, "error": str(e), "page": page_num}

import io
import sys

# 设置 stdout 为 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def main():
    # 获取所有图片文件
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
    image_files = []
    
    for f in os.listdir(IMAGE_DIR):
        ext = os.path.splitext(f)[1].lower()
        if ext in image_extensions:
            image_files.append(f)
    
    # 按名称排序
    image_files.sort()
    
    print(f"找到 {len(image_files)} 张图片")
    print(f"限速: {RATE_LIMIT}r/m, 间隔 {INTERVAL:.2f}秒")
    print("=" * 60)
    
    results = []
    success_count = 0
    fail_count = 0
    
    for i, filename in enumerate(image_files, 1):
        image_path = os.path.join(IMAGE_DIR, filename)
        page_num = i
        
        print(f"[{i}/{len(image_files)}] 识别中: {filename} ...", end=" ", flush=True)
        
        result = call_vision_api(image_path, page_num)
        results.append({
            "filename": filename,
            **result
        })
        
        if result["success"]:
            print("✓")
            success_count += 1
        else:
            print(f"✗ ({result.get('error', 'unknown error')})")
            fail_count += 1
        
        # 限速控制
        if i < len(image_files):
            time.sleep(INTERVAL)
    
    print("=" * 60)
    print(f"完成: 成功 {success_count}, 失败 {fail_count}")
    
    # 保存 JSON 结果
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"JSON 结果已保存: {OUTPUT_JSON}")
    
    # 生成 MD 文件
    md_content = "# OCR 识别结果\n\n"
    md_content += f"**识别时间:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    md_content += f"**图片总数:** {len(image_files)}\n\n"
    md_content += f"**成功:** {success_count} | **失败:** {fail_count}\n\n"
    md_content += "---\n\n"
    
    for result in results:
        md_content += f"## {result['filename']}\n\n"
        if result["success"]:
            md_content += result["content"] + "\n\n"
        else:
            md_content += f"**❌ 识别失败:** {result.get('error', '未知错误')}\n\n"
        md_content += "---\n\n"
    
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(md_content)
    
    print(f"MD 文件已保存: {OUTPUT_MD}")
    
    return results

if __name__ == "__main__":
    main()
