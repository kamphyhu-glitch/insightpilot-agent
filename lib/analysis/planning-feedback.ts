import type { DatasetProfile, PlanningFeedback } from './types'

export class PlanningClarificationError extends Error {
  readonly suggestions: string[]
  constructor(public reason: PlanningFeedback['reason'], message: string, profile: DatasetProfile) {
    super(message)
    this.name = 'PlanningClarificationError'
    const metric = profile.columns.find((column) => column.kind === 'number')
    const group = profile.columns.find((column) => column.kind === 'text')
    // Suggestions use actual column names and only the supported operations.
    const preferredMetric = profile.columns.find((column) => column.kind === 'number' && /revenue|收入|销售额/i.test(column.name)) ?? metric
    this.suggestions = [
      preferredMetric ? `按 ${group?.name ?? '全部数据'} 汇总 ${preferredMetric.name}` : '统计全部记录数',
      group ? `按 ${group.name} 统计记录数` : '检查缺失值和重复行',
      '检查缺失值和重复行',
    ].filter((value, index, values) => values.indexOf(value) === index)
  }
}

export function checkUnsupportedGoal(question: string, profile: DatasetProfile) {
  if (/转化率|利润率|回归|预测|显著|同比|环比|增长率|相关性|筛选|过滤|ROI|conversion|forecast|predict|regression|correlation|significance|filter/i.test(question)) {
    throw new PlanningClarificationError('unsupported', '这个目标超出首版范围。当前支持分组求和、平均、计数和数据质量检查，暂不支持预测、比率、筛选或统计推断。请调整目标后再生成计划；本次未执行分析。', profile)
  }
}
