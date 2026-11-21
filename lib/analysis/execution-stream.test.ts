import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readExecutionStream, ExecutionStreamError } from './execution-stream'
import { computeAnalysis, verifyAnalysis } from './compute'
import { parseCsv } from './csv'
import { sampleDataset } from './sample'
import type { AnalysisResult } from './types'

const values = computeAnalysis(parseCsv(sampleDataset.csv), {
  title: 'Revenue', kind: 'aggregate', groupBy: 'channel', metric: 'revenue', aggregation: 'sum',
})
const result: AnalysisResult = {
  mode: 'demo', values, checks: verifyAnalysis(values, values),
  cleanup: 'not_needed', report: '# Verified report', durationMs: 12,
}
const progress = { type: 'progress', phase: 'analysis', status: 'running', message: '正在计算', timestamp: '2026-11-18T08:00:00.000Z' }

function stream(events: unknown[], chunkSize = 17) {
  const bytes = new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join('\n'))
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < bytes.length; index += chunkSize) controller.enqueue(bytes.slice(index, index + chunkSize))
      controller.close()
    },
  })
}

describe('validated execution stream and terminal state', () => {
  it('decodes split UTF-8 and a final line without a newline', async () => {
    const events: string[] = []
    const received = await readExecutionStream(stream([progress, { type: 'result', result }], 1), (event) => events.push(event.message))
    assert.equal(received.values.total, 69_900)
    assert.deepEqual(events, ['正在计算'])
  })
  it('waits for a clean end before publishing a result', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const pending = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    let settled = false
    const completion = readExecutionStream(pending, () => {}).then((value) => { settled = true; return value })
    controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'result', result }) + '\n'))
    await new Promise<void>(setImmediate)
    assert.equal(settled, false)
    controller.close()
    assert.equal((await completion).values.total, 69_900)
  })
  it('rejects an error after a tentative result instead of showing verified success', async () => {
    await assert.rejects(readExecutionStream(stream([
      { type: 'result', result }, { type: 'error', phase: 'report', message: '报告传输失败' },
    ]), () => {}), /终态|结果|传输/)
  })
  it('rejects malformed data, unknown events and duplicate results', async () => {
    for (const events of [
      [{ ...progress, phase: 'invented' }],
      [{ type: 'unknown' }],
      [{ type: 'result', result }, { type: 'result', result }],
      [{ type: 'result', result: { ...result, checks: [] } }],
      [{ type: 'result', result: { ...result, checks: [{ name: '合计', passed: false, detail: 'mismatch' }] } }],
    ]) await assert.rejects(readExecutionStream(stream(events), () => {}))
  })
  it('rejects truncated or missing results and releases the reader lock', async () => {
    const input = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"result"')); controller.close() } })
    await assert.rejects(readExecutionStream(input, () => {}))
    assert.equal(input.locked, false)
    await assert.rejects(readExecutionStream(stream([progress]), () => {}), /未取得完整结果/)
  })
  it('reports the failed phase even when cleanup was the latest progress event', async () => {
    await assert.rejects(readExecutionStream(stream([
      progress,
      { ...progress, phase: 'cleanup', status: 'completed' },
      { type: 'error', phase: 'analysis', message: 'Python 执行失败' },
    ]), () => {}), (error) => {
      assert.ok(error instanceof ExecutionStreamError)
      assert.equal(error.phase, 'analysis')
      return true
    })
  })
  it('rejects a live result masquerading as local execution or missing its sandbox', async () => {
    await assert.rejects(readExecutionStream(stream([{ type: 'result', result: { ...result, mode: 'e2b' } }]), () => {}))
    await assert.rejects(readExecutionStream(stream([{ type: 'result', result: { ...result, cleanup: 'completed' } }]), () => {}))
  })
  it('cancels a failed open stream instead of leaving a reader waiting', async () => {
    let cancelled = false
    const input = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'error', phase: 'analysis', message: '计算失败' }) + '\n')) },
      cancel() { cancelled = true },
    })
    await assert.rejects(readExecutionStream(input, () => {}), /计算失败/)
    assert.equal(cancelled, true)
    assert.equal(input.locked, false)
  })
})
