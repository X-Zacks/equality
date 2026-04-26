#!/usr/bin/env python3
"""
Convert PowerPoint template to images for AI analysis.

Usage:
    python template-to-images.py template.pptx [--output images/]
"""

import argparse
import os
import subprocess
import sys

def convert_pptx_to_images(pptx_path, output_dir="images"):
    """Convert PPTX to PNG images."""
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Convert PPTX to PDF first
    pdf_path = os.path.join(output_dir, "template.pdf")
    
    # Use soffice to convert
    cmd = [
        "soffice",
        "--headless",
        "--convert-to", "pdf",
        "--outdir", output_dir,
        pptx_path
    ]
    
    print(f"Converting {pptx_path} to PDF...")
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        print(f"Error converting PPTX: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("Error: soffice not found. Please install LibreOffice.")
        sys.exit(1)
    
    # Find the generated PDF
    base_name = os.path.splitext(os.path.basename(pptx_path))[0]
    pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
    
    if not os.path.exists(pdf_path):
        # Try alternate location
        pdf_path = os.path.join(output_dir, "template.pdf")
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF not found at {pdf_path}")
        sys.exit(1)
    
    # Convert PDF to PNG
    png_base = os.path.join(output_dir, "template")
    print(f"Converting PDF to PNG images...")
    
    cmd = [
        "pdftoppm",
        "-png",
        "-r", "150",  # 150 DPI for good quality
        "-tcp",  # Top-to-bottom page order
        pdf_path,
        png_base
    ]
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error converting PDF: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("Error: pdftoppm not found. Please install Poppler.")
        sys.exit(1)
    
    # Generate thumbnail grid
    images = sorted([f for f in os.listdir(output_dir) if f.startswith("template-") and f.endswith(".png")])
    
    if images:
        print(f"\nGenerated {len(images)} images:")
        for img in images:
            print(f"  - {img}")
        
        # Create thumbnail grid
        try:
            from PIL import Image
            
            # Calculate grid dimensions
            cols = min(3, len(images))
            rows = (len(images) + cols - 1) // cols
            
            thumb_width = 400
            thumb_height = 225
            padding = 10
            
            grid_width = cols * thumb_width + (cols + 1) * padding
            grid_height = rows * thumb_height + (rows + 1) * padding
            
            grid = Image.new("RGB", (grid_width, grid_height), "white")
            
            for i, img_name in enumerate(images):
                img_path = os.path.join(output_dir, img_name)
                img = Image.open(img_path)
                img.thumbnail((thumb_width, thumb_height))
                
                row = i // cols
                col = i % cols
                x = padding + col * (thumb_width + padding)
                y = padding + row * (thumb_height + padding)
                
                grid.paste(img, (x, y))
            
            grid_path = os.path.join(output_dir, "template-thumb.png")
            grid.save(grid_path)
            print(f"\nThumbnail grid saved to: {grid_path}")
            
        except ImportError:
            print("\nNote: Pillow not installed. Skipping thumbnail grid.")
    
    print(f"\nImages saved to: {output_dir}/")
    return images

def main():
    parser = argparse.ArgumentParser(description="Convert PPTX template to images for AI analysis")
    parser.add_argument("template", help="Path to template PPTX file")
    parser.add_argument("--output", "-o", default="images", help="Output directory")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.template):
        print(f"Error: Template not found: {args.template}")
        sys.exit(1)
    
    convert_pptx_to_images(args.template, args.output)

if __name__ == "__main__":
    main()
