// wiki/loop — mesync 轻量 agent loop（过渡方案）
// 用 ctx.llm.stream（带 tools 参数）+ BlockAssembler 组装 + 自己 fs 执行文件工具，
// 循环直至 LLM 不再要求读文件、输出最终结果。
//
// 为什么不直接用 ctx.subagents / ctx.agents：
// - inject "subagents" 会触发 cordis 服务初始化循环，导致 dsh 进程 CPU 空转 + 内存暴涨（假死）
// - 轻量 loop 只依赖 ctx.llm（已稳定使用），完全自己控制「读文件 → 喂回 → 生成」的循环
//
// 职责边界（方案 A）：
// - loop 负责「让 LLM 读文件 → 生成 md 文档内容」并返回最终文本
// - mesync 负责「把最终文本写盘 → 扫描同步 sqlite 引用记录」

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'

/** 一次 loop 的运行结果 */
export interface WikiLoopResult {
  /** 最终 assistant 文本输出（生成的 wiki 内容） */
  outputText: string
  /** 停止原因 */
  stopReason: string
}

/** 文件工具的定义（供 LLM 发起 tool-call）：读 + 写 */
const WIKI_TOOLS = [
  {
    name: 'read',
    description: '读取工作区内一个文件的内容。参数 path 是相对于工作区根目录的文件路径。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区根目录的文件路径' },
      },
      required: ['path'],
    },
  },
  {
    name: 'glob',
    description: '列出工作区内匹配某个模式的目录/文件。参数 pattern 是 glob 模式（如 "src/**"）。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'glob 匹配模式' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description: '在工作区内搜索包含某个关键词的文件及匹配行。参数 query 是要搜索的关键词。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要搜索的关键词' },
      },
      required: ['query'],
    },
  },
  {
    name: 'write',
    description: '将一个 wiki 文档写入工作区的 .mesync/ 目录。参数 path 是相对于工作区根目录的路径（必须以 .mesync/ 开头），content 是文档的完整 Markdown 内容。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对于工作区根目录的文件路径（以 .mesync/ 开头）' },
        content: { type: 'string', description: '该文档的完整 Markdown 内容' },
      },
      required: ['path', 'content'],
    },
  },
]

/** 最大循环轮数（防止无限循环） */
const MAX_TURNS = 20

/**
 * 运行轻量 loop，让 LLM 读文件并生成 wiki 内容。
 *
 * @param ctx - mesync 的插件 context
 * @param provider - provider route（复用当前 agent 的 provider）
 * @param model - 模型 id
 * @param ruleContent - _sync_wiki.rule.md 内容（生成规则）
 * @param skillContent - _sync_wiki.skill.md 内容（工作心法）
 * @param projectRoot - 工作区根目录（读文件的范围）
 * @param extraContext - 可选附加上下文（如增量更新的变更摘要）
 * @returns loop 结果；失败返回 null
 */
