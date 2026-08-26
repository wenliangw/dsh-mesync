// db/types — SQLite 存储层的类型定义

// ---- 决策链（Decisions）----

export interface DecisionNode {
  id: string
  created_at: string
  session_id: string | null
  decision: string
  trigger: string | null
  rationale: string
  evidence: string | null
  outcome: 'adopted' | 'reverted' | 'refined' | 'pending'
  caused_by: string | null
  supersedes: string | null
  alternatives: Alternative[]
  taste_signals: TasteSignalRef[]
}

export interface Alternative {
  option: string
  why_not: string
}

export interface TasteSignalRef {
  signal: string
  context: string
}

// ---- 品味（Tastes）----

export interface TasteSignal {
  id: string
  signal: string
  weight: number
  examples: string[] // DecisionNode id 列表
  updated_at: string
}

export interface ManualTaste {
  id: string
  content: string
  parsed_signals: ParsedSignal[]
  created_at: string
  updated_at: string
}

export interface ParsedSignal {
  signal: string
  context: string
}

export interface AntiPattern {
  id: string
  pattern: string
  context: string | null
  from_decisions: string[]
  from_manual: string | null
  updated_at: string
}

// ---- Wiki 元数据 ----

/** Wiki 文档的索引记录（.mesync/wiki/ 下的每个 md 文档对应一行） */
export interface WikiPage {
  /** 相对 .mesync/ 的路径，如 'wiki/architecture.md' 或 'overview.md' */
  path: string
  /** 生成/更新时的 git commit hash */
  git_commit: string | null
  /** 最近更新时间 */
  updated_at: string
  /** 生成方式：initial（首次全量）| incremental（增量）| manual（用户手动） */
  source: 'initial' | 'incremental' | 'manual'
}