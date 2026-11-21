'use client'

import React, { useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CheckCheck, Circle, Code2, Loader2, ShieldCheck, X, XCircle } from 'lucide-react'
import type { AnalysisPlan, ColumnProfile, PlanEdits } from '@/lib/analysis/types'
import type { RunStatus } from '@/lib/analysis/use-workspace'
import { getExecutionSteps, type PhaseStates } from '@/lib/analysis/execution-progress'
import { PlanEditor } from './plan-editor'

export function PlanCard({ plan, status, phases, columns, saving, revisionSummary, onRevise, onApprove, onDecline, onCode }: {
  plan: AnalysisPlan | null
  status: RunStatus
  phases: PhaseStates
  columns: ColumnProfile[]
  saving: boolean
  revisionSummary: string
  onRevise: (edits: PlanEdits) => Promise<string | null>
  onApprove: () => void
  onDecline: () => void
  onCode: () => void
}) {
  const [editing, setEditing] = useState(false)
  if (!plan && status !== 'planning') return null
  if (!plan) return <div className="ip-planning"><Loader2 size={16} className="ip-spin" /><span>正在读取数据，生成分析计划…</span></div>
  const steps = getExecutionSteps(plan.mode, plan.spec, phases)
  const completed = status === 'completed'
  const finished = steps.filter((step) => step.state === 'completed' || step.state === 'warning').length
  return (
    <section className={`ip-plan-card ${completed ? 'is-completed' : ''}`}>
      <div className="ip-plan-top"><ShieldCheck size={16} /><strong>{completed ? '分析已完成' : status === 'declined' ? '计划已拒绝' : status === 'running' ? '正在执行' : status === 'error' ? '执行未完成' : '请确认分析计划'}</strong><span>{plan.planner === 'deepseek' ? 'DEEPSEEK' : 'RULES'}</span></div>
      <p className="ip-plan-explanation">{plan.explanation}</p>
      {revisionSummary && <p className="ip-plan-revision" role="status">{revisionSummary}{status === 'pending' ? ' · 新版待批准' : ''}</p>}
      <ol>{steps.map((step) => <li key={step.phase} className={`ip-phase is-${step.state}`}>
        {step.state === 'completed' ? <Check size={13} /> : step.state === 'running' ? <Loader2 size={13} className="ip-spin" /> : step.state === 'failed' ? <XCircle size={13} /> : step.state === 'warning' ? <AlertTriangle size={13} /> : <Circle size={11} />}
        <span>{step.label}</span><small>{({ pending: '待执行', running: '进行中', completed: '完成', warning: '需留意', failed: '失败' })[step.state]}</small>
      </li>)}</ol>
      {(status === 'running' || status === 'completed' || status === 'error') && <div className="ip-progress-summary" role="status"><div role="progressbar" aria-label="分析阶段进度" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={finished}><i style={{ width: `${finished / steps.length * 100}%` }} /></div><span>{finished}/{steps.length} 阶段完成{status === 'running' && finished === steps.length ? ' · 等待完整结果' : ''}</span></div>}
      <button className="ip-text-button" onClick={onCode}><Code2 size={13} /> 查看计划对应的 Python <ArrowRight size={12} /></button>
      {status === 'pending' && (editing ?
        <PlanEditor spec={plan.spec} columns={columns} saving={saving} onSave={onRevise} onCancel={() => setEditing(false)} /> :
        <>
          {plan.spec.kind === 'aggregate' && <button className="ip-plan-edit-button" type="button" onClick={() => setEditing(true)}>编辑计划</button>}
          <div className="ip-approval-actions"><button className="ip-decline" onClick={onDecline}><X size={13} /> 拒绝</button><button className="ip-primary-button" onClick={onApprove}><CheckCheck size={15} /> 批准并执行</button></div>
          <p className="ip-plan-note">{plan.mode === 'demo' ? '本次仅执行本地计算，不调用模型或云沙箱。' : '批准后将上传当前 CSV 并使用你的 E2B 额度。'}</p>
        </>)}
    </section>
  )
}
