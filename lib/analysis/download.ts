import { csvCell } from './csv'
import type { AnalysisSpec, ComputedAnalysis } from './types'

export function createResultCsv(kind: AnalysisSpec['kind'], values: ComputedAnalysis) {
  const rows: (string | number)[][] = kind === 'quality'
    ? [['check', 'count'], ['row_count', values.rowCount], ['missing_cells', values.missingCells], ['duplicate_rows', values.duplicateRows]]
    : [['group', 'value', 'valid_rows'], ...values.groups.map((group) => [group.label, group.value, group.count])]
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function downloadText(name: string, content: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  try {
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // The browser must have time to start reading the blob, including slower mobile clients.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
