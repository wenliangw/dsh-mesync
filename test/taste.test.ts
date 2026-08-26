// Taste 品味文件解析测试

import { describe, it, expect } from 'vitest'
import { parseManualTasteContent } from '@/tastes/taste.js'

describe('parseManualTasteContent', () => {
  it('解析 bullet 格式', () => {
    const content = `# 代码风格
- prefer-explicit-over-implicit: 不用 any 除非必要
- avoid-premature-abstraction: 先具体后抽象
`
    const signals = parseManualTasteContent(content)
    expect(signals).toHaveLength(2)
    expect(signals[0].signal).toBe('prefer-explicit-over-implicit')
    expect(signals[0].context).toBe('不用 any 除非必要')
  })

  it('解析无 bullet 的冒号格式', () => {
    const content = 'favor-composition: 优先组合\n'
    const signals = parseManualTasteContent(content)
    expect(signals).toHaveLength(1)
    expect(signals[0].signal).toBe('favor-composition')
  })

  it('忽略注释和空行', () => {
    const content = '# 这是注释\n\n- real-signal: context\n'
    const signals = parseManualTasteContent(content)
    expect(signals).toHaveLength(1)
    expect(signals[0].signal).toBe('real-signal')
  })

  it('空内容返回空数组', () => {
    expect(parseManualTasteContent('')).toEqual([])
    expect(parseManualTasteContent('# 只有注释')).toEqual([])
  })
})
