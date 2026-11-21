import { nanoid } from 'nanoid'
import { projectHistoryRecord, type AnalysisRunRecord } from './history-types'
import type { createHistoryRepository } from './history-repository'

type Start = Pick<AnalysisRunRecord, 'question' | 'mode' | 'datasetSummary'>
type Update = Partial<Pick<AnalysisRunRecord, 'status' | 'plan' | 'phases' | 'result' | 'error' | 'feedback'>>

/** Keeps the current run's writable snapshot separate from restored history. */
export function createHistorySession(repository: Pick<ReturnType<typeof createHistoryRepository>, 'insert' | 'update'>) {
  let current: AnalysisRunRecord | null = null
  let inserted = false
  let warning = ''

  function persist() {
    if (!current) return
    const saved = inserted ? repository.update(current) : repository.insert(current)
    if (saved) inserted = true
    warning = saved ? '' : '本次最新状态未保存。刷新后可能只看到上次保存的阶段。'
  }

  return {
    getWarning: () => warning,
    reset() { current = null; inserted = false; warning = '' },
    start(fields: Start) {
      const now = new Date().toISOString()
      current = projectHistoryRecord({
        ...fields, id: nanoid(), createdAt: now, updatedAt: now, status: 'planning', phases: {}, trace: [],
      })
      inserted = false
      persist()
    },
    update(fields: Update) {
      if (!current) return
      current = projectHistoryRecord({ ...current, ...fields, updatedAt: new Date().toISOString() })
      persist()
    },
    append(item: AnalysisRunRecord['trace'][number], fields: Update = {}) {
      if (!current) return
      current = projectHistoryRecord({ ...current, ...fields, trace: [...current.trace, item], updatedAt: new Date().toISOString() })
      persist()
    },
  }
}
