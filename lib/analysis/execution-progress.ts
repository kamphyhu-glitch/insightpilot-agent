import type { AnalysisSpec, ExecutionPhase, ProgressEvent, RuntimeMode } from './types'

export type PhaseState = 'pending' | 'running' | 'completed' | 'warning' | 'failed'
export type PhaseStates = Partial<Record<ExecutionPhase, PhaseState>>
export type TraceItem = { message: string; timestamp: string; tone: 'info' | 'running' | 'success' | 'warning' | 'error'; phase?: ExecutionPhase }
export type ProgressReporter = (phase: ExecutionPhase, status: ProgressEvent['status'], message: string) => void

export function getExecutionSteps(mode: RuntimeMode, spec: AnalysisSpec, states: PhaseStates) {
  const labels: Record<ExecutionPhase, string> = {
    validation: '校验审批与数据版本', sandbox: '创建隔离 Python 沙箱', upload: '上传已批准的 CSV',
    analysis: spec.kind === 'quality' ? '检查缺失值与重复行' : `按 ${spec.groupBy ?? '全部数据'} ${spec.aggregation === 'mean' ? '求平均' : spec.aggregation === 'count' ? '计数' : '求和'}`,
    cleanup: '释放沙箱资源', verification: '核对计算结果', report: '生成报告',
  }
  const phases: ExecutionPhase[] = mode === 'e2b'
    ? ['validation', 'sandbox', 'upload', 'analysis', 'cleanup', 'verification', 'report']
    : ['validation', 'analysis', 'verification', 'report']
  return phases.map((phase) => ({ phase, label: labels[phase], state: states[phase] ?? 'pending' }))
}
