/**
 * crew/store.ts — Crew Template 文件存储
 *
 * 存储位置：%APPDATA%/Equality/crews/<id>.json
 * 每个 Crew Template 一个 JSON 文件。
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import type { CrewTemplate, CrewCreateInput, CrewUpdateInput } from './types.js'

// ─── 存储路径 ───────────────────────────────────────────────────────────────

function getCrewsDir(): string {
  const appData = process.env.APPDATA || join(homedir(), '.config')
  return join(appData, 'Equality', 'crews')
}

let _dirReady = false

async function ensureDir(): Promise<string> {
  const dir = getCrewsDir()
  if (!_dirReady) {
    await mkdir(dir, { recursive: true })
    _dirReady = true
  }
  return dir
}

// ─── ID 生成 ────────────────────────────────────────────────────────────────

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `crew-${ts}-${rand}`
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function listCrews(): Promise<CrewTemplate[]> {
  const dir = await ensureDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const crews: CrewTemplate[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      crews.push(JSON.parse(raw) as CrewTemplate)
    } catch {
      // 跳过损坏的文件
    }
  }
  // 按更新时间倒序
  crews.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return crews
}

export async function getCrewById(id: string): Promise<CrewTemplate | null> {
  const dir = await ensureDir()
  try {
    const raw = await readFile(join(dir, `${id}.json`), 'utf-8')
    return JSON.parse(raw) as CrewTemplate
  } catch {
    return null
  }
}

export async function createCrew(input: CrewCreateInput): Promise<CrewTemplate> {
  const dir = await ensureDir()
  const now = new Date().toISOString()
  const crew: CrewTemplate = {
    id: generateId(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  await writeFile(join(dir, `${crew.id}.json`), JSON.stringify(crew, null, 2), 'utf-8')
  return crew
}

export async function updateCrew(id: string, patch: CrewUpdateInput): Promise<CrewTemplate | null> {
  const existing = await getCrewById(id)
  if (!existing) return null
  const updated: CrewTemplate = {
    ...existing,
    ...patch,
    id: existing.id,       // 不可改
    createdAt: existing.createdAt, // 不可改
    updatedAt: new Date().toISOString(),
  }
  const dir = await ensureDir()
  await writeFile(join(dir, `${id}.json`), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

export async function deleteCrew(id: string): Promise<boolean> {
  const dir = await ensureDir()
  try {
    await unlink(join(dir, `${id}.json`))
    return true
  } catch {
    return false
  }
}
