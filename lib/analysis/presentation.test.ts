import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultsPanel } from '../../components/analysis/results-panel'
import { TraceList } from '../../components/analysis/trace-view'
import { HistoryRecordView } from '../../components/analysis/history-panel'
import { buildReport, computeAnalysis, verifyAnalysis } from './compute'
import { parseCsv } from './csv'
import { sampleDataset } from './sample'
import { historyFixture } from './history-fixture'
import type { AnalysisResult, AnalysisSpec } from './types'

const profile = parseCsv(sampleDataset.csv)
const quality: AnalysisSpec = { title: '质量检查', kind: 'quality', metric: null, groupBy: null, aggregation: 'count' }
const values = computeAnalysis(profile, quality)
const result: AnalysisResult = { values, checks: verifyAnalysis(values, values), mode: 'demo', durationMs: 1, cleanup: 'not_needed', report: '# Quality report' }

describe('honest result presentation', () => {
  it('does not present an old verified result or export action after failure', () => {
    const html = renderToStaticMarkup(React.createElement(ResultsPanel, {
      dataset: sampleDataset, profile, plan: null, result, status: 'error', trace: [], tab: 'report', onTab() {},
    }))
    assert.ok(!html.includes('VERIFIED ANALYSIS'))
    assert.ok(!html.includes('导出报告'))
    assert.ok(html.includes('本次分析未完成'))
  })
  it('distinguishes errors and warnings from successes in trace text and classes', () => {
    const html = renderToStaticMarkup(React.createElement(TraceList, {
      busy: false, trace: [
        { tone: 'error', message: '计算失败', timestamp: '2026-11-18T08:00:00Z' },
        { tone: 'warning', message: '清理未确认', timestamp: '2026-11-18T08:00:01Z' },
      ],
    }))
    assert.ok(html.includes('is-error') && html.includes('失败'))
    assert.ok(html.includes('is-warning') && html.includes('警告'))
    assert.ok(!html.includes('成功'))
  })
  it('writes a quality report without describing a fake count aggregation', () => {
    const report = buildReport('Quality', 'Check quality', 'source.csv', quality, values, 'demo')
    assert.ok(report.includes('Missing cells: 0'))
    assert.ok(report.includes('Duplicate rows: 0'))
    assert.ok(!report.includes('count(*)'))
    assert.ok(!report.includes('Overall aggregate'))
    assert.ok(report.includes('internal consistency'))
  })
})

describe('read-only history presentation', () => {
  for (const [status, expected] of [
    ['pending', '历史计划未恢复审批权限'],
    ['running', '连接已中断，后台结果未知'],
    ['planning', '本地未保存最终计划'],
  ] as const) {
    it(`shows ${status} history without approval, raw rows or a success report`, () => {
      const record = { ...historyFixture(), status, result: undefined, phases: {} }
      const html = renderToStaticMarkup(React.createElement(HistoryRecordView, { record }))
      assert.ok(html.includes(expected))
      assert.ok(!html.includes('批准并执行'))
      assert.ok(!html.includes('数据预览'))
      assert.ok(!html.includes('导出报告'))
      assert.ok(!html.includes('VERIFIED ANALYSIS'))
    })
  }

  it('uses the historical data summary and allows export of a completed snapshot', () => {
    const record = historyFixture()
    record.datasetSummary = { name: 'historic-only.csv', rowCount: 4, columnCount: 2, missingCells: 2, duplicateRows: 0 }
    record.result!.values = { ...record.result!.values, rowCount: 4, missingCells: 2 }
    const html = renderToStaticMarkup(React.createElement(HistoryRecordView, { record }))
    assert.ok(html.includes('historic-only.csv'))
    assert.ok(html.includes('历史结果，未重新运行'))
    assert.ok(html.includes('69,900'))
    assert.ok(html.includes('75<small>%</small>'))
    assert.ok(html.includes('导出报告'))
    assert.ok(!html.includes('数据预览'))
  })
})
