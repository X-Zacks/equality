/**
 * crew/types.ts — Crew Template 类型定义
 *
 * Crew 是"任务执行体"的可复用配置模板，绑定精选 Skills、自定义 System Prompt、工具过滤等。
 */

export interface CrewTemplate {
  id: string                    // nanoid 生成
  name: string                  // 显示名称
  description: string           // 一句话描述
  emoji?: string                // 头像 emoji
  systemPromptExtra?: string    // 追加到默认 System Prompt 后
  skillNames: string[]          // 绑定的 Skill 名称列表
  toolAllow?: string[]          // 工具白名单（不设则全量）
  toolDeny?: string[]           // 工具黑名单
  preferredModel?: string       // 模型偏好覆盖
  maxToolLoops?: number         // 工具循环上限覆盖
  source: CrewSource
  createdAt: string
  updatedAt: string
}

export type CrewSource = 'builtin' | 'user-created' | 'gallery-downloaded' | 'chat-generated'

/** 创建 Crew Template 的输入（id/createdAt/updatedAt 自动生成） */
export type CrewCreateInput = Omit<CrewTemplate, 'id' | 'createdAt' | 'updatedAt'>

/** 更新 Crew Template 的输入（部分字段） */
export type CrewUpdateInput = Partial<Omit<CrewTemplate, 'id' | 'createdAt' | 'updatedAt'>>
