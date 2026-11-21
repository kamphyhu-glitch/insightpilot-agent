'use client'

import React, { useState } from 'react'
import type { AnalysisSpec, ColumnProfile, PlanEdits } from '@/lib/analysis/types'

export function PlanEditor({ spec, columns, saving, onSave, onCancel }: {
  spec: AnalysisSpec
  columns: ColumnProfile[]
  saving: boolean
  onSave: (edits: PlanEdits) => Promise<string | null>
  onCancel: () => void
}) {
  const [groupBy, setGroupBy] = useState(spec.groupBy ?? '')
  const [metric, setMetric] = useState(spec.metric ?? '')
  const [aggregation, setAggregation] = useState(spec.aggregation)
  const [error, setError] = useState('')
  const numeric = columns.filter((column) => column.kind === 'number')
  const edits: PlanEdits = {
    groupBy: groupBy || null,
    metric: aggregation === 'count' ? null : metric || null,
    aggregation,
  }
  const changed = edits.groupBy !== spec.groupBy || edits.metric !== spec.metric || edits.aggregation !== spec.aggregation
  const valid = aggregation === 'count' || numeric.some((column) => column.name === edits.metric)

  return <form className="ip-plan-editor" onSubmit={async (event) => {
    event.preventDefault()
    if (saving || !changed || !valid) return
    setError('')
    const failure = await onSave(edits)
    if (failure) setError(failure)
  }}>
    <fieldset disabled={saving}>
      <legend>编辑聚合计划</legend>
      <label htmlFor="ip-edit-group">分组列</label>
      <select id="ip-edit-group" value={groupBy} onChange={(event) => { setGroupBy(event.target.value); setError('') }}>
        <option value="">全部数据</option>
        {columns.map(({ name }) => <option key={name} value={name}>{name}</option>)}
      </select>
      <label htmlFor="ip-edit-operation">聚合方式</label>
      <select id="ip-edit-operation" value={aggregation} onChange={(event) => {
        const value = event.target.value
        if (value === 'sum' || value === 'mean' || value === 'count') setAggregation(value)
        setError('')
      }}>
        <option value="sum" disabled={!numeric.length}>求和</option>
        <option value="mean" disabled={!numeric.length}>平均值</option>
        <option value="count">记录计数</option>
      </select>
      {aggregation !== 'count' && <>
        <label htmlFor="ip-edit-metric">数值列</label>
        <select id="ip-edit-metric" value={metric} onChange={(event) => { setMetric(event.target.value); setError('') }}>
          <option value="" disabled>选择数值列</option>
          {numeric.map(({ name }) => <option key={name} value={name}>{name}</option>)}
        </select>
      </>}
      <p>保存后会生成新版 Python，等待你批准。</p>
      {error && <p className="ip-error-box" role="alert">{error}</p>}
      <div className="ip-approval-actions">
        <button type="button" className="ip-decline" onClick={onCancel}>取消修改</button>
        <button type="submit" className="ip-primary-button" disabled={!changed || !valid}>{saving ? '正在保存…' : '保存修改'}</button>
      </div>
    </fieldset>
  </form>
}
