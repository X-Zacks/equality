# 脚本功能：将 PDF 转换为图片，然后进行 OCR 提取 License 信息

import os
from pdf2image import convert_from_path
import pytesseract

# PDF 文件路径
pdf_path = r'C:/Users/zz/Desktop/OCR Testing/Splunk.pdf'
output_dir = r'C:/Users/zz/Desktop/OCR Testing/output_images'
os.makedirs(output_dir, exist_ok=True)

# 步骤 1: 将 PDF 转换为图片
print("将 PDF 转换为图片...")
images = convert_from_path(pdf_path, dpi=300)

image_files = []
for i, image in enumerate(images):
    image_file = os.path.join(output_dir, f'page_{i + 1}.png')
    image.save(image_file, 'PNG')
    image_files.append(image_file)

print(f"PDF 转换完成，共生成 {len(image_files)} 张图片，保存在 {output_dir}")

# 步骤 2: OCR 提取文字
print("开始 OCR 提取...")
license_info = []

for image_file in image_files:
    print(f"正在处理图片: {image_file}")
    text = pytesseract.image_to_string(image_file, lang='eng')
    
    # 这里可以增加对文本中 License 相关信息的抽取逻辑
    if "license" in text.lower():
        license_info.append(text)

# 输出 License 信息
output_text = os.path.join(output_dir, 'license_info.txt')
with open(output_text, 'w', encoding='utf-8') as f:
    for info in license_info:
        f.write(info + '\n\n')

print(f"OCR 提取完成，License 信息保存在 {output_text}")