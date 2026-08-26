// Taste — 品味管理
// 提供品味信号的聚合、手动声明和反模式管理
// 支持单文件 (.md) 和目录 (/tastes/*.md) 两种声明方式

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  upsertTasteSignal,
  getTasteProfile,
  updateManualTaste,
  getManualTaste,
  getAntiPatterns,
} from '../db/index.js'
import type { TasteSignal, ParsedSignal, AntiPattern } from '../db/index.js'

/**
 * 从决策节点更新品味信号
 */
export function updateTasteFromDecision(decisionId: string, tasteSignals: { signal: string; context: string }[]): void {
  for (const ts of tasteSignals) {
    upsertTasteSignal(ts.signal, 0.5, decisionId)
  }
}

/**
 * 加载用户手动声明的品味
 * 支持单文件或目录批量加载
 */
export function loadManualTaste(tastePath: string): void {
  try {
    const stat = fs.statSync(tastePath)

    if (stat.isDirectory()) {
      // 目录模式：遍历所有 .md/.txt 文件
      const files = fs.readdirSync(tastePath)
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        .sort()

      for (const file of files) {
        const filePath = path.join(tastePath, file)
        if (fs.statSync(filePath).isFile()) {
          loadTasteFile(filePath)
        }
      }
    } else if (stat.isFile()) {
      // 单文件模式
      loadTasteFile(tastePath)
    }
  } catch (err) {
    // 路径不存在时静默跳过
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[mesync] Failed to load manual taste:', err)
    }
  }
}

/**
 * 加载单个品味文件
 */
function loadTasteFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    if (!content.trim()) return

    const signals = parseManualTasteContent(content)
    if (signals.length > 0) {
      updateManualTaste(content, signals)
    }
  } catch (err) {
    console.error(`[mesync] Failed to load taste file ${filePath}:`, err)
  }
}

/**
 * 解析手动品味声明内容
 *
 * 支持的格式：
 *   - signal_name: context
 *   - - signal_name: context
 *   - # 注释行（忽略）
 */
export function parseManualTasteContent(content: string): ParsedSignal[] {
  const signals: ParsedSignal[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // 格式: "- signal_name: context"
    const bulletMatch = trimmed.match(/^[-*]\s*(\S+)\s*:\s*(.+)/)
    if (bulletMatch) {
      signals.push({ signal: bulletMatch[1], context: bulletMatch[2].trim() })
      continue
    }

    // 格式: "signal_name: context"
    const plainMatch = trimmed.match(/^(\S+)\s*:\s*(.+)/)
    if (plainMatch) {
      signals.push({ signal: plainMatch[1], context: plainMatch[2].trim() })
    }
  }

  return signals
}

export { upsertTasteSignal, getTasteProfile, updateManualTaste, getManualTaste, getAntiPatterns }
export type { TasteSignal, ParsedSignal, AntiPattern }