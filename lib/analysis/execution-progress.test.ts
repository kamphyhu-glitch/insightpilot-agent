import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getExecutionSteps } from './execution-progress'
import type { AnalysisSpec } from './types'

const spec: AnalysisSpec = { title: 'Revenue', kind: 'aggregate', groupBy: 'channel', metric: 'revenue', aggregation: 'sum' }

describe('real phase presentation', () => {
  it('does not claim sandbox work in demo mode', () => {
    assert.deepEqual(getExecutionSteps('demo', spec, {}).map((step) => step.phase), ['validation', 'analysis', 'verification', 'report'])
  })
  it('shows cloud phases in their actual cleanup-before-verification order', () => {
    const steps = getExecutionSteps('e2b', spec, { analysis: 'failed', cleanup: 'completed' })
    assert.deepEqual(steps.map((step) => step.phase), ['validation', 'sandbox', 'upload', 'analysis', 'cleanup', 'verification', 'report'])
    assert.equal(steps.find((step) => step.phase === 'analysis')?.state, 'failed')
    assert.equal(steps.find((step) => step.phase === 'cleanup')?.state, 'completed')
    assert.equal(steps.find((step) => step.phase === 'verification')?.state, 'pending')
  })
  it('preserves release warnings instead of turning every step green', () => {
    assert.equal(getExecutionSteps('e2b', spec, { cleanup: 'warning' }).find((step) => step.phase === 'cleanup')?.state, 'warning')
  })
})
