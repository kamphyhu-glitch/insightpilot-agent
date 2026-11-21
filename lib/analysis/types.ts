import { z } from 'zod'

export type RuntimeMode = 'demo' | 'e2b'
export type CsvDataset = { name: string; csv: string }
export type ColumnProfile = {
  name: string
  kind: 'number' | 'text'
  missing: number
  unique: number
}
export type DatasetProfile = {
  columns: ColumnProfile[]
  rows: string[][]
  rowCount: number
  missingCells: number
  duplicateRows: number
}

export const analysisSpecSchema = z.object({
  title: z.string().min(1).max(100),
  kind: z.enum(['aggregate', 'quality']),
  groupBy: z.string().max(160).nullable(),
  metric: z.string().max(160).nullable(),
  aggregation: z.enum(['sum', 'mean', 'count']),
}).strict()

export type AnalysisSpec = z.infer<typeof analysisSpecSchema>
export const analysisPlanSchema = z.object({
  id: z.string().min(1), question: z.string().min(1), datasetName: z.string().min(1),
  mode: z.enum(['demo', 'e2b']), planner: z.enum(['rules', 'deepseek']),
  spec: analysisSpecSchema, explanation: z.string().min(1), code: z.string().min(1),
  approvalToken: z.string().min(20),
}).strict()
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>

export const computedAnalysisSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  missingCells: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  groups: z.array(z.object({
    label: z.string(),
    value: z.number().finite(),
    count: z.number().int().nonnegative(),
  })),
  total: z.number().finite(),
  validValues: z.number().int().nonnegative(),
}).strict()

export type ComputedAnalysis = z.infer<typeof computedAnalysisSchema>
export type VerificationCheck = { name: string; passed: boolean; detail: string }
export const analysisResultSchema = z.object({
  values: computedAnalysisSchema,
  checks: z.array(z.object({ name: z.string().min(1), passed: z.boolean(), detail: z.string() }).strict()).min(1),
  mode: z.enum(['demo', 'e2b']), durationMs: z.number().finite().nonnegative(),
  sandboxId: z.string().min(1).optional(), cleanup: z.enum(['not_needed', 'completed', 'failed']),
  report: z.string().min(1),
}).strict().superRefine((result, context) => {
  if (result.checks.some((check) => !check.passed) ||
    (result.mode === 'demo' ? result.cleanup !== 'not_needed' || result.sandboxId !== undefined
      : !result.sandboxId || result.cleanup === 'not_needed')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unverified or inconsistent execution result' })
  }
})
export type AnalysisResult = z.infer<typeof analysisResultSchema>
export const executionPhaseSchema = z.enum(['validation', 'sandbox', 'upload', 'analysis', 'cleanup', 'verification', 'report'])
export type ExecutionPhase = z.infer<typeof executionPhaseSchema>
export const progressEventSchema = z.object({
  type: z.literal('progress'), phase: executionPhaseSchema,
  status: z.enum(['running', 'completed', 'warning']), message: z.string().min(1), timestamp: z.string().datetime(),
}).strict()
export type ProgressEvent = z.infer<typeof progressEventSchema>
export const executionEventSchema = z.discriminatedUnion('type', [
  progressEventSchema,
  z.object({ type: z.literal('result'), result: analysisResultSchema }).strict(),
  z.object({ type: z.literal('error'), phase: executionPhaseSchema, message: z.string().min(1) }).strict(),
])
export type ExecutionEvent = z.infer<typeof executionEventSchema>
export const planningFeedbackSchema = z.object({
  code: z.literal('clarification_required'), reason: z.enum(['unsupported', 'ambiguous']),
  error: z.string().min(1), suggestions: z.array(z.string().min(1)).min(1).max(3),
}).strict()
export type PlanningFeedback = z.infer<typeof planningFeedbackSchema>

export const datasetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  csv: z.string().min(1).max(1_048_576),
}).strict()
export const planRequestSchema = z.object({
  dataset: datasetSchema,
  question: z.string().trim().min(2).max(1_000),
  mode: z.enum(['demo', 'e2b']),
}).strict()
export const executeRequestSchema = z.object({
  dataset: datasetSchema,
  approvalToken: z.string().min(20).max(12_000),
}).strict()

export const planEditsSchema = analysisSpecSchema.pick({ groupBy: true, metric: true, aggregation: true })
export type PlanEdits = z.infer<typeof planEditsSchema>
export const reviseRequestSchema = executeRequestSchema.extend({ edits: planEditsSchema })
