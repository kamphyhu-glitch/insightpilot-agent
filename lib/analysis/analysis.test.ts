import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCsv, numericValue, csvCell } from './csv'
import { computeAnalysis, validateSpec, verifyAnalysis } from './compute'
import { createDemoSpec, createLiveSpec } from './planner'
import { sampleDataset } from './sample'
import type { AnalysisSpec } from './types'

const spec: AnalysisSpec = { title: 'Revenue', kind: 'aggregate', groupBy: 'channel', metric: 'revenue', aggregation: 'sum' }

describe('CSV parsing and profiling', () => {
  it('handles BOM, CRLF, quoted commas, escaped quotes and embedded newlines', () => {
    const profile = parseCsv('\uFEFFname,amount\r\n"A, B",2\r\n"C""D",3\r\n"E\nF",4\r\n')
    assert.equal(profile.rowCount, 3)
    assert.deepEqual(profile.rows.map((row) => row[0]), ['A, B', 'C"D', 'E\nF'])
    assert.equal(profile.columns[1].kind, 'number')
  })
  it('profiles missing values and exact duplicate records', () => {
    const profile = parseCsv('name,amount\nA,2\nB,\nA,2\n')
    assert.equal(profile.missingCells, 1)
    assert.equal(profile.duplicateRows, 1)
    assert.equal(profile.columns[1].kind, 'number')
  })
  it('rejects malformed, ragged, empty-header and duplicate-header data', () => {
    for (const csv of ['name,value\n"oops,3', 'name,value\nA,2,3', ',amount\nA,2', 'x,x\n1,2', 'name,amount']) {
      assert.throws(() => parseCsv(csv))
    }
  })
  it('enforces byte and row limits', () => {
    assert.throws(() => parseCsv(`name\n${'中'.repeat(400_000)}`), /1 MiB/)
    assert.throws(() => parseCsv(`name\n${'A\n'.repeat(10_001)}`), /10,000/)
  })
  it('does not coerce blanks, invalid numbers or infinity into valid metrics', () => {
    for (const value of ['', ' ', 'NaN', 'Infinity', '1,000', '1e9999']) assert.equal(numericValue(value), null)
    assert.equal(numericValue(' 1.25e2 '), 125)
  })
  it('escapes spreadsheet formula labels while preserving numeric negatives', () => {
    assert.equal(csvCell('=SUM(A1:A3)'), '"\'=SUM(A1:A3)"')
    assert.equal(csvCell(-25), '"-25"')
  })
})

describe('actual analysis and result verification', () => {
  it('computes the sample total and all groups from source rows', () => {
    const values = computeAnalysis(parseCsv(sampleDataset.csv), spec)
    assert.equal(values.rowCount, 24)
    assert.equal(values.total, 69_900)
    assert.deepEqual(values.groups.map((group) => [group.label, group.value]), [
      ['Search', 29_400], ['Social', 16_100], ['Email', 14_200], ['Referral', 10_200],
    ])
  })
  it('recomputes changed data rather than serving fixture results', () => {
    const values = computeAnalysis(parseCsv('channel,revenue\nSearch,10\nEmail,4'), spec)
    assert.equal(values.total, 14)
    assert.equal(values.groups.length, 2)
  })
  it('ignores missing metric values and computes a weighted overall mean', () => {
    const values = computeAnalysis(parseCsv('channel,revenue\nA,2\nA,4\nB,12\nB,\n,6'), { ...spec, aggregation: 'mean' })
    assert.equal(values.total, 6)
    assert.equal(values.validValues, 4)
    assert.equal(values.groups.find((group) => group.label === '(missing)')?.value, 6)
    assert.equal(values.groups.find((group) => group.label === 'A')?.value, 3)
  })
  it('counts all rows when count is selected', () => {
    const values = computeAnalysis(parseCsv('channel,revenue\nA,2\nA,\nB,12'), { ...spec, aggregation: 'count', metric: null })
    assert.equal(values.total, 3)
    assert.equal(values.groups[0].count, 2)
  })
  it('rejects nonexistent or nonnumeric metric columns', () => {
    const profile = parseCsv(sampleDataset.csv)
    assert.throws(() => validateSpec({ ...spec, metric: 'made_up' }, profile))
    assert.throws(() => validateSpec({ ...spec, metric: 'channel' }, profile))
    assert.throws(() => validateSpec({ ...spec, groupBy: 'made_up' }, profile))
  })
  it('catches incorrect totals, per-group values and duplicate output groups', () => {
    const expected = computeAnalysis(parseCsv(sampleDataset.csv), spec)
    assert.ok(verifyAnalysis(expected, expected).every((check) => check.passed))
    assert.ok(verifyAnalysis({ ...expected, total: 1 }, expected).some((check) => !check.passed))
    assert.ok(verifyAnalysis({ ...expected, groups: expected.groups.map((group) => ({ ...group, value: 0 })) }, expected).some((check) => !check.passed))
    assert.ok(verifyAnalysis({ ...expected, groups: expected.groups.map(() => expected.groups[0]) }, expected).some((check) => !check.passed))
  })
})

describe('schema constrained planning', () => {
  it('selects date/signups and data quality without fixed output values', () => {
    const profile = parseCsv(sampleDataset.csv)
    assert.equal(createDemoSpec('按 date 汇总 signups', profile).groupBy, 'date')
    assert.equal(createDemoSpec('按 date 汇总 signups', profile).metric, 'signups')
    assert.equal(createDemoSpec('检查缺失值和重复行', profile).kind, 'quality')
  })
  it('asks for a supported analysis rather than pretending to forecast', () => {
    assert.throws(() => createDemoSpec('预测下个月收入', parseCsv(sampleDataset.csv)), /超出首版范围/)
  })
  it('only sends profiles and five rows to the fixed DeepSeek endpoint', async () => {
    const fakeFetch = (async (url, init) => {
      assert.equal(url, 'https://api.deepseek.com/chat/completions')
      const body = JSON.parse(String(init?.body))
      const context = JSON.parse(body.messages[1].content)
      assert.equal(context.sample.length, 5)
      assert.equal(context.csv, undefined)
      assert.ok(!String(init?.body).includes('test-secret'))
      return Response.json({ choices: [{ message: { content: JSON.stringify(spec) } }] })
    }) as typeof fetch
    assert.deepEqual(await createLiveSpec('Compare revenue', parseCsv(sampleDataset.csv), 'test-secret', fakeFetch), spec)
  })
  it('rejects a model plan using an invented column', async () => {
    const fakeFetch = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...spec, metric: 'profit' }) } }] })) as typeof fetch
    await assert.rejects(createLiveSpec('Compare profit', parseCsv(sampleDataset.csv), 'test-secret', fakeFetch))
  })
})
