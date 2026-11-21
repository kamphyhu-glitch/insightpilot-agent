import { z } from 'zod'
import { isLiveAnalysisEnabled } from '../deployment-mode'
import { PlanningClarificationError } from './planning-feedback'
import type { RuntimeMode } from './types'

export class AnalysisHttpError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export function requireAnalysisMode(mode: RuntimeMode) {
  if (mode === 'e2b' && !isLiveAnalysisEnabled()) {
    throw new AnalysisHttpError('当前环境只开放公开演示，请使用 Demo 模式。', 403)
  }
}

export async function readAnalysisRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const origin = request.headers.get('origin')
  if (origin) {
    // Next.js may normalize request.url to localhost behind its Node server.
    // The browser's Host header retains the public authority, including port.
    const targetHost = request.headers.get('host') ?? new URL(request.url).host
    let originHost: string
    try { originHost = new URL(origin).host }
    catch { throw new AnalysisHttpError('不接受跨站执行请求。', 403) }
    if (!originHost || originHost !== targetHost || request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new AnalysisHttpError('不接受跨站执行请求。', 403)
    }
  }
  // The CSV byte limit is separate; JSON escaping can expand valid CSV text.
  const maxBodyBytes = 7_000_000
  if (Number(request.headers.get('content-length')) > maxBodyBytes) {
    throw new AnalysisHttpError('请求过大，请上传 1 MiB 以内的 CSV。', 413)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new AnalysisHttpError('请求内容不能为空。')
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > maxBodyBytes) {
      await reader.cancel()
      throw new AnalysisHttpError('请求过大，请上传 1 MiB 以内的 CSV。', 413)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let body: unknown
  try { body = JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new AnalysisHttpError('请求必须是有效 JSON。') }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AnalysisHttpError('请求字段无效，请检查 CSV、分析目标与执行模式。')
  return parsed.data
}

export function visitorKey(request: Request, header: string) {
  const key = request.headers.get(header)?.trim()
  return key && key.length >= 8 && key.length <= 256 && /^[\x21-\x7e]+$/.test(key) ? key : null
}

export function analysisError(error: unknown) {
  if (error instanceof PlanningClarificationError) return Response.json({
    code: 'clarification_required', reason: error.reason, error: error.message, suggestions: error.suggestions,
  }, { status: 422 })
  if (error instanceof AnalysisHttpError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ error: '模型或执行器返回的数据不符合分析格式。' }, { status: 422 })
  // Only our Chinese validation errors are exposed. Provider/network errors stay private.
  const message = error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
    ? error.message : '请求未完成，请检查模型 / E2B Key、额度或网络后重试。'
  return Response.json({ error: message }, { status: 400 })
}
