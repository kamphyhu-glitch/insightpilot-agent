import { approvalService } from '@/lib/analysis/approval'
import { validateSpec } from '@/lib/analysis/compute'
import { parseCsv } from '@/lib/analysis/csv'
import { analysisError, AnalysisHttpError, readAnalysisRequest } from '@/lib/analysis/http'
import { explainSpec } from '@/lib/analysis/planner'
import { compilePython } from '@/lib/analysis/python'
import { reviseRequestSchema, type AnalysisPlan } from '@/lib/analysis/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { dataset, approvalToken, edits } = await readAnalysisRequest(request, reviseRequestSchema)
    const profile = parseCsv(dataset.csv)
    const { payload, token } = approvalService.revise(approvalToken, dataset, (original) => {
      if (original.kind !== 'aggregate') throw new AnalysisHttpError('质量检查没有可编辑的聚合字段。', 422)
      if (edits.aggregation === 'count' && edits.metric !== null) {
        throw new AnalysisHttpError('记录计数不需要数值列。', 422)
      }
      if (original.groupBy === edits.groupBy && original.metric === edits.metric && original.aggregation === edits.aggregation) {
        throw new AnalysisHttpError('请至少修改一个字段。', 422)
      }
      const title = { sum: '指标求和', mean: '平均值分析', count: '记录数分析' }[edits.aggregation]
      const spec = { ...original, ...edits, title }
      try { validateSpec(spec, profile) }
      catch (error) {
        throw new AnalysisHttpError(error instanceof Error ? error.message : '分析字段无效。', 422)
      }
      return spec
    })
    const result: AnalysisPlan = {
      id: payload.id,
      question: payload.question,
      datasetName: payload.datasetName,
      mode: payload.mode,
      planner: payload.planner,
      spec: payload.spec,
      explanation: explainSpec(payload.spec, profile),
      code: compilePython(payload.spec).code,
      approvalToken: token,
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return analysisError(error) }
}
