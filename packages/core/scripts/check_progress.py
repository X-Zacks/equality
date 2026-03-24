import json
from pathlib import Path

data = json.loads(Path(r'C:\Users\zz\Desktop\OCR Testing\ocr_results_incremental.json').read_text(encoding='utf-8'))
print(f'Completed: {len(data)}')
print('Files:', [r["filename"] for r in data])
