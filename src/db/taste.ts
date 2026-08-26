// db/taste — taste 相关表 CRUD

import { getDB } from './connection.js'
import type { TasteSignal, ManualTaste, ParsedSignal, AntiPattern } from './types.js'

export function upsertTasteSignal(signal: string, weight: number, exampleId: string): void {
  const d = getDB()
  const now = new Date().toISOString()
  const existing = d.prepare('SELECT * FROM taste_signals WHERE signal = ?').get(signal) as any

  if (existing) {
    const examples = JSON.parse(existing.examples || '[]')
    if (!examples.includes(exampleId)) examples.push(exampleId)
    const newWeight = (existing.weight * examples.length + weight) / (examples.length + 1)
    d.prepare(
      'UPDATE taste_signals SET weight = ?, examples = ?, updated_at = ? WHERE signal = ?'
    ).run(newWeight, JSON.stringify(examples), now, signal)
  } else {
    d.prepare(
      'INSERT INTO taste_signals (id, signal, weight, examples, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), signal, weight, JSON.stringify([exampleId]), now)
  }
}

export function getTasteProfile(): TasteSignal[] {
  const d = getDB()
  return (d.prepare('SELECT * FROM taste_signals ORDER BY weight DESC').all() as any[])
    .map((r: any) => ({ ...r, examples: JSON.parse(r.examples || '[]') }))
}

export function updateManualTaste(content: string, parsedSignals: ParsedSignal[]): void {
  const d = getDB()
  const now = new Date().toISOString()
  const existing = d.prepare('SELECT * FROM taste_manual LIMIT 1').get() as any

  if (existing) {
    d.prepare(
      'UPDATE taste_manual SET content = ?, parsed_signals = ?, updated_at = ? WHERE id = ?'
    ).run(content, JSON.stringify(parsedSignals), now, existing.id)
  } else {
    d.prepare(
      'INSERT INTO taste_manual (id, content, parsed_signals, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), content, JSON.stringify(parsedSignals), now, now)
  }
}

export function getManualTaste(): ManualTaste | null {
  const d = getDB()
  const row = d.prepare('SELECT * FROM taste_manual LIMIT 1').get() as any
  if (!row) return null
  return { ...row, parsed_signals: JSON.parse(row.parsed_signals || '[]') }
}

export function getAntiPatterns(): AntiPattern[] {
  const d = getDB()
  return (d.prepare('SELECT * FROM anti_patterns').all() as any[])
    .map((r: any) => ({ ...r, from_decisions: JSON.parse(r.from_decisions || '[]') }))
}