export async function runWikiLoop(
  ctx: Context,
  provider: string,
  model: string,
  ruleContent: string,
  skillContent: string,
  projectRoot: string,
  extraContext?: string
): Promise<WikiLoopResult | null> {
  try {
    const llm = (ctx as any).llm
    if (!llm || typeof llm.stream !== 'function') {
      console.warn('[mesync] llm service not available')
      return null
    }

    // 初始 user 消息：skill 心法 + rule 规则 + 工作区 + 附加上下文（零硬编码生成规则）
    const sections = [
      skillContent,
      '',
      '---',
      '',
      '## 生成规则（必须遵守）',
      '',
      ruleContent,
      '',
      '---',
      '',
      '## 本次任务的工作区根目录',
      '',
      `工作区根目录（绝对路径）是：\`${projectRoot}\``,
    ]
    if (extraContext) {
      sections.push('', '---', '', extraContext)
    }
    const initialText = sections.join('\n')

    // messages 是 dsh 的 Message[]，用官方构造器（带正确 source 字段）
    const messages: any[] = [
      createUserMessage({
        content: [{ type: 'text', text: initialText }],
        source: { kind: 'plugin', plugin: 'mesync' },
      }),
    ]

    let finalText = ''
    let stopReason = 'unknown'

    // 循环：让 LLM 发起 tool-call → 执行 → 回填 → 直到输出最终文本
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = llm.stream({
        provider,
        model,
        messages,
        tools: WIKI_TOOLS,
      })

      const assembler = new BlockAssembler()
      for await (const chunk of stream) {
        assembler.push(chunk)
      }

      const blocks = assembler.blocks()
      stopReason = assembler.finish.kind

      // 收集 tool-call 和文本（显式收窄类型）
      const toolCalls = blocks.filter((b: any) => b.type === 'tool-call') as any[]
      const text = blocks
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text ?? '')
        .join('')
        .trim()

      // 调试：打印每轮的块类型、文本长度、finish reason
      const blockTypes = blocks.map((b: any) => b.type).join(',')
      const finishInfo = (assembler.finish as any)?.failure
        ? ` error=${(assembler.finish as any).failure?.code}:${(assembler.finish as any).failure?.message}`
        : ''
      console.log(`[mesync] loop turn=${turn} finish=${stopReason}${finishInfo} blocks=[${blockTypes}] textLen=${text.length} toolCalls=${toolCalls.length}`)
      if (toolCalls.length > 0) {
        for (const c of toolCalls) {
          console.log(`[mesync]   tool-call: name=${c.name} args=${String(c.arguments).slice(0, 120)}`)
        }
      }

      // 没有 tool-call → LLM 给出了最终结果
      if (toolCalls.length === 0) {
        finalText = text
        break
      }

      // 有 tool-call → 执行工具，把结果回填
      // 关键：用 dsh 官方构造器，带正确的 source 字段（手拼对象缺 source 会导致
      // 下一轮 adapter 读 source.kind 时报 Cannot read properties of undefined）。
      messages.push(createAssistantMessage({
        content: blocks,
        source: { provider, model },
      }))

      for (const call of toolCalls) {
        const result = executeWikiTool(call.name, call.arguments, projectRoot)
        messages.push(createToolResultMessage({
          callId: call.id,
          content: [{ type: 'text', text: result }],
          isError: false,
        }))
      }

      // 防止最后一轮还在循环
      if (turn === MAX_TURNS - 1) {
        console.warn('[mesync] wiki loop reached max turns, stop')
        finalText = text
      }
    }

    // write 方案下，内容已由 LLM 通过 write 工具写入文件，finalText 可能只是「完成」等短文本。
    // 只要 loop 正常结束（非 error），就算成功；后续由 sync.ts 扫描 .mesync/*.md 落盘 + 同步索引。
    if (stopReason === 'error' || stopReason === 'aborted') {
      console.warn(`[mesync] wiki loop ended with ${stopReason}`)
      return null
    }

    return { outputText: finalText, stopReason }
  } catch (err) {
    console.warn('[mesync] wiki loop failed:', err)
    return null
  }
}

/**
 * 执行一个文件工具调用，返回字符串结果。
 * 这是 mesync 自己用 fs 实现的，不经过 dsh 的 ctx.tools 事件流。
 */
function executeWikiTool(name: string, rawArgs: string, projectRoot: string): string {
  let args: any = {}
  try {
    args = JSON.parse(rawArgs || '{}')
  } catch {
    return `(工具参数解析失败：${rawArgs})`
  }

  switch (name) {
    case 'read':
      return readFile(args.path, projectRoot)
    case 'glob':
      return listFiles(args.pattern, projectRoot)
    case 'grep':
      return grepFiles(args.query, projectRoot)
    case 'write':
      return writeFile(args.path, args.content, projectRoot)
    default:
      return `(未知工具：${name})`
  }
}

/** 读取一个文件（限制大小 + 防路径穿越） */
function readFile(relPath: string | undefined, projectRoot: string): string {
  if (!relPath) return '(read 需要 path 参数)'
  const full = safeResolve(projectRoot, relPath)
  if (full === null) return '(非法路径，已拒绝)'
  try {
    const content = fs.readFileSync(full, 'utf-8')
    const maxLen = 8000
    return content.length > maxLen ? content.slice(0, maxLen) + '\n... (截断)' : content
  } catch (err: any) {
    return `(读取失败：${err?.code ?? err?.message ?? err})`
  }
}

