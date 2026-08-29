// db/schema — 表结构定义
// 注意：reality_snapshots（硬编码扫描产物）已废弃，改为 wiki_pages（LLM Wiki 索引）

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  session_id    TEXT,
  decision      TEXT NOT NULL,
  trigger       TEXT,
  rationale     TEXT NOT NULL,
  evidence      TEXT,
  outcome       TEXT NOT NULL DEFAULT 'adopted',
  caused_by     TEXT,
  supersedes    TEXT,
  alternatives  TEXT NOT NULL DEFAULT '[]',
  taste_signals TEXT NOT NULL DEFAULT '[]',
  scopes        TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_caused_by ON decisions(caused_by);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decisions(outcome);

CREATE TABLE IF NOT EXISTS wiki_pages (
  path       TEXT PRIMARY KEY,
  git_commit TEXT,
  updated_at TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'initial'
);

CREATE TABLE IF NOT EXISTS meta (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
`