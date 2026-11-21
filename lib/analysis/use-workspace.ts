'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCsv } from './csv'
import { sampleDataset, sampleQuestions } from './sample'
import { analysisPlanSchema, planningFeedbackSchema, type AnalysisPlan, type AnalysisResult, type CsvDataset, type PlanEdits, type PlanningFeedback, type RuntimeMode } from './types'
import { ExecutionStreamError, readExecutionStream } from './execution-stream'
import type { PhaseStates, TraceItem } from './execution-progress'
import { createHistorySession } from './history-session'
import { historyRepository } from './history-repository'

export type RunStatus = 'ready' | 'planning' | 'needs_clarification' | 'pending' | 'running' | 'completed' | 'declined' | 'error'
export type Credentials = { deepseek: string; e2b: string }
const SESSION_KEY = 'insightpilot.credentials.v1'

export function useWorkspace(liveEnabled: boolean) {
  const [dataset, setDataset] = useState<CsvDataset>(sampleDataset)
  const [question, setQuestion] = useState(sampleQuestions[0].question)
  const [selectedMode, setMode] = useState<RuntimeMode>('demo')
  const mode = liveEnabled ? selectedMode : 'demo'
  const [credentials, setCredentials] = useState<Credentials>({ deepseek: '', e2b: '' })
  const [plan, setPlan] = useState<AnalysisPlan | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [status, setStatus] = useState<RunStatus>('ready')
  const [isRevising, setIsRevising] = useState(false)
  const [revisionSummary, setRevisionSummary] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<PlanningFeedback | null>(null)
  const [phases, setPhases] = useState<PhaseStates>({})
  const [trace, setTrace] = useState<TraceItem[]>([])
  const [tab, setTab] = useState<'report' | 'data' | 'code' | 'trace'>('report')
  const [historyWarning, setHistoryWarning] = useState('')
  const [historySession] = useState(() => createHistorySession(historyRepository))
  const phaseSnapshot = useRef<PhaseStates>({})
  const busy = useRef(false)
  const profile = useMemo(() => parseCsv(dataset.csv), [dataset.csv])
  const isBusy = status === 'planning' || status === 'running' || isRevising
  const connected = liveEnabled && Boolean(credentials.deepseek && credentials.e2b)

  useEffect(() => {
    if (!liveEnabled) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
      if (saved && typeof saved.deepseek === 'string' && typeof saved.e2b === 'string') {
        setCredentials({ deepseek: saved.deepseek, e2b: saved.e2b })
      }
    } catch { /* session-only credentials are optional */ }
  }, [liveEnabled])

  function record(
    message: string,
    tone: TraceItem['tone'] = 'info',
    timestamp = new Date().toISOString(),
    phase?: TraceItem['phase'],
    historyUpdate?: Parameters<typeof historySession.append>[1],
  ) {
    const entry = { message, tone, timestamp, phase }
    setTrace((current) => [...current, entry])
    historySession.append(entry, historyUpdate)
    setHistoryWarning(historySession.getWarning())
  }

  function resetAnalysis() {
    setPlan(null)
    setResult(null)
    setTrace([])
    setStatus('ready')
    setError('')
    setFeedback(null)
    setRevisionSummary('')
    setPhases({})
    phaseSnapshot.current = {}
    historySession.reset()
    setHistoryWarning('')
  }

  function newAnalysis() {
    if (busy.current) return
    resetAnalysis()
    setDataset(sampleDataset)
    setQuestion(sampleQuestions[0].question)
    setMode('demo')
    setTab('report')
  }

  function replaceDataset(next: CsvDataset) {
    if (busy.current) return
    parseCsv(next.csv)
    setDataset(next)
    resetAnalysis()
    setTab('data')
  }

  function changeQuestion(value: string) {
    if (busy.current) return
    setQuestion(value)
    if (status !== 'ready') resetAnalysis()
  }

  function changeMode(value: RuntimeMode) {
    if (busy.current || value === mode || !liveEnabled) return
    setMode(value)
    resetAnalysis()
  }

  function saveCredentials(value: Credentials) {
    if (!liveEnabled) return '当前环境只开放公开演示。'
    const normalized = { deepseek: value.deepseek.trim(), e2b: value.e2b.trim() }
    if (![normalized.deepseek, normalized.e2b].every((key) => key.length >= 8 && key.length <= 256 && /^[\x21-\x7e]+$/.test(key))) {
      return '请填写两项有效的 API Key，不要包含空格。'
    }
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized))
      setCredentials(normalized)
      resetAnalysis()
      return null
    } catch { return '浏览器禁用了会话存储，请允许后重试。' }
  }

  function disconnect() {
    if (busy.current) return
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* storage may be disabled */ }
    setCredentials({ deepseek: '', e2b: '' })
    setMode('demo')
    resetAnalysis()
  }

  async function generatePlan() {
    if (busy.current || question.trim().length < 2) return
    if (mode === 'e2b' && !connected) { setError('请先连接自己的 DeepSeek 和 E2B Key，或使用本地演示。'); return }
    busy.current = true
    setError('')
    setPlan(null)
    setResult(null)
    setTrace([])
    setFeedback(null)
    setRevisionSummary('')
    setPhases({})
    phaseSnapshot.current = {}
    setStatus('planning')
    setTab('report')
    historySession.start({
      question: question.trim(),
      mode,
      datasetSummary: {
        name: dataset.name,
        rowCount: profile.rowCount,
        columnCount: profile.columns.length,
        missingCells: profile.missingCells,
        duplicateRows: profile.duplicateRows,
      },
    })
    record(`读取 ${dataset.name} · ${profile.rowCount} 行 · ${profile.columns.length} 列`)
    record(mode === 'e2b' ? '将列信息与前 5 行样本交给 DeepSeek 规划' : '使用规则规划器解释分析目标 · 本地演示模式')
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (mode === 'e2b') headers.set('X-InsightPilot-DeepSeek-Key', credentials.deepseek)
      const response = await fetch('/api/analysis/plan', {
        method: 'POST', headers,
        body: JSON.stringify({ dataset, question, mode }),
        signal: AbortSignal.timeout(40_000),
      })
      const body = await response.json()
      const clarification = planningFeedbackSchema.safeParse(body)
      if (response.status === 422 && clarification.success) {
        setFeedback(clarification.data)
        setStatus('needs_clarification')
        record(clarification.data.error, 'warning', undefined, undefined, {
          status: 'needs_clarification', feedback: clarification.data,
        })
        return
      }
      if (!response.ok) throw new Error(body.error || '无法生成计划。')
      const parsed = analysisPlanSchema.safeParse(body)
      if (!parsed.success || parsed.data.mode !== mode || parsed.data.datasetName !== dataset.name || parsed.data.question !== question.trim()) {
        throw new Error('规划响应与当前请求不一致，未进入审批；请重试。')
      }
      setPlan(parsed.data)
      setStatus('pending')
      const { planner, spec, explanation, code } = parsed.data
      record('分析计划与 Python 代码已准备好，等待你的批准；尚未执行', 'success', undefined, undefined, {
        status: 'pending', plan: { planner, spec, explanation, code },
      })
    } catch (failure) {
      setStatus('error')
      const message = failure instanceof Error ? failure.message : '规划失败，请重试。'
      setError(message)
      record(message, 'error', undefined, undefined, { status: 'error', error: message })
    } finally { busy.current = false }
  }

  async function revisePlan(edits: PlanEdits): Promise<string | null> {
    if (!plan || plan.spec.kind !== 'aggregate' || status !== 'pending' || busy.current) return '当前计划无法编辑。'
    busy.current = true
    setIsRevising(true)
    setError('')
    try {
      const response = await fetch('/api/analysis/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, approvalToken: plan.approvalToken, edits }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = await response.json()
      if (response.status === 422 && typeof body.error === 'string') return body.error
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '无法保存修改。')
      const { data: next } = analysisPlanSchema.safeParse(body)
      if (!next || next.id === plan.id || next.approvalToken === plan.approvalToken ||
        next.mode !== plan.mode || next.planner !== plan.planner || next.datasetName !== plan.datasetName ||
        next.question !== plan.question || next.spec.kind !== 'aggregate' ||
        next.spec.groupBy !== edits.groupBy || next.spec.metric !== edits.metric || next.spec.aggregation !== edits.aggregation) {
        throw new Error('修改响应和提交的变化不一致。')
      }
      const labels = { sum: '求和', mean: '平均值', count: '记录计数' }
      const changes = [
        plan.spec.groupBy !== edits.groupBy && `分组 ${plan.spec.groupBy ?? '全部数据'} → ${edits.groupBy ?? '全部数据'}`,
        plan.spec.metric !== edits.metric && `数值列 ${plan.spec.metric ?? '无'} → ${edits.metric ?? '无'}`,
        plan.spec.aggregation !== edits.aggregation && `聚合 ${labels[plan.spec.aggregation]} → ${labels[edits.aggregation]}`,
      ].filter(Boolean).join(' · ')
      setPlan(next)
      setRevisionSummary(changes)
      const { planner, spec, explanation, code } = next
      record(`用户更新计划 · ${changes} · 新版等待批准`, 'info', undefined, undefined, {
        status: 'pending', plan: { planner, spec, explanation, code },
      })
      return null
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : '未收到更新结果。'
      const message = `${detail} 请生成新计划后再批准。`
      setPlan(null)
      setStatus('error')
      setError(message)
      record(message, 'error', undefined, undefined, { status: 'error', error: message })
      return message
    } finally {
      busy.current = false
      setIsRevising(false)
    }
  }

  async function approve() {
    if (!plan || status !== 'pending' || busy.current) return
    busy.current = true
    setStatus('running')
    setError('')
    setTab('report')
    record('用户批准本次计划 · 审批仅适用于当前数据与代码', 'info', undefined, undefined, { status: 'running' })
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (mode === 'e2b') headers.set('X-InsightPilot-E2B-Key', credentials.e2b)
      const response = await fetch('/api/analysis/execute', {
        method: 'POST', headers,
        body: JSON.stringify({ dataset, approvalToken: plan.approvalToken }),
        signal: AbortSignal.timeout(65_000),
      })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || '执行未完成。')
      }
      if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('未收到有效的执行结果流。')
      const received = await readExecutionStream(response.body, (event) => {
        phaseSnapshot.current = { ...phaseSnapshot.current, [event.phase]: event.status }
        setPhases(phaseSnapshot.current)
        record(event.message, event.status === 'completed' ? 'success' : event.status, event.timestamp, event.phase, {
          phases: phaseSnapshot.current,
        })
      })
      if (received.mode !== plan.mode) throw new Error('执行模式与已批准的计划不一致，已阻止报告发布。')
      setResult(received)
      setStatus('completed')
      record('完整结果流已接收 · 校验通过 · 报告可下载', 'success', undefined, undefined, {
        status: 'completed', result: received,
      })
    } catch (failure) {
      setResult(null)
      setStatus('error')
      const failedPhase = failure instanceof ExecutionStreamError ? failure.phase : undefined
      const next = { ...phaseSnapshot.current }
      for (const phase of Object.keys(next) as (keyof PhaseStates)[]) if (next[phase] === 'running') next[phase] = 'failed'
      if (failedPhase) next[failedPhase] = 'failed'
      phaseSnapshot.current = next
      setPhases(next)
      const message = failure instanceof Error ? failure.message : '执行失败，请重新规划。'
      setError(message)
      record(message, 'error', undefined, failedPhase, { status: 'error', error: message, phases: next })
    } finally { busy.current = false }
  }

  function decline() {
    if (status !== 'pending' || busy.current) return
    setStatus('declined')
    record('用户拒绝本次计划 · 未执行分析或创建沙箱', 'info', undefined, undefined, { status: 'declined' })
  }

  return {
    dataset, profile, question, mode, plan, result, status, error, feedback, phases, trace, tab,
    connected, isBusy, setTab, changeQuestion, changeMode, replaceDataset,
    saveCredentials, disconnect, generatePlan, revisePlan, isRevising, revisionSummary, approve, decline, setError, historyWarning, newAnalysis,
  }
}