/** 写一个 wiki 文档到 .mesync/ 下（限制路径必须在 .mesync/ 内） */
function writeFile(relPath: string | undefined, content: string | undefined, projectRoot: string): string {
  if (!relPath) return '(write 需要 path 参数)'
  if (typeof content !== 'string') return '(write 需要 content 参数)'

  // 强制路径以 .mesync/ 开头，防止写到项目其他位置
  const normalized = relPath.replace(/\\/g, '/')
  if (!normalized.startsWith('.mesync/')) {
    return `(write 路径必须以 .mesync/ 开头，收到：${relPath})`
  }
  if (!normalized.endsWith('.md')) {
    return '(write 只允许写 .md 文件)'
  }

  const full = safeResolve(projectRoot, normalized)
  if (full === null) return '(非法路径，已拒绝)'

  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content + '\n', 'utf-8')
    return `(已写入 ${normalized})`
  } catch (err: any) {
    return `(写入失败：${err?.code ?? err?.message ?? err})`
  }
}

/** 列出匹配 glob 模式的文件（简化实现） */
function listFiles(pattern: string | undefined, projectRoot: string): string {
  if (!pattern) return '(glob 需要 pattern 参数)'
  // 简化：支持 "dir/**" 和 "dir/*" 和普通路径，忽略 node_modules/.git/.mesync 等
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.mesync', 'lib'])
  const results: string[] = []

  // 去掉 ** 和 * 前缀，得到基础目录
  const base = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\/$/, '')
  const baseDir = base || '.'
  const fullBase = safeResolve(projectRoot, baseDir)
  if (fullBase === null) return '(非法路径，已拒绝)'

  try {
    walk(fullBase, fullBase, ignore, results, 0, 4)
  } catch {
    return '(列目录失败)'
  }

  return results.length > 0 ? results.join('\n') : '(无匹配文件)'
}

function walk(dir: string, base: string, ignore: Set<string>, results: string[], depth: number, maxDepth: number): void {
  if (depth > maxDepth) return
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (ignore.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = path.relative(base, full).replace(/\\/g, '/')
    if (e.isDirectory()) {
      results.push(rel + '/')
      walk(full, base, ignore, results, depth + 1, maxDepth)
    } else {
      results.push(rel)
    }
  }
}

/** 在项目内搜索关键词（简化：递归 grep 文本文件） */
function grepFiles(query: string | undefined, projectRoot: string): string {
  if (!query) return '(grep 需要 query 参数)'
  const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.mesync', 'lib'])
  const results: string[] = []
  const maxHits = 50

  try {
    grepWalk(projectRoot, projectRoot, query, ignore, results, maxHits, 0, 5)
  } catch {
    return '(搜索失败)'
  }

  return results.length > 0 ? results.join('\n') : `(未找到 "${query}")`
}

function grepWalk(
  dir: string,
  base: string,
  query: string,
  ignore: Set<string>,
  results: string[],
  maxHits: number,
  depth: number,
  maxDepth: number
): void {
  if (depth > maxDepth || results.length >= maxHits) return
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (results.length >= maxHits) return
    if (ignore.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = path.relative(base, full).replace(/\\/g, '/')
    if (e.isDirectory()) {
      grepWalk(full, base, query, ignore, results, maxHits, depth + 1, maxDepth)
    } else if (isTextFile(e.name)) {
      try {
        const content = fs.readFileSync(full, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length && results.length < maxHits; i++) {
          if (lines[i].includes(query)) {
            results.push(`${rel}:${i + 1}: ${lines[i].trim()}`)
          }
        }
      } catch {
        // 跳过二进制/读取失败
      }
    }
  }
}

function isTextFile(name: string): boolean {
  return /\.(ts|tsx|js|jsx|json|md|yml|yaml|rs|go|py|java|kt|cs|cpp|c|h|vue|svelte|css|scss|toml|txt)$/i.test(name)
}

/** 安全解析路径，防止路径穿越出 projectRoot */
function safeResolve(projectRoot: string, relPath: string): string | null {
  const full = path.resolve(projectRoot, relPath)
  if (full !== projectRoot && !full.startsWith(projectRoot + path.sep)) {
    return null
  }
  return full
}
