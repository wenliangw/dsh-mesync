// wiki/generate — LLM 生成 wiki 文档
// 收集项目素材 → 调 LLM 分析 → 生成 overview.md 及 wiki/ 下的分类文档 → 落盘 + 记录元数据

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 收集给 LLM 分析的项目素材（纯函数，可测试）。
 * 返回：目录树（限深度）+ 关键配置文件内容。
 */
export function collectProjectMaterial(projectRoot: string, opts: { maxDepth?: number } = {}): string {
  const { maxDepth = 3 } = opts
  const parts: string[] = []

  parts.push('## 项目目录结构')
  parts.push(renderTree(projectRoot, '', maxDepth))

  parts.push('')
  parts.push('## 关键配置文件')

  // 常见的关键配置文件
  const keyFiles = [
    'package.json',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
    'pom.xml',
    'build.gradle',
    'tsconfig.json',
    'vite.config.ts',
    'README.md',
  ]

  for (const file of keyFiles) {
    const full = path.join(projectRoot, file)
    if (fs.existsSync(full)) {
      const content = readCapped(full, 4000)
      parts.push(`### ${file}`)
      parts.push('```')
      parts.push(content)
      parts.push('```')
      parts.push('')
    }
  }

  return parts.join('\n')
}

/**
 * 渲染目录树（限制深度，忽略 node_modules/.git/dist 等）。
 */
function renderTree(dir: string, prefix: string, maxDepth: number, currentDepth = 0): string {
  if (currentDepth > maxDepth) return ''

  const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.mesync', 'lib'])
  let result = ''
  let entries: fs.Dirent[] = []

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !ignore.has(e.name))
      .sort((a, b) => {
        // 目录在前，文件在后，各自按名字排序
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return ''
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    result += `${prefix}${entry.isDirectory() ? entry.name + '/' : entry.name}\n`
    if (entry.isDirectory() && currentDepth < maxDepth) {
      result += renderTree(full, prefix + '  ', maxDepth, currentDepth + 1)
    }
  }
  return result
}

/**
 * 读取文件内容，超过 maxLen 截断。
 */
function readCapped(filePath: string, maxLen: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.length > maxLen ? content.slice(0, maxLen) + '\n... (截断)' : content
  } catch {
    return '(读取失败)'
  }
}

/**
 * 构建「首次全量生成 wiki」的 prompt。
 *
 * 让 LLM 一次性生成完整 wiki 结构（overview + architecture + business + modules + constraints），
 * 以 JSON 形式返回，程序据此落盘。
 */
export function buildFullWikiPrompt(projectRoot: string, rules: string): { system: string; user: string } {
  const material = collectProjectMaterial(projectRoot)
  const user = `请分析以下项目素材，生成完整的项目认知文档（wiki）。

请严格以 JSON 格式返回，结构如下：

{
  "overview": "overview.md 的 Markdown 内容",
  "architecture": "architecture.md 的 Markdown 内容（可空字符串表示无需此文档）",
  "business": "business.md 的 Markdown 内容（可空字符串）",
  "constraints": "constraints.md 的 Markdown 内容（可空字符串）",
  "modules": [
    { "name": "模块名（文件名，不含 .md）", "content": "该模块的 Markdown 内容" }
  ]
}

说明：
1. overview.md 是项目速览（简介 + 技术栈 + 模块索引），必填。
2. modules 数组列出你识别出的项目模块（模块划分由你判断，不要硬编码），每个模块一个 wiki 文档。
3. 如果项目没有明显的业务/架构/约束，对应字段返回空字符串。
4. 所有内容用中文撰写。

## 项目素材

${material}`

  return { system: rules, user }
}

/** 完整 wiki 生成的返回结构 */
export interface FullWikiResult {
  overview: string
  architecture: string
  business: string
  constraints: string
  modules: Array<{ name: string; content: string }>
}

/**
 * 解析 LLM 返回的完整 wiki JSON。
 */
