import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { POST as plan } from '../../app/api/analysis/plan/route'
import { POST as execute } from '../../app/api/analysis/execute/route'
import { POST as revise } from '../../app/api/analysis/revise/route'
import { approvalService } from './approval'
import { sampleDataset } from './sample'
import type { PlanEdits } from './types'

function request(path: string, body: unknown) {
  return new Request(`http://localhost/api/analysis/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function withLiveFlag<T>(value: string | undefined, action: () => Promise<T>): Promise<T> {
  const previous = process.env.INSIGHTPILOT_ENABLE_LIVE
  if (value === undefined) delete process.env.INSIGHTPILOT_ENABLE_LIVE
  else process.env.INSIGHTPILOT_ENABLE_LIVE = value
  try {
    return await action()
  } finally {
    if (previous === undefined) delete process.env.INSIGHTPILOT_ENABLE_LIVE
    else process.env.INSIGHTPILOT_ENABLE_LIVE = previous
  }
}

describe('plan → approval → execution API', () => {
  it('plans without executing, then streams real results after approval and rejects replay', async () => {
    const response = await plan(request('plan', { dataset: sampleDataset, question: '按 channel 汇总 revenue', mode: 'demo' }))
    assert.equal(response.status, 200)
    const proposal = await response.json()
    assert.ok(proposal.approvalToken)
    assert.equal(proposal.values, undefined)
    const execution = await execute(request('execute', { dataset: sampleDataset, approvalToken: proposal.approvalToken }))
    assert.equal(execution.status, 200)
    const events = (await execution.text()).trim().split('\n').map((line) => JSON.parse(line))
    const result = events.find((event) => event.type === 'result')?.result
    assert.equal(result.values.total, 69_900)
    assert.equal(result.cleanup, 'not_needed')
    assert.ok(events.some((event) => event.type === 'progress'))
    const replay = await execute(request('execute', { dataset: sampleDataset, approvalToken: proposal.approvalToken }))
    assert.equal(replay.status, 400)
  })
  it('requires a visitor key when live mode is enabled', () => withLiveFlag('true', async () => {
    const response = await plan(request('plan', { dataset: sampleDataset, question: 'Analyze revenue', mode: 'e2b' }))
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /DeepSeek/)
  }))
  it('blocks live planning by default before contacting the model', (t) => withLiveFlag(undefined, async () => {
    const modelFetch = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('network is disabled in tests')
    })
    const input = request('plan', { dataset: sampleDataset, question: 'Sum revenue by channel', mode: 'e2b' })
    input.headers.set('X-InsightPilot-DeepSeek-Key', 'fixture-visitor-key')
    const response = await plan(input)
    assert.equal(response.status, 403)
    assert.match((await response.json()).error, /公开演示/)
    assert.equal(modelFetch.mock.callCount(), 0)
  }))
  it('blocks a signed live plan from execution and editing without consuming it', async () => {
    const { token } = approvalService.issue({
      mode: 'e2b',
      planner: 'deepseek',
      question: 'Sum revenue by channel',
      spec: { title: 'Revenue', kind: 'aggregate', groupBy: 'channel', metric: 'revenue', aggregation: 'sum' },
    }, sampleDataset)
    const edits = { groupBy: 'channel', metric: 'revenue', aggregation: 'mean' }
    const revision = () => revise(request('revise', { dataset: sampleDataset, approvalToken: token, edits }))
    await withLiveFlag('false', async () => {
      const execution = await execute(request('execute', { dataset: sampleDataset, approvalToken: token }))
      assert.equal(execution.status, 403)
      assert.equal((await revision()).status, 403)
    })
    const restored = await withLiveFlag('true', revision)
    assert.equal(restored.status, 200)
    assert.equal((await restored.json()).mode, 'e2b')
  })
  it('rejects unapproved execution and a different dataset', async () => {
    assert.equal((await execute(request('execute', { dataset: sampleDataset }))).status, 400)
    const proposal = await (await plan(request('plan', { dataset: sampleDataset, question: 'Sum revenue by channel', mode: 'demo' }))).json()
    const changed = { ...sampleDataset, csv: sampleDataset.csv.replace('4200', '9999') }
    assert.equal((await execute(request('execute', { dataset: changed, approvalToken: proposal.approvalToken }))).status, 400)
  })
  it('rejects cross-origin and invalid input before planning', async () => {
    const crossSite = new Request('http://localhost/api/analysis/plan', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' })
    assert.equal((await plan(crossSite)).status, 403)
    assert.equal((await plan(request('plan', { dataset: sampleDataset, question: '', mode: 'demo' }))).status, 400)
  })
  it('accepts the browser Host behind Next.js normalization but rejects mismatched or malformed origins', async () => {
    const body = JSON.stringify({ dataset: sampleDataset, question: '按 channel 汇总 revenue', mode: 'demo' })
    const browserRequest = (origin: string) => new Request('http://localhost:3001/api/analysis/plan', {
      method: 'POST', headers: { Host: '127.0.0.1:3001', Origin: origin, 'Content-Type': 'application/json' }, body,
    })
    assert.equal((await plan(browserRequest('http://127.0.0.1:3001'))).status, 200)
    assert.equal((await plan(browserRequest('http://127.0.0.1:3002'))).status, 403)
    assert.equal((await plan(browserRequest('null'))).status, 403)
    assert.equal((await plan(browserRequest('https://other.example'))).status, 403)
  })
  it('returns actionable clarification without signing an executable plan', async () => {
    const response = await plan(request('plan', { dataset: sampleDataset, question: '预测下个月收入，并检查缺失值', mode: 'demo' }))
    assert.equal(response.status, 422)
    const body = await response.json()
    assert.equal(body.code, 'clarification_required')
    assert.equal(body.reason, 'unsupported')
    assert.ok(body.suggestions.length > 0)
    assert.equal(body.approvalToken, undefined)
  })
  it('streams typed real phases, excluding cloud phases for local calculation', async () => {
    const proposal = await (await plan(request('plan', { dataset: sampleDataset, question: '按 channel 汇总 revenue', mode: 'demo' }))).json()
    const response = await execute(request('execute', { dataset: sampleDataset, approvalToken: proposal.approvalToken }))
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(events.filter((event) => event.type === 'progress').map((event) => [event.phase, event.status]), [
      ['validation', 'running'], ['validation', 'completed'],
      ['analysis', 'running'], ['analysis', 'completed'],
      ['verification', 'running'], ['verification', 'completed'],
      ['report', 'running'], ['report', 'completed'],
    ])
    assert.equal(events.at(-1).type, 'result')
  })
})

describe('edit → fresh approval → execution', () => {
  const makePlan = async (question = '按 channel 汇总 revenue') =>
    (await plan(request('plan', { dataset: sampleDataset, question, mode: 'demo' }))).json()
  const change: PlanEdits = { groupBy: 'channel', metric: 'revenue', aggregation: 'mean' }
  const revision = (approvalToken: string, edits: PlanEdits = change, dataset = sampleDataset) =>
    revise(request('revise', { dataset, approvalToken, edits }))

  it('replaces the original credential and executes only the updated plan after explicit approval', async () => {
    const original = await makePlan()
    const response = await revision(original.approvalToken)
    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.question, original.question)
    assert.equal(updated.mode, original.mode)
    assert.notEqual(updated.id, original.id)
    assert.notEqual(updated.approvalToken, original.approvalToken)
    assert.equal(updated.spec.aggregation, 'mean')
    assert.notEqual(updated.code, original.code)
    assert.equal(updated.values, undefined)
    const stale = await execute(request('execute', { dataset: sampleDataset, approvalToken: original.approvalToken }))
    assert.equal(stale.status, 400)
    assert.match((await stale.json()).error, /被替换/)
    assert.equal((await revision(original.approvalToken)).status, 400)
    const approved = await execute(request('execute', { dataset: sampleDataset, approvalToken: updated.approvalToken }))
    const result = JSON.parse((await approved.text()).trim().split('\n').at(-1)!)
    assert.equal(result.type, 'result')
    assert.equal(result.result.values.total, 2912.5)
    assert.match(result.result.report, /mean\(revenue\) by channel/)
  })

  it('keeps the original credential usable after a rejected edit', async () => {
    const original = await makePlan()
    const rejected: PlanEdits[] = [
      { ...change, metric: 'channel' },
      { ...change, groupBy: 'invented' },
      { ...change, aggregation: 'sum' },
    ]
    for (const edits of rejected) {
      assert.equal((await revision(original.approvalToken, edits)).status, 422)
    }
    assert.equal((await revision(original.approvalToken, change, { ...sampleDataset, name: 'different.csv' })).status, 400)
    assert.equal((await execute(request('execute', { dataset: sampleDataset, approvalToken: original.approvalToken }))).status, 200)
    assert.equal((await revision(original.approvalToken)).status, 400)
  })

  it('rejects cross-origin requests, executable code fields and edits to quality plans', async () => {
    const original = await makePlan('检查缺失值和重复行')
    assert.equal((await revision(original.approvalToken)).status, 422)
    const extra = { ...change, code: 'print(1)' }
    assert.equal((await revision(original.approvalToken, extra)).status, 400)
    const foreign = new Request('http://localhost/api/analysis/revise', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' })
    assert.equal((await revise(foreign)).status, 403)
  })

  it('allows exactly one of two concurrent revisions of the same draft', async () => {
    const original = await makePlan()
    const responses = await Promise.all([revision(original.approvalToken), revision(original.approvalToken)])
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400])
  })

  it('does not allow execution and replacement of the same draft to both succeed', async () => {
    const { approvalToken } = await makePlan()
    const responses = await Promise.all([
      execute(request('execute', { dataset: sampleDataset, approvalToken })),
      revision(approvalToken),
    ])
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400])
    await Promise.all(responses.map((response) => response.text()))
  })

  it('can revise to an ungrouped row count with no metric', async () => {
    const { approvalToken } = await makePlan()
    const response = await revision(approvalToken, { groupBy: null, metric: null, aggregation: 'count' })
    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.spec.metric, null)
    assert.equal(updated.spec.groupBy, null)
    const approval = await execute(request('execute', { dataset: sampleDataset, approvalToken: updated.approvalToken }))
    const result = JSON.parse((await approval.text()).trim().split('\n').at(-1)!)
    assert.equal(result.result.values.total, 24)
    assert.equal(result.result.values.groups.length, 1)
  })
})
