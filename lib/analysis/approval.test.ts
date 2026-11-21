import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createApprovalService } from './approval'
import type { AnalysisSpec } from './types'

const dataset = { name: 'test.csv', csv: 'channel,revenue\nA,2' }
const spec: AnalysisSpec = { title: 'Revenue', kind: 'aggregate', groupBy: 'channel', metric: 'revenue', aggregation: 'sum' }
const input = { question: 'Compare revenue', mode: 'demo' as const, planner: 'rules' as const, spec }

describe('server approval boundary', () => {
  it('accepts the approved payload exactly once', () => {
    const approvals = createApprovalService('test-only-signing-secret')
    const { token } = approvals.issue(input, dataset)
    assert.deepEqual(approvals.consume(token, dataset).spec, spec)
    assert.throws(() => approvals.consume(token, dataset), /已经执行/)
  })
  it('rejects changed CSV, dataset name and plan payload', () => {
    const approvals = createApprovalService('test-only-signing-secret')
    const { token } = approvals.issue(input, dataset)
    assert.throws(() => approvals.consume(token, { ...dataset, csv: dataset.csv.replace('2', '9') }), /数据已改变/)
    assert.throws(() => approvals.consume(token, { ...dataset, name: 'other.csv' }), /数据已改变/)
    const [encoded, signature] = token.split('.')
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString())
    payload.mode = 'e2b'
    const modified = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`
    assert.throws(() => approvals.consume(modified, dataset), /审批内容已改变/)
  })
  it('rejects expired and unsigned tokens', () => {
    let now = 1000
    const approvals = createApprovalService('test-only-signing-secret', () => now)
    const { token } = approvals.issue(input, dataset)
    now += 16 * 60_000
    assert.throws(() => approvals.consume(token, dataset), /过期/)
    assert.throws(() => approvals.consume('just-a-plan', dataset), /无效/)
  })
})
