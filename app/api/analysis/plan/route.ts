import { approvalService } from '@/lib/analysis/approval'
import { validateSpec } from '@/lib/analysis/compute'
import { parseCsv } from '@/lib/analysis/csv'
import { analysisError, AnalysisHttpError, readAnalysisRequest, requireAnalysisMode, visitorKey } from '@/lib/analysis/http'
import { createDemoSpec, createLiveSpec, explainSpec } from '@/lib/analysis/planner'
import { compilePython } from '@/lib/analysis/python'
import { planRequestSchema, type AnalysisPlan } from '@/lib/analysis/types'

export const runtime = 'nodejs'
export const maxDuration = 45

export async function POST(request: Request) {
  try {
    const { dataset, question, mode } = await readAnalysisRequest(request, planRequestSchema)
    requireAnalysisMode(mode)
    const profile = parseCsv(dataset.csv)
    const key = visitorKey(request, 'X-InsightPilot-DeepSeek-Key')
    if (mode === 'e2b' && !key) throw new AnalysisHttpError('Live 模式需要连接你自己的 DeepSeek API Key。')
    const spec = mode === 'e2b' ? await createLiveSpec(question, profile, key!) : createDemoSpec(question, profile)
    validateSpec(spec, profile)
    const { payload, token } = approvalService.issue({ question, mode, spec, planner: mode === 'e2b' ? 'deepseek' : 'rules' }, dataset)
    const result: AnalysisPlan = {
      id: payload.id, question, datasetName: dataset.name, mode,
      planner: payload.planner, spec, explanation: explainSpec(spec, profile),
      code: compilePython(spec).code, approvalToken: token,
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return analysisError(error) }
}
