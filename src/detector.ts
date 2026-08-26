// Detector — 决策信号检测
// 规则引擎，不调 LLM。从 turn 事件中检测是否需要提取决策节点。

/**
 * 检测信号类型
 */
export type SignalType = 'repeated_adjustment' | 'explicit_choice' | 'complex_task' | 'explicit_remember'

export interface DecisionSignal {
  type: SignalType
  confidence: number // 0-1
  context: string    // 触发上下文描述
}

/**
 * Turn 事件的简化表示。调用方从 session event 流中提取。
 */
export interface TurnSummary {
  /** 用户消息内容 */
  userMessages: string[]
  /** 工具调用名称列表 */
  toolCalls: string[]
  /** 修改的文件路径列表 */
  filesModified: string[]
  /** 是否包含用户显式选择（"选A"、"哪个好"等） */
  hasExplicitChoice: boolean
  /** 是否包含"记住"关键词 */
  hasRememberKeyword: boolean
  /** 修改次数（同一文件/功能被修改的次数） */
  repeatCount: number
  /** 涉及的模块数量 */
  moduleCount: number
}

/**
 * 检测决策信号
 * 返回 null 表示不触发提取，返回信号数组表示触发
 */
export function detectDecisionSignal(turn: TurnSummary): DecisionSignal[] | null {
  const signals: DecisionSignal[] = []

  // 1. 用户显式"记住"
  if (turn.hasRememberKeyword) {
    signals.push({
      type: 'explicit_remember',
      confidence: 1.0,
      context: 'User explicitly asked to remember',
    })
    return signals // 显式标记优先级最高，直接返回
  }

  // 2. 反复调整同一东西 >= 3 次
  if (turn.repeatCount >= 3) {
    signals.push({
      type: 'repeated_adjustment',
      confidence: Math.min(1.0, turn.repeatCount * 0.3),
      context: `Same file/feature modified ${turn.repeatCount} times in this turn`,
    })
  }

  // 3. 用户明确让选择方案
  if (turn.hasExplicitChoice) {
    signals.push({
      type: 'explicit_choice',
      confidence: 0.8,
      context: 'User explicitly asked to choose between options',
    })
  }

  // 4. 复杂需求：涉及多模块且有架构影响
  if (turn.moduleCount >= 2 && turn.filesModified.length >= 3) {
    signals.push({
      type: 'complex_task',
      confidence: 0.6,
      context: `Task spans ${turn.moduleCount} modules and ${turn.filesModified.length} files`,
    })
  }

  return signals.length > 0 ? signals : null
}

/**
 * 从对话文本中检测"显式选择"模式
 */
export function detectExplicitChoice(text: string): boolean {
  const choicePatterns = [
    /你觉得.*[还还还是]/,
    /选[哪那]个/,
    /A.*B.*[还还还是]/,
    /哪个.*[好好合适]/,
    /你[觉感]得.*怎么[样做]/,
    /[应应]该.*[还还还是]/,
    /哪种.*方案/,
    /你[决抉]定/,
  ]
  return choicePatterns.some(p => p.test(text))
}

/**
 * 从对话文本中检测"记住"关键词
 */
export function detectRememberKeyword(text: string): boolean {
  const rememberPatterns = [
    /记住/,
    /记下/,
    /记录.*这个/,
    /remember this/i,
    /别忘了.*这个/,
  ]
  return rememberPatterns.some(p => p.test(text))
}

/**
 * 从工具调用和文件修改中估算重复调整次数
 */
export function estimateRepeatCount(filesModified: string[], toolCalls: string[]): number {
  // 统计同一文件被修改的次数
  const fileCounts = new Map<string, number>()
  for (const f of filesModified) {
    fileCounts.set(f, (fileCounts.get(f) || 0) + 1)
  }
  const maxRepeat = Math.max(0, ...fileCounts.values())

  // 编辑工具调用次数也计入
  const editTools = toolCalls.filter(t =>
    t === 'write' || t === 'edit' || t === 'write_to_file' || t === 'replace_in_file'
  ).length

  return Math.max(maxRepeat, editTools)
}