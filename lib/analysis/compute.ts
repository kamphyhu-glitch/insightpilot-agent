import { numericValue } from './csv'
import type { AnalysisSpec, ComputedAnalysis, DatasetProfile, VerificationCheck } from './types'

export function validateSpec(spec: AnalysisSpec, profile: DatasetProfile) {
  if (spec.groupBy !== null && !profile.columns.some((column) => column.name === spec.groupBy)) {
    throw new Error('计划引用了不存在的分组列，请重新生成计划。')
  }
  if (spec.kind === 'aggregate' && spec.aggregation !== 'count' &&
    !profile.columns.some((column) => column.name === spec.metric && column.kind === 'number')) {
    throw new Error('求和与平均值需要一个有效的数值列。')
  }
}

export function computeAnalysis(profile: DatasetProfile, spec: AnalysisSpec): ComputedAnalysis {
  validateSpec(spec, profile)
  const metricIndex = profile.columns.findIndex((column) => column.name === spec.metric)
  const groupIndex = profile.columns.findIndex((column) => column.name === spec.groupBy)
  const groups = new Map<string, { sum: number; count: number }>()
  let total = 0
  let validValues = 0
  if (spec.kind === 'aggregate') for (const row of profile.rows) {
    const numeric = spec.aggregation === 'count' ? 1 : numericValue(row[metricIndex])
    if (numeric === null) continue
    const label = groupIndex >= 0 ? row[groupIndex].trim() || '(missing)' : 'All rows'
    const group = groups.get(label) ?? { sum: 0, count: 0 }
    group.sum += numeric
    group.count++
    groups.set(label, group)
    total += numeric
    validValues++
  }
  const values = Array.from(groups).map(([label, value]) => ({
    label,
    value: spec.aggregation === 'mean' ? value.sum / value.count : value.sum,
    count: value.count,
  })).sort((left, right) => right.value - left.value || (left.label < right.label ? -1 : 1))
  return {
    rowCount: profile.rowCount,
    missingCells: profile.missingCells,
    duplicateRows: profile.duplicateRows,
    groups: values,
    total: spec.aggregation === 'mean' && validValues > 0 ? total / validValues : total,
    validValues,
  }
}

export function verifyAnalysis(actual: ComputedAnalysis, expected: ComputedAnalysis): VerificationCheck[] {
  const close = (left: number, right: number) => Math.abs(left - right) <= Math.max(1e-7, Math.abs(right) * 1e-9)
  const expectedGroups = new Map(expected.groups.map((group) => [group.label, group]))
  const groupsMatch = actual.groups.length === expected.groups.length &&
    new Set(actual.groups.map((group) => group.label)).size === actual.groups.length &&
    actual.groups.every((group) => {
      const reference = expectedGroups.get(group.label)
      return reference && reference.count === group.count && close(group.value, reference.value)
    })
  return [
    { name: '行数一致', passed: actual.rowCount === expected.rowCount, detail: `${actual.rowCount} / ${expected.rowCount} rows` },
    { name: '质量统计一致', passed: actual.missingCells === expected.missingCells && actual.duplicateRows === expected.duplicateRows, detail: 'Missing cells & duplicate rows' },
    { name: '分组数值一致', passed: Boolean(groupsMatch), detail: `${actual.groups.length} groups · independent reference` },
    { name: '汇总值一致', passed: close(actual.total, expected.total) && actual.validValues === expected.validValues, detail: 'Aggregate value & valid observations' },
  ]
}

export function buildReport(title: string, question: string, datasetName: string, spec: AnalysisSpec, values: ComputedAnalysis, mode: string) {
  return [
    `# ${title}`, '', `Question: ${question}`, '', `Dataset: ${datasetName}`, `Execution: ${mode === 'e2b' ? 'E2B Python sandbox' : 'Local TypeScript calculation (demo)'}`,
    '', `Rows: ${values.rowCount}`, `Missing cells: ${values.missingCells}`, `Duplicate rows: ${values.duplicateRows}`,
    ...(spec.kind === 'quality' ? [
      '', 'Analysis: missing cells and exact duplicate rows; source data is unchanged.',
      '', '| Check | Count |', '| --- | ---: |',
      `| Rows | ${values.rowCount} |`, `| Missing cells | ${values.missingCells} |`, `| Duplicate rows | ${values.duplicateRows} |`,
    ] : [
      '', `Analysis: ${spec.aggregation}(${spec.metric ?? '*'}) by ${spec.groupBy ?? 'all rows'}`,
      '', '| Group | Value | Valid rows |', '| --- | ---: | ---: |',
      ...values.groups.map((group) => `| ${group.label.replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ')} | ${group.value.toFixed(2)} | ${group.count} |`),
      '', `Overall aggregate: ${values.total.toFixed(2)}`,
    ]),
    '', mode === 'e2b' ? 'Verification: Python output independently compared against a TypeScript reference.'
      : 'Verification: local internal consistency checks using TypeScript; not independent cross-language verification.',
    '', 'Scope: descriptive analysis only; no causal conclusions or statistical significance are inferred.',
  ].join('\n')
}
