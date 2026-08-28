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

    // 关键：dsh 的 GenerateOptions.messages 是 Message[]，content 是 ContentBlock[]
    // （[{ type: 'text', text }]），不是纯字符串。传字符串会导致 adapter 拿到
    // 无法解析的 content，LLM 返回空。这里做一次转换。
    const messages = options.messages.map(m => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    }))

    const stream = llm.stream({
      provider: options.provider,
      model: options.model,
      messages,
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
 * 从 agent 获取当前使用的 provider/model，带兜底链。
 *
 * 解析顺序：
 * 1. agent.options 显式指定（最优先）
 * 2. session 的 request header config（agent 已选定模型时）
 * 3. ctx.agentDefaultModel.currentSelection()（dsh 全局默认模型）
 *
 * 关键场景：新建会话时（session-start），模型尚未选定，前两条都拿不到，
 * 此时必须用全局默认模型兜底，否则 wiki 全量生成会被跳过（要等第一条
 * 消息选定模型后才触发）。
 */
export function resolveAgentModel(
  agent: any,
  ctx?: Context | null
): { provider: string; model: string } | null {
  // 1. 优先显式 options
  let provider = agent?.options?.provider
  let model = agent?.options?.model

  // 2. 回退到 session 的 request header config（agent 未显式传 options 时也能取到）
  if (!provider || !model) {
    const config = agent?.session?.requestHeader?.()?.config
    provider = provider ?? config?.provider
    model = model ?? config?.model
  }

  // 3. 回退到 dsh 全局默认模型（新建会话时模型未选定，必须靠它兜底）
  if (!provider || !model) {
    const fallback = (ctx as any)?.agentDefaultModel?.currentSelection?.()
    provider = provider ?? fallback?.provider
    model = model ?? fallback?.model
  }

  if (!provider || !model) return null
  return { provider, model }
}