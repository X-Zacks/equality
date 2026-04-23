/**
 * scripts/download-model.mjs — 预下载 ONNX embedding 模型
 *
 * 从 HuggingFace（或 ModelScope 镜像）下载 all-MiniLM-L6-v2 ONNX 量化模型，
 * 放置到 packages/desktop/src-tauri/resources/models/ 目录。
 *
 * 用法：node scripts/download-model.mjs [--mirror modelscope]
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MODEL_NAME = 'all-MiniLM-L6-v2'
const HF_BASE = `https://huggingface.co/Xenova/${MODEL_NAME}/resolve/main`
const MODELSCOPE_BASE = `https://www.modelscope.cn/models/sentence-transformers/${MODEL_NAME}/resolve/master`

const FILES = [
  'onnx/model_quantized.onnx',
  'tokenizer.json',
  'tokenizer_config.json',
  'config.json',
]

const useMirror = process.argv.includes('--mirror') || process.env.HF_MIRROR === 'modelscope'
const baseUrl = useMirror ? MODELSCOPE_BASE : HF_BASE
const outDir = join(process.cwd(), 'packages', 'desktop', 'src-tauri', 'resources', 'models', MODEL_NAME)

async function downloadFile(url, destPath) {
  const dir = join(destPath, '..')
  mkdirSync(dir, { recursive: true })

  if (existsSync(destPath)) {
    console.log(`  ✓ ${destPath} (cached)`)
    return
  }

  console.log(`  ↓ ${url}`)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  writeFileSync(destPath, buf)
  console.log(`  ✓ ${destPath} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`)
}

async function main() {
  console.log(`\nDownloading ${MODEL_NAME} ONNX model...`)
  console.log(`Source: ${useMirror ? 'ModelScope (CN mirror)' : 'HuggingFace'}`)
  console.log(`Destination: ${outDir}\n`)

  for (const file of FILES) {
    const url = `${baseUrl}/${file}`
    const dest = join(outDir, file)
    await downloadFile(url, dest)
  }

  console.log('\n✅ Model download complete.\n')
}

main().catch(err => {
  console.error('❌ Model download failed:', err.message)
  process.exit(1)
})
