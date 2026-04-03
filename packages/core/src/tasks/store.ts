/**
 * tasks/store.ts — 任务持久化（JSON 快照）
 *
 * Phase E1: 与 session/persist.ts 风格一致，使用 %APPDATA%/Equality/tasks/ 目录。
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TaskRecord } from './types.js'

function tasksDir(): string {
  const appData = process.env.APPDATA ?? join(process.env.HOME ?? '.', '.config')
  return join(appData, 'Equality', 'tasks')
}

const SNAPSHOT_FILE = 'task-snapshot.json'

export interface TaskStore {
  load(): Promise<TaskRecord[]>
  save(records: TaskRecord[]): Promise<void>
}

/**
 * JSON 文件快照存储。
 * 全量写入 / 全量读取，适合 V1 任务量（< 1000）。
 */
export class JsonTaskStore implements TaskStore {
  private dir: string
  private file: string

  constructor(customDir?: string) {
    this.dir = customDir ?? tasksDir()
    this.file = join(this.dir, SNAPSHOT_FILE)
  }

  async load(): Promise<TaskRecord[]> {
    if (!existsSync(this.file)) return []
    try {
      const raw = await readFile(this.file, 'utf8')
      const data = JSON.parse(raw)
      if (!Array.isArray(data)) {
        console.warn('[TaskStore] 快照格式无效, 忽略')
        return []
      }
      return data as TaskRecord[]
    } catch (err) {
      console.warn('[TaskStore] 读取快照失败:', err)
      return []
    }
  }

  async save(records: TaskRecord[]): Promise<void> {
    try {
      if (!existsSync(this.dir)) {
        await mkdir(this.dir, { recursive: true })
      }
      const json = JSON.stringify(records, null, 2)
      await writeFile(this.file, json, 'utf8')
    } catch (err) {
      console.warn('[TaskStore] 写入快照失败:', err)
    }
  }
}

/**
 * 内存 store（测试用）——不写磁盘
 */
export class InMemoryTaskStore implements TaskStore {
  private records: TaskRecord[] = []

  async load(): Promise<TaskRecord[]> {
    return [...this.records]
  }

  async save(records: TaskRecord[]): Promise<void> {
    this.records = [...records]
  }

  /** 直接读取存储的内容（测试断言用） */
  getSnapshot(): TaskRecord[] {
    return [...this.records]
  }
}
