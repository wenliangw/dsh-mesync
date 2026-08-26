// Reality — 项目现状管理
// 自动从项目文件提取 tech stack、模块结构、架构信息

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getLatestReality,
  getNextRealityVersion,
  createRealitySnapshot,
} from './db.js'
import type { ModuleInfo, RealitySnapshot } from './db.js'

/**
 * 从项目根目录扫描并生成最新的项目现状快照
 */
export function scanProjectReality(projectRoot: string, sessionId?: string): RealitySnapshot | null {
  try {
    const techStack = detectTechStack(projectRoot)
    const modules = detectModules(projectRoot)
    const previous = getLatestReality()

    const snapshot: RealitySnapshot = {
      id: crypto.randomUUID(),
      version: getNextRealityVersion(),
      created_at: new Date().toISOString(),
      session_id: sessionId || null,
      overview: previous?.overview || null,
      tech_stack: techStack,
      architecture: previous?.architecture || {},
      modules,
      data_flow: previous?.data_flow || {},
      constraints: previous?.constraints || [],
      diff_summary: generateDiff(previous, { techStack, modules }),
    }

    createRealitySnapshot(snapshot)
    return snapshot
  } catch (err) {
    console.error('[mesync] Failed to scan project reality:', err)
    return null
  }
}

/**
 * 检测技术栈
 */
function detectTechStack(projectRoot: string): Record<string, unknown> {
  const stack: Record<string, unknown> = {}

  // Node.js
  const pkgJson = readJSON(path.join(projectRoot, 'package.json'))
  if (pkgJson) {
    stack.runtime = 'Node.js'
    stack.package_manager = fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml')) ? 'pnpm'
      : fs.existsSync(path.join(projectRoot, 'yarn.lock')) ? 'yarn'
      : fs.existsSync(path.join(projectRoot, 'package-lock.json')) ? 'npm'
      : 'unknown'
    if (pkgJson.dependencies) {
      const deps = Object.keys(pkgJson.dependencies)
      if (deps.includes('react')) stack.framework = 'React'
      if (deps.includes('next')) stack.framework = 'Next.js'
      if (deps.includes('vue')) stack.framework = 'Vue'
      if (deps.includes('express')) stack.framework = 'Express'
      if (deps.includes('better-sqlite3')) stack.database = 'SQLite'
      if (deps.includes('typescript')) stack.language = 'TypeScript'
    }
  }

  // Rust
  const cargoToml = readTOML(path.join(projectRoot, 'Cargo.toml'))
  if (cargoToml) {
    stack.runtime = 'Rust'
    stack.language = 'Rust'
    if (cargoToml.package?.edition) stack.edition = cargoToml.package.edition
  }

  // Python
  if (fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
    stack.language = 'Python'
  }

  // Go
  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    stack.language = 'Go'
    stack.runtime = 'Go'
  }

  // CI/CD
  if (fs.existsSync(path.join(projectRoot, '.github', 'workflows'))) {
    stack.ci = 'GitHub Actions'
  }

  return stack
}

/**
 * 检测模块结构
 */
function detectModules(projectRoot: string): ModuleInfo[] {
  const modules: ModuleInfo[] = []
  const srcDir = path.join(projectRoot, 'src')

  if (!fs.existsSync(srcDir)) return modules

  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        modules.push({
          name: `src/${entry.name}/`,
          desc: '',
          status: 'stable',
          path: `src/${entry.name}/`,
        })
      }
    }
  } catch {
    // ignore
  }

  return modules
}

/**
 * 读取 JSON 文件
 */
function readJSON(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 简单读取 TOML 的 package 部分
 */
function readTOML(filePath: string): Record<string, any> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const result: Record<string, any> = {}
    let currentSection: string | null = null
    for (const line of content.split('\n')) {
      const sectionMatch = line.match(/^\[(\w+)\]/)
      if (sectionMatch) {
        currentSection = sectionMatch[1]
        result[currentSection] = {}
        continue
      }
      const kvMatch = line.match(/^(\w+)\s*=\s*["'](.+)["']/)
      if (kvMatch && currentSection) {
        result[currentSection][kvMatch[1]] = kvMatch[2]
      }
    }
    return result
  } catch {
    return null
  }
}

/**
 * 生成变更摘要
 */
function generateDiff(
  previous: RealitySnapshot | null,
  current: { techStack: Record<string, unknown>; modules: ModuleInfo[] }
): string {
  if (!previous) return 'Initial snapshot'
  const changes: string[] = []

  // 比较 tech stack
  const prevStack = previous.tech_stack || {}
  const currStack = current.techStack
  for (const [key, value] of Object.entries(currStack)) {
    if (prevStack[key] !== value) {
      changes.push(`tech_stack.${key}: ${prevStack[key] || 'none'} → ${value}`)
    }
  }

  // 比较模块
  const prevModules = new Set(previous.modules?.map(m => m.name) || [])
  const currModules = new Set(current.modules.map(m => m.name))
  for (const m of currModules) {
    if (!prevModules.has(m)) changes.push(`+ module: ${m}`)
  }
  for (const m of prevModules) {
    if (!currModules.has(m)) changes.push(`- module: ${m}`)
  }

  return changes.length > 0 ? changes.join('; ') : 'No structural changes'
}