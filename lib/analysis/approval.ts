import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { requireAnalysisMode } from './http'
import { analysisSpecSchema, type AnalysisSpec, type CsvDataset } from './types'

const payloadSchema = z.object({
  id: z.string().uuid(),
  question: z.string().max(1_000),
  datasetName: z.string().max(160),
  datasetHash: z.string().length(64),
  mode: z.enum(['demo', 'e2b']),
  planner: z.enum(['rules', 'deepseek']),
  spec: analysisSpecSchema,
  expiresAt: z.number().int(),
}).strict()
export type ApprovedPayload = z.infer<typeof payloadSchema>

function datasetHash(dataset: CsvDataset) {
  return createHash('sha256').update(JSON.stringify(dataset)).digest('hex')
}

export function createApprovalService(secret: string, now = () => Date.now()) {
  const closed = new Map<string, { expiresAt: number; reason: 'executed' | 'superseded' }>()
  const signature = (encoded: string) => createHmac('sha256', secret).update(encoded).digest()
  function issue(input: Pick<ApprovedPayload, 'question' | 'mode' | 'planner' | 'spec'>, dataset: CsvDataset) {
    const payload: ApprovedPayload = {
      ...input, id: randomUUID(), datasetName: dataset.name,
      datasetHash: datasetHash(dataset), expiresAt: now() + 15 * 60_000,
    }
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return { payload, token: `${encoded}.${signature(encoded).toString('base64url')}` }
  }

  function readOpen(token: string, dataset: CsvDataset): ApprovedPayload {
    const parts = token.split('.')
    if (parts.length !== 2) throw new Error('审批凭证无效，请重新生成计划。')
    const actual = Buffer.from(parts[1], 'base64url')
    const expected = signature(parts[0])
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('审批内容已改变，请重新生成计划。')
    }
    let payload: ApprovedPayload
    try { payload = payloadSchema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString())) }
    catch { throw new Error('审批凭证无效，请重新生成计划。') }
    if (payload.expiresAt <= now()) throw new Error('计划已过期，请重新生成。')
    if (payload.datasetHash !== datasetHash(dataset)) throw new Error('数据已改变，需要重新规划并审批。')
    requireAnalysisMode(payload.mode)
    for (const [id, entry] of closed) if (entry.expiresAt <= now()) closed.delete(id)
    const previous = closed.get(payload.id)
    if (previous?.reason === 'superseded') throw new Error('该计划已被替换，请使用最新版本。')
    if (previous) throw new Error('该计划已经执行过，请生成新的计划。')
    if (closed.size >= 1_000) throw new Error('当前审批请求过多，请稍后重试。')
    return payload
  }

  return {
    issue,
    consume(token: string, dataset: CsvDataset) {
      const payload = readOpen(token, dataset)
      closed.set(payload.id, { expiresAt: payload.expiresAt, reason: 'executed' })
      return payload
    },
    revise(token: string, dataset: CsvDataset, edit: (original: AnalysisSpec) => AnalysisSpec) {
      const original = readOpen(token, dataset)
      const spec = analysisSpecSchema.parse(edit(original.spec))
      const { question, mode, planner } = original
      const updated = issue({ question, mode, planner, spec }, dataset)
      closed.set(original.id, { expiresAt: original.expiresAt, reason: 'superseded' })
      return updated
    },
  }
}

const runtimeState = globalThis as typeof globalThis & { insightPilotApproval?: ReturnType<typeof createApprovalService> }
export const approvalService = runtimeState.insightPilotApproval ??= createApprovalService(
  process.env.INSIGHTPILOT_APPROVAL_SECRET || randomBytes(32).toString('hex'),
)
