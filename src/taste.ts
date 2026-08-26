// Taste — 品味管理
// 提供品味信号的聚合、手动声明和反模式管理

import {
  upsertTasteSignal,
  getTasteProfile,
  updateManualTaste,
  getManualTaste,
  getAntiPatterns,
} from './db.js'
import type { TasteSignal, ParsedSignal, AntiPattern } from './db.js'

/**
 * 从决策节点更新品味信号
 */
export function updateTasteFromDecision(decisionId: string, tasteSignals: { signal: string; context: string }[]): void {
  for (const ts of tasteSignals) {
    upsertTasteSignal(ts.signal, 0.5, decisionId)
  }
}

/**
 * 加载用户手动声明的品味文件
 */
export function loadManualTaste(filePath: string): void {
  try {
    const fs = require('node:fs')
    if (!fs.existsSync(filePath)) return
    const content = fs.readFileSync(filePath, 'utf-8')
    const signals = parseManualTasteContent(content)
    updateManualTaste(content, signals)
  } catch (err) {
    console.error('[mesync] Failed to load manual taste:', err)
  }
}

/**
 * 解析手动品味声明内容
 * 格式：每行 "- signal_name: context"
 */
export function parseManualTasteContent(content: string): ParsedSignal[] {
  const signals: ParsedSignal[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    // 格式: "- signal_name: context"
    const match = trimmed.match(/^[-*]\s*(\S+)\s*:\s*(.+)/)
    if (match) {
      signals.push({ signal: match[1], context: match[2] })
    }
    // 也支持纯 "signal_name: context" 格式
    const match2 = trimmed.match(/^(\S+)\s*:\s*(.+)/)
    if (match2 && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.startsWith('#')) {
      signals.push({ signal: match2[1], context: match2[2] })
    }
  }
  return signals
}

export { upsertTasteSignal, getTasteProfile, updateManualTaste, getManualTaste, getAntiPatterns }
export type { TasteSignal, ParsedSignal, AntiPattern }