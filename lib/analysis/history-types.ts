import { z } from 'zod'
import { analysisPlanSchema, analysisResultSchema, executionPhaseSchema, planningFeedbackSchema } from './types'

const count = z.number().int().nonnegative()
const summarySchema = z.object({
  name: z.string().min(1).max(160),
  rowCount: count.min(1).max(10_000),
  columnCount: count.min(1).max(40),
  missingCells: count,
  duplicateRows: count,
}).strict().refine((summary) => summary.missingCells <= summary.rowCount * summary.columnCount && summary.duplicateRows < summary.rowCount)

const planSchema = analysisPlanSchema.pick({ planner: true, spec: true, explanation: true, code: true })
const phaseState = z.enum(['pending', 'running', 'completed', 'warning', 'failed'])
const traceSchema = z.object({
  message: z.string(),
  timestamp: z.string().datetime(),
  tone: z.enum(['info', 'running', 'success', 'warning', 'error']),
  phase: executionPhaseSchema.optional(),
}).strict()

export const historyRecordSchema = z.object({
  id: z.string().min(1).max(128),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  question: z.string().min(2).max(1_000),
  mode: z.enum(['demo', 'e2b']),
  status: z.enum(['planning', 'needs_clarification', 'pending', 'running', 'completed', 'declined', 'error']),
  datasetSummary: summarySchema,
  plan: planSchema.optional(),
  phases: z.partialRecord(executionPhaseSchema, phaseState),
  trace: z.array(traceSchema),
  result: analysisResultSchema.optional(),
  error: z.string().optional(),
  feedback: planningFeedbackSchema.optional(),
}).strict().refine((record) => {
  const { status, datasetSummary: summary, result, plan } = record
  if (plan && plan.planner !== (record.mode === 'demo' ? 'rules' : 'deepseek')) return false
  if (['pending', 'running', 'declined', 'completed'].includes(status) && !plan) return false
  if (status !== 'completed') return result === undefined
  return result?.mode === record.mode && result.values.rowCount === summary.rowCount &&
    result.values.missingCells === summary.missingCells && result.values.duplicateRows === summary.duplicateRows
}, 'History status, plan and result must agree')

export type AnalysisRunRecord = z.infer<typeof historyRecordSchema>
export type HistoricalPlan = z.infer<typeof planSchema>

export function projectHistoryRecord(record: AnalysisRunRecord): AnalysisRunRecord {
  const { datasetSummary: summary, plan, result, feedback } = record
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    question: record.question,
    mode: record.mode,
    status: record.status,
    datasetSummary: {
      name: summary.name,
      rowCount: summary.rowCount,
      columnCount: summary.columnCount,
      missingCells: summary.missingCells,
      duplicateRows: summary.duplicateRows,
    },
    plan: plan && {
      planner: plan.planner,
      explanation: plan.explanation,
      code: plan.code,
      spec: {
        title: plan.spec.title,
        kind: plan.spec.kind,
        groupBy: plan.spec.groupBy,
        metric: plan.spec.metric,
        aggregation: plan.spec.aggregation,
      },
    },
    phases: Object.fromEntries(executionPhaseSchema.options.flatMap((phase) => {
      const state = record.phases[phase]
      return state === undefined ? [] : [[phase, state]]
    })),
    trace: record.trace.map(({ message, timestamp, tone, phase }) => ({ message, timestamp, tone, phase })),
    result: result && {
      mode: result.mode,
      durationMs: result.durationMs,
      sandboxId: result.sandboxId,
      cleanup: result.cleanup,
      report: result.report,
      checks: result.checks.map(({ name, passed, detail }) => ({ name, passed, detail })),
      values: {
        rowCount: result.values.rowCount,
        missingCells: result.values.missingCells,
        duplicateRows: result.values.duplicateRows,
        validValues: result.values.validValues,
        total: result.values.total,
        groups: result.values.groups.map(({ label, value, count }) => ({ label, value, count })),
      },
    },
    error: record.error,
    feedback: feedback && {
      code: feedback.code,
      reason: feedback.reason,
      error: feedback.error,
      suggestions: [...feedback.suggestions],
    },
  }
}
