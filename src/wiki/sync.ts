// wiki/sync — Wiki 同步编排
// 判断首次全量 vs 复用 → 收集素材 → 调 LLM 生成 → 落盘 + 记录元数据

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { hasWikiData, upsertWikiPage } from '../db/index.js'
import { collectProjectMaterial } from './generate.js'
import { loadSyncRules, DEFAULT_SYNC_RULES } from './rules.js'
import { OVERVIEW_PATH, WIKI_DIR } from './structure.js'
import { callLlm } from '../agent/llm.js'

/**
 * 生成 overview.md 的 prompt。
 * 把 rules 作为 system，素材作为 user。
 */
function buildOverviewPrompt(projectRoot: string): { system: string; user: string } {
  const rules = loadSyncRules(projectRoot)
  const material = collectProjectMaterial(projectRoot)
  const user = `请根据以下项目素材，生成 ${OVERVIEW_PATH}（项目速览文档）。

要求（详见系统提示的 mesync Wiki 同步规则）：
1. 项目简介：一段话说明项目是什么
2. 技术栈：语言、框架、构建工具等
3. 模块索引：列出各模块，每个模块一行简介

注意：overview 是「速览」，保持简洁，详细内容后续会生成到 wiki/ 下。

## 项目素材

${material}

请直接输出 overview.md 的 Markdown 内容，不要用代码块包裹。`

  return { system: rules, user }
}

/**
 * 首次同步：判断是否需要全量生成 overview.md。
 *
 * 逻辑（按 7c 定的方案）：
 * - SQLite 中已有该 workspace 的 wiki 数据 → 跳过（复用）
 * - 无数据 → 调 LLM 全量生成 overview.md
 *
 * @returns 是否执行了生成
 */
export async function ensureWikiSynced(ctx: Context, projectRoot: string, agent: any): Promise<boolean> {
  try {
    // 已有 wiki 数据则复用，不重复全量分析
    if (hasWikiData()) {
      return false
    }

    const { provider, model } = resolveModel(agent)
    if (!model) {
      console.warn('[mesync] no model configured, skip wiki generation')
      return false
    }

    const { system, user } = buildOverviewPrompt(projectRoot)
    const content = await callLlm(ctx, {
      provider,
      model,
      messages: [{ role: 'user', content: user }],
      system,
    })

    if (!content || !content.trim()) {
      console.warn('[mesync] LLM returned empty overview, skip')
      return false
    }

    // 落盘 overview.md
    const overviewPath = path.join(projectRoot, OVERVIEW_PATH)
    ensureDir(path.dirname(overviewPath))
    fs.writeFileSync(overviewPath, content.trim() + '\n', 'utf-8')

    // 记录元数据
    upsertWikiPage({
      path: OVERVIEW_PATH,
      git_commit: null,
      updated_at: new Date().toISOString(),
      source: 'initial',
    })

    return true
  } catch (err) {
    console.error('[mesync] wiki sync failed:', err)
    return false
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function resolveModel(agent: any): { provider: string; model: string } {
  return {
    provider: agent?.options?.provider ?? 'deepseek',
    model: agent?.options?.model ?? '',
  }
}

export { DEFAULT_SYNC_RULES, WIKI_DIR }