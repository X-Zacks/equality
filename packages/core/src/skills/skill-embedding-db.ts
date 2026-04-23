/**
 * skills/skill-embedding-db.ts — Skill embedding SQLite 持久化
 *
 * 将 Skill chunk embeddings 缓存到 SQLite，避免每次启动重建索引。
 */

import type Database from 'better-sqlite3'

export interface StoredChunk {
  chunkId: string
  skillName: string
  heading: string
  content: string
  embedding: Float32Array
}

export class SkillEmbeddingDB {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.ensureTable()
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_chunks (
        chunk_id    TEXT PRIMARY KEY,
        skill_name  TEXT NOT NULL,
        heading     TEXT NOT NULL,
        content     TEXT NOT NULL,
        embedding   BLOB NOT NULL,
        model_id    TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_skill_chunks_skill ON skill_chunks(skill_name);
    `)
  }

  /** 获取当前存储的 model_id（第一行），null 表示表空 */
  getStoredModelId(): string | null {
    const row = this.db.prepare('SELECT model_id FROM skill_chunks LIMIT 1').get() as
      | { model_id: string }
      | undefined
    return row?.model_id ?? null
  }

  /** 读取所有 chunks */
  getAllChunks(): StoredChunk[] {
    const rows = this.db.prepare(
      'SELECT chunk_id, skill_name, heading, content, embedding FROM skill_chunks'
    ).all() as Array<{
      chunk_id: string
      skill_name: string
      heading: string
      content: string
      embedding: Buffer
    }>

    return rows.map(r => ({
      chunkId: r.chunk_id,
      skillName: r.skill_name,
      heading: r.heading,
      content: r.content,
      embedding: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
    }))
  }

  /** 获取某个 Skill 的所有 chunk_id */
  getChunkIdsForSkill(skillName: string): string[] {
    const rows = this.db.prepare(
      'SELECT chunk_id FROM skill_chunks WHERE skill_name = ?'
    ).all(skillName) as Array<{ chunk_id: string }>
    return rows.map(r => r.chunk_id)
  }

  /** 写入 chunks（事务） */
  upsertChunks(chunks: StoredChunk[], modelId: string): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO skill_chunks (chunk_id, skill_name, heading, content, embedding, model_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction((items: StoredChunk[]) => {
      for (const c of items) {
        const buf = Buffer.from(c.embedding.buffer, c.embedding.byteOffset, c.embedding.byteLength)
        insert.run(c.chunkId, c.skillName, c.heading, c.content, buf, modelId)
      }
    })
    tx(chunks)
  }

  /** 删除某个 Skill 的所有 chunks */
  deleteSkillChunks(skillName: string): void {
    this.db.prepare('DELETE FROM skill_chunks WHERE skill_name = ?').run(skillName)
  }

  /** 清空所有 chunks */
  clear(): void {
    this.db.prepare('DELETE FROM skill_chunks').run()
  }

  /** 已存储的 Skill 名列表 */
  getStoredSkillNames(): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT skill_name FROM skill_chunks'
    ).all() as Array<{ skill_name: string }>
    return rows.map(r => r.skill_name)
  }
}