export function parseFullWikiResult(raw: string): FullWikiResult | null {
  try {
    const json = extractJson(raw)
    const obj = JSON.parse(json) as any
    return {
      overview: typeof obj.overview === 'string' ? obj.overview : '',
      architecture: typeof obj.architecture === 'string' ? obj.architecture : '',
      business: typeof obj.business === 'string' ? obj.business : '',
      constraints: typeof obj.constraints === 'string' ? obj.constraints : '',
      modules: Array.isArray(obj.modules)
        ? obj.modules
            .filter((m: any) => m && typeof m.name === 'string' && typeof m.content === 'string')
            .map((m: any) => ({ name: sanitizeModuleName(m.name), content: m.content }))
        : [],
    }
  } catch {
    return null
  }
}

/** 提取 JSON（可能被 markdown 代码块包裹） */
function extractJson(raw: string): string {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1]
  const brace = raw.match(/(\{[\s\S]*\})/)
  return brace ? brace[1] : raw
}

/** 清洗模块名，避免路径穿越和非法字符 */
function sanitizeModuleName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.md$/i, '')
    .replace(/\.+$/, '')
    .trim() || 'module'
}

/**
 * 构建「增量更新 wiki」的 prompt。
 * 传入变更摘要 + 现有 wiki 内容，让 LLM 只更新受影响的部分。
 */
export function buildIncrementalWikiPrompt(
  projectRoot: string,
  rules: string,
  changeSummary: string,
  currentWiki: string
): { system: string; user: string } {
  const material = collectProjectMaterial(projectRoot)
  const user = `项目代码发生了变更，请根据变更内容增量更新项目认知文档（wiki）。

请严格以 JSON 格式返回需要更新的文档，结构如下：

{
  "overview": "更新后的 overview.md 完整 Markdown 内容（无变化则返回空字符串）",
  "architecture": "更新后的 architecture.md 完整 Markdown 内容（无变化则空）",
  "business": "更新后的 business.md 完整 Markdown 内容（无变化则空）",
  "constraints": "更新后的 constraints.md 完整 Markdown 内容（无变化则空）",
  "modules": [
    { "name": "模块名", "content": "更新后的完整内容" }
  ],
  "remove_modules": ["要删除的模块名"]
}

说明：
1. 只返回「发生变化的文档」的完整新内容，没变化的返回空字符串或省略。
2. 如果变更是纯重构（不改变对外行为），只需更新对应模块的「实现描述」。
3. 新增模块 → 在 modules 里返回新模块；删除模块 → 放到 remove_modules。
4. 用中文撰写。

## 代码变更摘要

${changeSummary}

## 当前项目素材

${material}

## 当前 wiki 内容

${currentWiki}`

  return { system: rules, user }
}

/** 增量更新的返回结构 */
export interface IncrementalWikiResult {
  overview: string | null
  architecture: string | null
  business: string | null
  constraints: string | null
  modules: Array<{ name: string; content: string }>
  removeModules: string[]
}

/**
 * 解析 LLM 返回的增量更新 JSON。
 */
export function parseIncrementalWikiResult(raw: string): IncrementalWikiResult | null {
  try {
    const json = extractJson(raw)
    const obj = JSON.parse(json) as any
    const modules = Array.isArray(obj.modules)
      ? obj.modules
          .filter((m: any) => m && typeof m.name === 'string' && typeof m.content === 'string')
          .map((m: any) => ({ name: sanitizeModuleName(m.name), content: m.content }))
      : []
    return {
      overview: nonEmptyString(obj.overview),
      architecture: nonEmptyString(obj.architecture),
      business: nonEmptyString(obj.business),
      constraints: nonEmptyString(obj.constraints),
      modules,
      removeModules: Array.isArray(obj.remove_modules)
        ? obj.remove_modules.map((n: any) => sanitizeModuleName(String(n)))
        : [],
    }
  } catch {
    return null
  }
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}
