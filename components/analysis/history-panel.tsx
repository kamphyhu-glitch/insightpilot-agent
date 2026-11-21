'use client'

import React, { useState } from 'react'
import { History, LockKeyhole, Trash2 } from 'lucide-react'
import { HISTORY_LIMIT } from '@/lib/analysis/history-repository'
import { getExecutionSteps } from '@/lib/analysis/execution-progress'
import type { AnalysisRunRecord } from '@/lib/analysis/history-types'
import { ResultsPanel } from './results-panel'

type Status = AnalysisRunRecord['status']
const statuses: Record<Status, string> = {
  planning: '规划未连接',
  pending: '待批准快照',
  running: '后台结果未知',
  completed: '已完成',
  declined: '已拒绝',
  error: '失败',
  needs_clarification: '待澄清',
}
const hints: Record<Status, string> = {
  planning: '当前页面未连接该规划，本地未保存最终计划。',
  pending: '历史计划未恢复审批权限。请在工作台准备数据并生成新计划。',
  running: '连接已中断，后台结果未知。下方仅显示已保存的事件。',
  completed: '已保存的报告、代码和执行记录可以查看或导出。',
  declined: '当时已拒绝本次计划，未从工作台发起执行。',
  error: '该次运行未发布已核验的报告。',
  needs_clarification: '该问题需要进一步澄清，未生成可执行计划。',
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const displayMode = (mode: AnalysisRunRecord['mode']) => mode === 'e2b' ? 'Live · E2B' : '本地演示'

type HistoryPanelProps = {
  records: AnalysisRunRecord[]
  record: AnalysisRunRecord | null
  canClear: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onNew: () => void
}

export function HistoryPanel({ records, record, canClear, onSelect, onRemove, onClear, onNew }: HistoryPanelProps) {
  const [confirm, setConfirm] = useState<{ type: 'clear' } | { type: 'remove'; id: string } | null>(null)
  const confirmedRecord = confirm?.type === 'remove' ? records.find(({ id }) => id === confirm.id) : null
  const showConfirmation = confirm?.type === 'clear' ? canClear : Boolean(confirmedRecord)

  return <section className="ip-history">
    <div className="ip-history-heading">
      <h1><History size={24} aria-hidden="true" />运行历史</h1>
      <button type="button" className="ip-primary-button" onClick={onNew}>新建分析</button>
    </div>
    <p className="ip-history-privacy">
      <LockKeyhole size={16} aria-hidden="true" />
      <span>历史存在当前浏览器。问题、文件名和报告可能包含业务信息。本地记录未加密，原始 CSV、API Key 和审批凭证不会写入历史。</span>
    </p>
    <div className="ip-history-grid">
      <div className="ip-history-sidebar">
        <div className="ip-history-list-header">
          <h2>已保存 <span>{records.length}/{HISTORY_LIMIT}</span></h2>
          {canClear && <button type="button" className="ip-history-delete" onClick={() => setConfirm({ type: 'clear' })}>清空历史</button>}
        </div>
        {records.length > 0 ? <ul className="ip-history-list">
          {records.map((item) => <li key={item.id}>
            <button type="button" className="ip-history-list-item" aria-current={item.id === record?.id ? 'true' : undefined} onClick={() => { onSelect(item.id); setConfirm(null) }}>
              <strong>{item.plan?.spec.title ?? item.question}</strong>
              <span className="ip-history-filename">{item.datasetSummary.name}</span>
              <span className="ip-history-meta">
                <span className={`ip-history-status is-${item.status}`}>{statuses[item.status]}</span>
                <span>{displayMode(item.mode)}</span>
                <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>
              </span>
            </button>
          </li>)}
        </ul> : <p className="ip-history-no-records">暂无可查看的运行。生成分析计划后，历史会出现在这里。</p>}
      </div>
      <div className="ip-history-content">
        {showConfirmation && <div className="ip-history-confirm" role="group" aria-label="确认删除本地历史">
          <p>{confirm?.type === 'clear' ? '清空本浏览器中的所有运行历史？' : `删除「${confirmedRecord?.plan?.spec.title ?? confirmedRecord?.question}」？`}</p>
          <p>删除后无法恢复。此操作仅影响本地历史，后台运行状态不受影响。</p>
          <div>
            <button type="button" className="ip-secondary-button" onClick={() => setConfirm(null)}>取消</button>
            <button type="button" className="ip-history-delete" onClick={() => {
              if (confirm?.type === 'clear') onClear()
              else if (confirmedRecord) onRemove(confirmedRecord.id)
              setConfirm(null)
            }}>{confirm?.type === 'clear' ? '确认清空' : '确认删除'}</button>
          </div>
        </div>}
        {record ? <>
          <div className="ip-history-detail-actions">
            <span>只读记录</span>
            <button type="button" className="ip-history-delete" onClick={() => setConfirm({ type: 'remove', id: record.id })}><Trash2 size={15} />删除此记录</button>
          </div>
          <HistoryRecordView key={record.id} record={record} />
        </> : <div className="ip-history-report-empty">选中一条运行后，可查看已保存的报告、Python 和执行记录。</div>}
      </div>
    </div>
  </section>
}

export function HistoryRecordView({ record }: { record: AnalysisRunRecord }) {
  const [tab, setTab] = useState<'report' | 'data' | 'code' | 'trace'>('report')
  const { datasetSummary: source, plan, status } = record
  return <>
    <div className="ip-history-detail">
      <h2>{plan?.spec.title ?? '分析记录'}</h2>
      <p>{record.question}</p>
      <dl>
        <div><dt>源文件</dt><dd>{source.name}</dd></div>
        <div><dt>数据规模</dt><dd>{source.rowCount} 行 · {source.columnCount} 列</dd></div>
        <div><dt>数据质量</dt><dd>{source.missingCells} 个缺失值 · {source.duplicateRows} 个重复行</dd></div>
      </dl>
      <p className="ip-history-state"><strong>{statuses[status]}</strong> · {hints[status]}</p>
      {record.error && <p className="ip-history-state">{record.error}</p>}
      {record.feedback && <div className="ip-history-state"><p>{record.feedback.error}</p><ul>{record.feedback.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div>}
      {plan && <details className="ip-history-plan">
        <summary>查看计划与已保存的阶段</summary>
        <p>{plan.explanation}</p>
        <ul>{getExecutionSteps(record.mode, plan.spec, record.phases).map(({ phase, label, state }) =>
          <li key={phase}>{label} · {({ pending: '无完成记录', running: '曾开始', completed: '完成', warning: '需留意', failed: '失败' })[state]}</li>,
        )}</ul>
      </details>}
    </div>
    <ResultsPanel history={record} tab={tab} onTab={setTab} />
  </>
}
