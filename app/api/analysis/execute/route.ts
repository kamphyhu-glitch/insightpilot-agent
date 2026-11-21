import { approvalService } from '@/lib/analysis/approval'
import { buildReport, computeAnalysis, verifyAnalysis } from '@/lib/analysis/compute'
import { parseCsv } from '@/lib/analysis/csv'
import { analysisError, readAnalysisRequest, visitorKey } from '@/lib/analysis/http'
import { compilePython } from '@/lib/analysis/python'
import { runInSandbox, SandboxExecutionError } from '@/lib/analysis/sandbox'
import type { ProgressReporter } from '@/lib/analysis/execution-progress'
import { executeRequestSchema, type AnalysisResult, type ExecutionEvent, type ExecutionPhase } from '@/lib/analysis/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { dataset, approvalToken } = await readAnalysisRequest(request, executeRequestSchema)
    const profile = parseCsv(dataset.csv)
    const approved = approvalService.consume(approvalToken, dataset)
    const key = visitorKey(request, 'X-InsightPilot-E2B-Key')
    if (approved.mode === 'e2b' && !key) throw new Error('需要连接你自己的 E2B API Key；请连接后重新生成计划。')
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const started = Date.now()
        const emit = (event: ExecutionEvent) => {
          try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { /* client disconnected */ }
        }
        let phase: ExecutionPhase = 'validation'
        const progress: ProgressReporter = (nextPhase, status, message) => {
          phase = nextPhase
          emit({ type: 'progress', phase, status, message, timestamp: new Date().toISOString() })
        }
        try {
          progress('validation', 'running', '核对已批准的数据版本与分析字段')
          const reference = computeAnalysis(profile, approved.spec)
          progress('validation', 'completed', '审批凭证、数据版本与分析字段校验通过')
          let executed
          if (approved.mode === 'e2b') {
            executed = await runInSandbox(dataset.csv, compilePython(approved.spec).code, key!, progress)
          } else {
            progress('analysis', 'running', '本地演示：执行 TypeScript 聚合计算（未创建沙箱）')
            executed = { values: computeAnalysis(profile, approved.spec), sandboxId: undefined, cleanup: 'not_needed' as const }
            progress('analysis', 'completed', '本地计算完成，等待核验')
          }
          progress('verification', 'running', '核对行数、质量统计、分组结果和汇总值')
          const checks = verifyAnalysis(executed.values, reference)
          if (checks.some((check) => !check.passed)) throw new Error('结果校验未通过，已阻止报告发布。请检查数据与计划后重试。')
          progress('verification', 'completed', '全部结果校验通过')
          progress('report', 'running', '生成可下载的分析报告')
          const result: AnalysisResult = {
            ...executed, checks, mode: approved.mode, durationMs: Date.now() - started,
            report: buildReport(approved.spec.title, approved.question, dataset.name, approved.spec, executed.values, approved.mode),
          }
          progress('report', 'completed', '报告生成完成，正在传输最终结果')
          emit({ type: 'result', result })
        } catch (error) {
          const safe = await analysisError(error).json()
          emit({ type: 'error', phase: error instanceof SandboxExecutionError ? error.phase : phase, message: safe.error })
        } finally {
          try { controller.close() } catch { /* client disconnected */ }
        }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
  } catch (error) { return analysisError(error) }
}
