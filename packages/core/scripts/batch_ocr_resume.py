#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch OCR using Qwen3-VL-30B model with incremental save
"""
import base64
import json
import time
import requests
from pathlib import Path
from datetime import datetime

# ============ Config ============
API_URL = "https://ai.ludp.lenovo.com/ics-apps/projects/115/SY-SLM-Chat-Agent/aiverse/endpoint/v1/chat/completions"
API_KEY = "sk-sG9YDAuX257XSz4E4bZLJD"
MODEL = "Qwen3-VL-30B-A3B-Instruct"

IMAGE_DIR = Path(r"C:\Users\zz\Desktop\OCR Testing\output_images")
OUTPUT_JSON = Path(r"C:\Users\zz\Desktop\OCR Testing\ocr_results_incremental.json")
OUTPUT_MD = Path(r"C:\Users\zz\Desktop\OCR Testing\ocr_results.md")

# Rate limit: 50r/m => 1.2s/request, use 2.5s for safety
REQUEST_INTERVAL = 2.5
# =================================

def encode_image_to_base64(image_path: Path) -> str:
    """Convert image to base64 string"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def call_vision_model(image_path: Path) -> str:
    """Call vision model to recognize single image"""
    image_base64 = encode_image_to_base64(image_path)
    
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
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}"
                        }
                    },
                    {
                        "type": "text",
                        "text": "Please fully recognize all text content in this image, preserving the original document structure and format. If there are tables, present them in Markdown table format."
                    }
                ]
            }
        ],
        "max_tokens": 8192,
        "temperature": 0.1
    }
    
    response = requests.post(API_URL, headers=headers, json=payload, timeout=120)
    
    if response.status_code != 200:
        raise Exception(f"API Error: {response.status_code} - {response.text}")
    
    result = response.json()
    return result["choices"][0]["message"]["content"]

def load_progress():
    """Load previous progress if exists"""
    if OUTPUT_JSON.exists():
        data = json.loads(OUTPUT_JSON.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    return []

def save_progress(results):
    """Save incremental progress"""
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

def generate_md(results):
    """Generate MD file from results"""
    image_files = sorted(IMAGE_DIR.glob("*.png"))
    
    md_content = f"""# OCR Recognition Results

**Generated**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
**Image Count**: {len(image_files)}  
**Model**: {MODEL}  
**Source Directory**: `{IMAGE_DIR}`

---

"""
    
    for item in results:
        md_content += f"""## {item['filename']}

{item['content']}

---

"""
    
    OUTPUT_MD.write_text(md_content, encoding="utf-8")

def main():
    # Get all PNG images
    image_files = sorted(IMAGE_DIR.glob("*.png"))
    
    # Load previous progress
    results = load_progress()
    completed_files = {r["filename"] for r in results}
    
    print(f"Found {len(image_files)} images")
    print(f"Already completed: {len(completed_files)}")
    print(f"Remaining: {len(image_files) - len(completed_files)}")
    print(f"Estimated time: {(len(image_files) - len(completed_files)) * REQUEST_INTERVAL / 60:.1f} minutes")
    print("-" * 50)
    
    for i, image_path in enumerate(image_files, 1):
        if image_path.name in completed_files:
            print(f"[{i}/{len(image_files)}] Skipping (done): {image_path.name}")
            continue
            
        print(f"[{i}/{len(image_files)}] Processing: {image_path.name} ...", end=" ", flush=True)
        
        try:
            content = call_vision_model(image_path)
            results.append({
                "filename": image_path.name,
                "content": content,
                "status": "success"
            })
            print("[OK]")
        except Exception as e:
            print(f"[FAIL] {e}")
            results.append({
                "filename": image_path.name,
                "content": f"**Recognition Failed**: {str(e)}",
                "status": "error"
            })
        
        # Save progress after each image
        save_progress(results)
        
        # Rate limit control
        if i < len(image_files):
            time.sleep(REQUEST_INTERVAL)
    
    # Generate MD file
    print("-" * 50)
    print("Generating MD file...")
    generate_md(results)
    
    # Statistics
    success_count = sum(1 for r in results if r["status"] == "success")
    error_count = len(results) - success_count
    
    print(f"Done! Success: {success_count}, Failed: {error_count}")
    print(f"Output: {OUTPUT_MD}")

if __name__ == "__main__":
    main()
