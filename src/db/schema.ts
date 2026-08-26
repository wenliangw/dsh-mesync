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
  taste_signals TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_caused_by ON decisions(caused_by);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decisions(outcome);

CREATE TABLE IF NOT EXISTS taste_signals (
  id            TEXT PRIMARY KEY,
  signal        TEXT NOT NULL,
  weight        REAL NOT NULL DEFAULT 0.0,
  examples      TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_taste_signal ON taste_signals(signal);

CREATE TABLE IF NOT EXISTS taste_manual (
  id             TEXT PRIMARY KEY,
  content        TEXT NOT NULL,
  parsed_signals TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anti_patterns (
  id             TEXT PRIMARY KEY,
  pattern        TEXT NOT NULL,
  context        TEXT,
  from_decisions  TEXT NOT NULL DEFAULT '[]',
  from_manual    TEXT,
  updated_at     TEXT NOT NULL
);

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