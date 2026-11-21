import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDemoSpec, createLiveSpec } from './planner'
import { PlanningClarificationError } from './planning-feedback'
import { parseCsv } from './csv'
import { sampleDataset } from './sample'

const profile = parseCsv(sampleDataset.csv)

describe('honest planning feedback', () => {
  it('does not disguise a forecast request as a quality check', () => {
    assert.throws(() => createDemoSpec('预测下个月收入，并检查缺失值', profile), (error) => {
      assert.ok(error instanceof PlanningClarificationError)
      assert.equal(error.reason, 'unsupported')
      assert.ok(error.suggestions.some((question) => question.includes('revenue')))
      return true
    })
  })
  it('asks for a concrete goal instead of guessing a metric', () => {
    assert.throws(() => createDemoSpec('帮我分析一下', profile), (error) => {
      assert.ok(error instanceof PlanningClarificationError)
      assert.equal(error.reason, 'ambiguous')
      return true
    })
  })
  it('does not drop an aggregation when quality and aggregation are requested together', () => {
    assert.throws(() => createDemoSpec('按 channel 汇总 revenue，并检查缺失值', profile), PlanningClarificationError)
  })
  it('does not silently choose one of multiple metrics or an unspecified numeric column', () => {
    for (const question of ['汇总 revenue 和 spend', '帮我求平均值']) {
      assert.throws(() => createDemoSpec(question, profile), PlanningClarificationError)
    }
    assert.equal(createDemoSpec('汇总全部 revenue', profile).groupBy, null)
  })
  it('still accepts an explicit quality check and a supported aggregation', () => {
    assert.equal(createDemoSpec('检查缺失值和重复行', profile).kind, 'quality')
    assert.equal(createDemoSpec('按 channel 汇总 revenue', profile).aggregation, 'sum')
  })
  it('rejects clearly unsupported live goals before charging a model call', async () => {
    let called = false
    const fetcher = (async () => { called = true; throw new Error('must not call') }) as typeof fetch
    await assert.rejects(createLiveSpec('预测下月收入', profile, 'dummy', fetcher), PlanningClarificationError)
    assert.equal(called, false)
  })
  it('honors a model clarification instead of issuing an executable quality plan', async () => {
    const fetcher = (async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.match(body.messages[0].content, /clarification/)
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        kind: 'clarification', reason: 'ambiguous', message: '请明确要比较哪个数值指标。',
      }) } }] })
    }) as typeof fetch
    await assert.rejects(createLiveSpec('比较渠道效果', profile, 'dummy', fetcher), (error) => {
      assert.ok(error instanceof PlanningClarificationError)
      assert.equal(error.reason, 'ambiguous')
      assert.ok(error.suggestions.length > 0)
      return true
    })
  })
  it('rejects a quality response when the user requested another analysis', async () => {
    const fetcher = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({
      title: '需要澄清', kind: 'quality', metric: null, groupBy: null, aggregation: 'count',
    }) } }] })) as typeof fetch
    await assert.rejects(createLiveSpec('Compare revenue by channel', profile, 'dummy', fetcher), PlanningClarificationError)
  })
})
