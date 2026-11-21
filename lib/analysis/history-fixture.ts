import { buildReport, computeAnalysis, verifyAnalysis } from './compute'
import { parseCsv } from './csv'
import { sampleDataset } from './sample'
import { compilePython } from './python'
import type { AnalysisRunRecord } from './history-types'

/** Synthetic records for offline tests only; never inserted as product history. */
export function historyFixture(id = 'run-1'): AnalysisRunRecord {
  const profile = parseCsv(sampleDataset.csv)
  const spec = { title: 'Revenue', kind: 'aggregate' as const, groupBy: 'channel', metric: 'revenue', aggregation: 'sum' as const }
  const values = computeAnalysis(profile, spec)
  return {
    id, createdAt: '2026-11-19T02:00:00.000Z', updatedAt: '2026-11-19T02:00:01.000Z',
    question: '按 channel 汇总 revenue', mode: 'demo', status: 'completed',
    datasetSummary: { name: sampleDataset.name, rowCount: 24, columnCount: 7, missingCells: 0, duplicateRows: 0 },
    plan: { planner: 'rules', spec, explanation: '按 channel 汇总 revenue', code: compilePython(spec).code },
    phases: { analysis: 'completed', verification: 'completed', report: 'completed' },
    trace: [{ tone: 'success', message: '报告可下载', timestamp: '2026-11-19T02:00:01.000Z' }],
    result: {
      values, checks: verifyAnalysis(values, values), mode: 'demo', durationMs: 10, cleanup: 'not_needed',
      report: buildReport(spec.title, '按 channel 汇总 revenue', sampleDataset.name, spec, values, 'demo'),
    },
  }
}
