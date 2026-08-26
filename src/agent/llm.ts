// agent/llm — 封装 ctx.llm 调用
// 统一处理：stream 调用、文本提取、错误处理

import type { Context } from '@deepseek-ai/cordis'

/** 一次 LLM 调用的参数（已核对 dsh 真实 API） */
export interface LlmCallOptions {
  provider: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string
  maxTokens?: number
}

/**
 * 调用 LLM 并返回完整文本（非流式，内部消费流）。
 * 返回 null 表示调用失败（错误已记录）。
 */
export async function callLlm(ctx: Context, options: LlmCallOptions): Promise<string | null> {
  try {
    const llm = (ctx as any).llm
    if (!llm) {
      console.warn('[mesync] LLM service not available')
      return null
    }

    const stream = llm.stream({
      provider: options.provider,
      model: options.model,
      messages: options.messages,
      system: options.system,
      maxTokens: options.maxTokens,
    })

    let raw = ''
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        raw += chunk.text
      }
      if (chunk.type === 'finish') break
    }
    return raw
  } catch (err) {
    console.warn('[mesync] LLM call failed:', err)
    return null
  }
}

/**
 * 从 agent 获取当前使用的 provider/model。
 * agent.options = { provider?, model? }，缺省时用兜底值。
 */
export function resolveAgentModel(agent: any): { provider: string; model: string } {
  const provider = agent?.options?.provider ?? 'deepseek'
  const model = agent?.options?.model ?? ''
  return { provider, model }
}