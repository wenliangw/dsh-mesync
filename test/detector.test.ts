// Detector 决策信号检测逻辑测试

import { describe, it, expect } from 'vitest'
import {
  detectDecisionSignal,
  detectExplicitChoice,
  detectRememberKeyword,
  estimateRepeatCount,
} from '@/decisions/detector.js'
import type { TurnSummary } from '@/decisions/detector.js'

function makeTurn(overrides: Partial<TurnSummary> = {}): TurnSummary {
  return {
    userMessages: [],
    toolCalls: [],
    filesModified: [],
    hasExplicitChoice: false,
    hasRememberKeyword: false,
    repeatCount: 0,
    moduleCount: 0,
    ...overrides,
  }
}

describe('detectRememberKeyword', () => {
  it('识别「记住」', () => {
    expect(detectRememberKeyword('记住这个设计决策')).toBe(true)
  })

  it('识别「记下」', () => {
    expect(detectRememberKeyword('记下这个规矩')).toBe(true)
  })

  it('识别英文 remember this', () => {
    expect(detectRememberKeyword('please remember this decision')).toBe(true)
  })

  it('普通对话不误判', () => {
    expect(detectRememberKeyword('今天天气不错')).toBe(false)
  })
})

describe('detectExplicitChoice', () => {
  it('识别「哪个好」', () => {
    expect(detectExplicitChoice('你觉得方案A还是方案B哪个好？')).toBe(true)
  })

  it('识别「选哪个」', () => {
    expect(detectExplicitChoice('这两个选哪个？')).toBe(true)
  })

  it('识别「你决定」', () => {
    expect(detectExplicitChoice('你来决定用哪种')).toBe(true)
  })

  it('普通描述不误判', () => {
    expect(detectExplicitChoice('帮我写一个组件')).toBe(false)
  })
})

describe('estimateRepeatCount', () => {
  it('统计同一文件被修改次数', () => {
    const count = estimateRepeatCount(
      ['a.ts', 'a.ts', 'a.ts', 'b.ts'],
      []
    )
    expect(count).toBe(3)
  })

  it('编辑工具调用也计入', () => {
    const count = estimateRepeatCount(['a.ts'], ['edit', 'edit', 'edit'])
    expect(count).toBe(3)
  })
})

describe('detectDecisionSignal', () => {
  it('显式「记住」优先级最高，直接返回', () => {
    const signals = detectDecisionSignal(makeTurn({ hasRememberKeyword: true }))
    expect(signals).not.toBeNull()
    expect(signals![0].type).toBe('explicit_remember')
    expect(signals!).toHaveLength(1)
  })

  it('反复调整 >= 3 次触发信号', () => {
    const signals = detectDecisionSignal(makeTurn({ repeatCount: 3 }))
    expect(signals).not.toBeNull()
    expect(signals!.some((s) => s.type === 'repeated_adjustment')).toBe(true)
  })

  it('显式选择触发信号', () => {
    const signals = detectDecisionSignal(makeTurn({ hasExplicitChoice: true }))
    expect(signals).not.toBeNull()
    expect(signals!.some((s) => s.type === 'explicit_choice')).toBe(true)
  })

  it('复杂任务（多模块+多文件）触发信号', () => {
    const signals = detectDecisionSignal(
      makeTurn({ moduleCount: 3, filesModified: ['a', 'b', 'c'] })
    )
    expect(signals).not.toBeNull()
    expect(signals!.some((s) => s.type === 'complex_task')).toBe(true)
  })

  it('普通对话不触发', () => {
    expect(detectDecisionSignal(makeTurn())).toBeNull()
  })
})
