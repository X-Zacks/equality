from pdf2image import convert_from_path
import pytesseract
import re
import os

# 设置 Tesseract 路径（如果未添加到系统路径中需手动设置）
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# PDF 文件路径
pdf_path = r"C:\Users\zz\Desktop\OCR Testing\Splunk.pdf"
# 图片输出目录
output_dir = r"C:\Users\zz\Desktop\OCR Testing\output_images"
# License 信息输出文件
output_text_path = r"C:\Users\zz\Desktop\OCR Testing\license_info.txt"

# 确保输出目录存在
os.makedirs(output_dir, exist_ok=True)

# 第一步：将 PDF 转为图片
def pdf_to_images(pdf_path, output_dir):
    images = convert_from_path(pdf_path)
    image_files = []
    for i, image in enumerate(images):
        image_path = os.path.join(output_dir, f"page_{i + 1}.png")
        image.save(image_path, "PNG")
        image_files.append(image_path)
    return image_files

# 第二步：对图片进行 OCR 识别
def extract_text_from_images(image_files):
    all_text = ""
    for image_file in image_files:
        text = pytesseract.image_to_string(image_file, lang="eng")
        all_text += text + "\n"
    return all_text

# 第三步：从文本中提取 License 信息
def extract_license_info(text):
    # 假设 License 信息中包含关键字，例如 "License Name", "Quantity", "Amount"
    license_pattern = r"(License\s*Name.*?|Quantity.*?|Amount.*?)\n"
    matches = re.findall(license_pattern, text, flags=re.IGNORECASE | re.DOTALL)
    return "\n".join(matches)

# 主流程
if __name__ == "__main__":
    # PDF 转图片
    print("Converting PDF to images...")
    image_files = pdf_to_images(pdf_path, output_dir)
    print(f"Images saved to: {output_dir}")

    # OCR 识别
    print("Extracting text from images...")
    text = extract_text_from_images(image_files)

    # 提取 License 信息
    print("Extracting License information...")
    license_info = extract_license_info(text)

    # 保存到文本文件
    with open(output_text_path, "w", encoding="utf-8") as f:
        f.write(license_info)

    print(f"License information saved to: {output_text_path}")