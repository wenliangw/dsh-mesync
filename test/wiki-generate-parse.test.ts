// wiki generate prompt 解析逻辑测试

import { describe, it, expect } from 'vitest'
import {
  parseFullWikiResult,
  parseIncrementalWikiResult,
} from '@/wiki/generate.js'

describe('parseFullWikiResult', () => {
  it('解析完整 JSON（含 markdown 代码块包裹）', () => {
    const raw = `\`\`\`json
{
  "overview": "# 项目速览",
  "architecture": "# 架构",
  "business": "",
  "constraints": "# 约束",
  "modules": [
    { "name": "auth", "content": "# auth 模块" },
    { "name": "user", "content": "# user 模块" }
  ]
}
\`\`\``
    const result = parseFullWikiResult(raw)
    expect(result).not.toBeNull()
    expect(result!.overview).toContain('项目速览')
    expect(result!.architecture).toContain('架构')
    expect(result!.business).toBe('')
    expect(result!.modules).toHaveLength(2)
    expect(result!.modules[0].name).toBe('auth')
  })

  it('模块名清理非法字符', () => {
    const raw = JSON.stringify({
      overview: 'o',
      modules: [{ name: 'a/b:c.md', content: 'x' }],
    })
    const result = parseFullWikiResult(raw)
    expect(result!.modules[0].name).not.toContain('/')
    expect(result!.modules[0].name).not.toContain('.md')
  })

  it('非法 JSON 返回 null', () => {
    expect(parseFullWikiResult('not json at all')).toBeNull()
  })

  it('modules 非数组时安全处理', () => {
    const raw = JSON.stringify({ overview: 'o', modules: 'not-array' })
    const result = parseFullWikiResult(raw)
    expect(result).not.toBeNull()
    expect(result!.modules).toEqual([])
  })
})

describe('parseIncrementalWikiResult', () => {
  it('解析增量结果（空字符串字段 → null）', () => {
    const raw = JSON.stringify({
      overview: '# 更新后的 overview',
      architecture: '',
      modules: [{ name: 'auth', content: '# 新 auth' }],
      remove_modules: ['old-module'],
    })
    const result = parseIncrementalWikiResult(raw)
    expect(result).not.toBeNull()
    expect(result!.overview).toContain('更新后的')
    expect(result!.architecture).toBeNull() // 空字符串 → null
    expect(result!.modules).toHaveLength(1)
    expect(result!.removeModules).toContain('old-module')
  })

  it('非法 JSON 返回 null', () => {
    expect(parseIncrementalWikiResult('xxx')).toBeNull()
  })
})
