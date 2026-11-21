import { executionEventSchema, type AnalysisResult, type ExecutionPhase, type ProgressEvent } from './types'

export class ExecutionStreamError extends Error {
  constructor(message: string, public phase?: ExecutionPhase) { super(message); this.name = 'ExecutionStreamError' }
}

/** A result remains tentative until the stream closes cleanly with exactly one terminal result. */
export async function readExecutionStream(stream: ReadableStream<Uint8Array>, onProgress: (event: ProgressEvent) => void): Promise<AnalysisResult> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = ''
  let received: AnalysisResult | undefined
  let phase: ExecutionPhase | undefined
  function handle(line: string) {
    if (!line.trim()) return
    if (received) throw new ExecutionStreamError('结果终态后收到额外事件，已阻止报告发布。', phase)
    let raw: unknown
    try { raw = JSON.parse(line) } catch { throw new ExecutionStreamError('结果传输格式不完整，请重新规划。', phase) }
    const parsed = executionEventSchema.safeParse(raw)
    if (!parsed.success) throw new ExecutionStreamError('执行事件或结果未通过格式校验，已阻止报告发布。', phase)
    const event = parsed.data
    if (event.type === 'error') throw new ExecutionStreamError(event.message, event.phase)
    if (event.type === 'progress') { phase = event.phase; onProgress(event) }
    else received = event.result
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      if (pending.length > 8_000_000) throw new ExecutionStreamError('结果传输超过安全大小限制。', phase)
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) handle(line)
    }
    handle(pending + decoder.decode())
    if (!received) throw new ExecutionStreamError('连接中断，未取得完整结果；请重新规划后执行。', phase)
    return received
  } catch (error) {
    try { await reader.cancel() } catch { /* already closed or transport failed */ }
    if (error instanceof ExecutionStreamError) throw error
    throw new ExecutionStreamError('结果传输中断，未发布报告；请重新规划后执行。', phase)
  } finally { reader.releaseLock() }
}
