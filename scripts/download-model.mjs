/**
 * scripts/download-model.mjs — 预下载 ONNX embedding 模型
 *
 * 从 ModelScope 下载 all-MiniLM-L6-v2 ONNX 量化模型到本地缓存目录。
 * HuggingFace 国内不可用，默认使用 ModelScope 镜像。
 *
 * 下载目录：%APPDATA%/Equality/models/all-MiniLM-L6-v2/onnx/
 * transformers.js 会从此本地目录加载模型文件。
 *
 * 用法：node scripts/download-model.mjs
 *       node scripts/download-model.mjs --hf   # 强制使用 HuggingFace（需翻墙）
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MODEL_NAME = 'all-MiniLM-L6-v2'

// hf-mirror.com 是 HuggingFace 的国内可用镜像
const HF_MIRROR_BASE = `https://hf-mirror.com/Xenova/${MODEL_NAME}/resolve/main`
// HuggingFace 原站（国内基本不可用）
const HF_BASE = `https://huggingface.co/Xenova/${MODEL_NAME}/resolve/main`

// transformers.js 需要的完整文件列表
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
]

const useHF = process.argv.includes('--hf')

// 本地缓存目录：%APPDATA%/Equality/models/all-MiniLM-L6-v2/
const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
const outDir = join(appData, 'Equality', 'models', MODEL_NAME)

function getUrl(file) {
  if (useHF) {
    return `${HF_BASE}/${file}`
  }
  return `${HF_MIRROR_BASE}/${file}`
}

async function downloadFile(file) {
  const destPath = join(outDir, file)
  const dir = join(destPath, '..')
  mkdirSync(dir, { recursive: true })

  if (existsSync(destPath)) {
    const size = statSync(destPath).size
    if (size > 0) {
      console.log(`  ✓ ${file} (cached, ${(size / 1024 / 1024).toFixed(1)}MB)`)
      return
    }
  }

  const url = getUrl(file)
  console.log(`  ↓ ${file}`)
  console.log(`    ${url.slice(0, 100)}...`)

  const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${file}: ${url}`)

  const buf = Buffer.from(await resp.arrayBuffer())
  writeFileSync(destPath, buf)
  console.log(`  ✓ ${file} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`)
}

async function main() {
  console.log(`\n📦 Downloading ${MODEL_NAME} ONNX model...`)
  console.log(`   Source: ${useHF ? 'HuggingFace' : 'hf-mirror.com (CN)'}`)
  console.log(`   Destination: ${outDir}\n`)

  mkdirSync(outDir, { recursive: true })

  for (const file of FILES) {
    await downloadFile(file)
  }

  console.log(`\n✅ Model download complete.`)
  console.log(`   模型已缓存到: ${outDir}`)
  console.log(`   TransformersEmbeddingProvider 将自动检测此目录。\n`)
}

main().catch(err => {
  console.error('❌ Model download failed:', err.message)
  console.error('   请检查网络连接，或手动下载模型文件到:')
  console.error(`   ${outDir}`)
  process.exit(1)
})
