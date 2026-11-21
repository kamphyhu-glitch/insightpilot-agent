'use client'

import React, { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, BarChart3, CheckCircle2, Code2, FileText, ScanLine, Table2 } from 'lucide-react'
import { createResultCsv, downloadText } from '@/lib/analysis/download'
import type { AnalysisPlan, AnalysisResult, CsvDataset, DatasetProfile } from '@/lib/analysis/types'
import type { RunStatus } from '@/lib/analysis/use-workspace'
import type { TraceItem } from '@/lib/analysis/execution-progress'
import type { AnalysisRunRecord } from '@/lib/analysis/history-types'
import { TraceList } from './trace-view'

const number = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
type Tab = 'report' | 'data' | 'code' | 'trace'

type ActiveResults = {
  history?: never
  dataset: CsvDataset
  profile: DatasetProfile
  plan: AnalysisPlan | null
  result: AnalysisResult | null
  status: RunStatus
  trace: TraceItem[]
}

export function ResultsPanel(props: (ActiveResults | { history: AnalysisRunRecord }) & {
  tab: Tab
  onTab: (tab: Tab) => void
}) {
  const { history, tab, onTab } = props
  const active = props.history ? null : props
  const dataset = active?.dataset
  const profile = active?.profile
  const plan = history ? history.plan : active?.plan
  const status = history ? history.status : active!.status
  const trace = history ? history.trace : active!.trace
  const receivedResult = history ? history.result : active?.result
  const question = history?.question ?? active?.plan?.question
  const mode = history?.mode ?? active?.plan?.mode
  const columnCount = history?.datasetSummary.columnCount ?? profile?.columns.length ?? 1
  const planId = history?.id ?? active?.plan?.id
  const result = status === 'completed' ? receivedResult : null
  const [notice, setNotice] = useState('')
  useEffect(() => { setNotice('') }, [planId, receivedResult])
  function exportFile(name: string, content: string, mime?: string) {
    try { downloadText(name, content, mime); setNotice(`已请求下载 ${name}，请查看浏览器下载列表。`) }
    catch { setNotice('浏览器未能启动下载，请允许下载后重试。') }
  }
  const tabs = [
    { id: 'report' as const, label: '分析报告', Icon: BarChart3 },
    { id: 'data' as const, label: '数据预览', Icon: Table2 },
    { id: 'code' as const, label: 'Python', Icon: Code2 },
    { id: 'trace' as const, label: '执行记录', Icon: ScanLine },
  ].filter(({ id }) => !history || id !== 'data')
  return (
    <section className="ip-output">
      <div className="ip-output-toolbar"><div className="ip-tabs" role="tablist" aria-label="分析结果视图">{tabs.map(({ id, label, Icon }, index) => <button key={id} id={`ip-tab-${id}`} role="tab" aria-controls="ip-result-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'is-active' : ''} onClick={() => onTab(id)} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
        if (next === null) return
        event.preventDefault(); onTab(tabs[next].id)
        document.getElementById(`ip-tab-${tabs[next].id}`)?.focus()
      }}><Icon size={14} /><span>{label}</span>{id === 'trace' && trace.length > 0 && <i>{trace.length}</i>}</button>)}</div>{result && <button className="ip-export" aria-label="导出报告" onClick={() => exportFile('insightpilot-report.md', result.report, 'text/markdown;charset=utf-8')}><ArrowDownToLine size={14} /><span>导出报告</span></button>}</div>
      {notice && <p role="status" className="ip-download-notice">{notice}</p>}
      <div id="ip-result-panel" role="tabpanel" tabIndex={0} aria-labelledby={`ip-tab-${tab}`} className="ip-tab-content">

      {tab === 'data' && dataset && profile && <div className="ip-data-view"><div className="ip-view-heading"><div><span className="ip-eyebrow">DATA EXPLORER</span><h2>先理解你的数据。</h2><p>{dataset.name} · 显示前 {Math.min(10, profile.rowCount)} 行</p></div><span className="ip-muted-tag">{profile.columns.length} columns</span></div><div className="ip-table-wrap"><table><thead><tr><th>#</th>{profile.columns.map((column) => <th key={column.name}><span className="ip-header-kind">{column.kind === 'number' ? '#' : 'Aa'}</span>{column.name}</th>)}</tr></thead><tbody>{profile.rows.slice(0, 10).map((row, index) => <tr key={index}><td>{String(index + 1).padStart(2, '0')}</td>{row.map((value, index) => <td key={index}>{value || <span className="ip-missing">null</span>}</td>)}</tr>)}</tbody></table></div><div className="ip-data-footnote"><span><CheckCircle2 size={13} /> 格式校验通过</span><span>{profile.missingCells} 个缺失值 · {profile.duplicateRows} 个重复行</span></div></div>}

      {tab === 'code' && <div className="ip-code-view"><div className="ip-view-heading"><div><span className="ip-eyebrow">{history ? 'SAVED PLAN' : 'EXECUTABLE PLAN'}</span><h2>每一步，都可以检查。</h2><p>{history ? '此代码来自历史计划，可查看或下载。' : mode === 'demo' ? '这是等价 Python 代码；演示模式实际运行 TypeScript。' : '由已验证的分析计划编译生成，批准后才在 E2B 执行。'}</p></div>{plan && <button className="ip-export" aria-label="下载 Python 代码" onClick={() => exportFile('analysis.py', plan.code, 'text/x-python;charset=utf-8')}><ArrowDownToLine size={14} /></button>}</div>{plan ? <div className="ip-code-block"><div><span className="ip-code-dots">● ● ●</span><span>analysis.py</span><span>Python 3</span></div><pre><code>{plan.code}</code></pre></div> : <div className="ip-tab-placeholder"><Code2 size={28} /><p>{history ? '这条记录没有保存 Python 代码。' : '生成计划后，Python 代码将显示在这里。'}</p></div>}</div>}

      {tab === 'trace' && <div className="ip-trace-view"><div className="ip-view-heading"><div><span className="ip-eyebrow">RUN OBSERVABILITY</span><h2>从目标，到结果。</h2><p>记录实际发生的规划、审批、执行与校验。</p></div><span className="ip-muted-tag">{trace.length} events</span></div>{trace.length ? <TraceList trace={trace} busy={!history && (status === 'running' || status === 'planning')} /> : <div className="ip-tab-placeholder"><ScanLine size={28} /><p>开始分析后，这里会记录每一个真实事件。</p></div>}</div>}

      {tab === 'report' && (!result ? history ? <div className="ip-history-report-empty">这条记录没有已核验的报告。可在执行记录中查看已保存的事件。</div> : <EmptyReport status={status} trace={trace} /> : <div className="ip-report-view">
        <div className="ip-report-kicker"><span><CheckCircle2 size={13} /> {history ? '历史结果，未重新运行' : 'VERIFIED ANALYSIS'}</span><span>{result.mode === 'demo' ? 'LOCAL DEMO' : 'E2B · PYTHON'}</span></div>
        {!history && <><h2>{plan?.spec.title ?? '分析报告'}</h2><p className="ip-report-question">{question}</p></>}
        <div className="ip-result-stats"><div><span>{plan?.spec.kind === 'quality' ? '质量问题' : plan?.spec.aggregation === 'mean' ? '整体平均值' : plan?.spec.aggregation === 'count' ? '记录计数' : '汇总指标'}</span><strong>{number(plan?.spec.kind === 'quality' ? result.values.missingCells + result.values.duplicateRows : result.values.total)}</strong><small>{plan?.spec.kind === 'quality' ? '缺失单元格 + 重复行' : plan?.spec.metric ?? 'records'}</small></div><div><span>参与分析</span><strong>{number(result.values.rowCount)}<small>行</small></strong><small>{plan?.spec.kind === 'quality' ? '全部源数据记录' : `${result.values.validValues} 个有效指标值`}</small></div><div><span>数据完整度</span><strong>{number(100 * (1 - result.values.missingCells / (result.values.rowCount * columnCount)))}<small>%</small></strong><small>{result.values.missingCells} 个缺失单元格</small></div></div>
        {result.values.groups.length > 0 && <div className="ip-chart-card"><div className="ip-chart-heading"><div><h3>{plan?.spec.groupBy ?? '全部数据'} · {plan?.spec.metric ?? '记录数'}</h3><p>{plan?.spec.aggregation.toUpperCase()} · {result.values.groups.length} 个分组{result.values.groups.length > 8 ? '，图表显示前 8 个' : ''}</p></div><span><i />分析结果</span></div><div className="ip-bars">{result.values.groups.slice(0, 8).map((group, index) => { const max = Math.max(...result.values.groups.map((item) => Math.abs(item.value)), 1); return <div key={group.label} className="ip-bar-row"><span title={group.label}>{group.label}</span><div><i style={{ width: `${Math.max(0.8, Math.abs(group.value) / max * 100)}%`, background: index === 0 ? '#173c32' : index === 1 ? '#438b6b' : index === 2 ? '#88b49a' : '#c9decb' }} /></div><strong>{number(group.value)}</strong></div> })}</div><div className="ip-chart-axis"><span>0</span><span>按数值排序 · 负数以绝对条长展示，右侧保留符号</span></div></div>}
        <div className="ip-insight-card"><span className="ip-insight-icon"><ArrowUpRight size={19} /></span><div><h3>从数据中得到什么？</h3><p>{result.values.groups.length > 0 ? `${result.values.groups[0].label} 的${plan?.spec.aggregation === 'mean' ? '平均值' : '指标值'}最高，为 ${number(result.values.groups[0].value)}。比较基于本次运行的源数据，不代表因果关系。` : `发现 ${result.values.missingCells} 个缺失单元格和 ${result.values.duplicateRows} 个完全重复行。分析保留原始数据，没有自动删除记录。`}</p></div></div>
        <div className="ip-verification"><div><ShieldIcon /><strong>结果校验</strong><span>{result.checks.filter((check) => check.passed).length}/{result.checks.length} passed</span></div><div className="ip-checks">{result.checks.map((check) => <span key={check.name}><CheckCircle2 size={13} />{check.name}</span>)}</div><p>{result.mode === 'demo' ? '本地演示校验内部一致性；跨语言独立校验需要 E2B 模式。' : `本次运行已对照 Python 输出与 TypeScript 独立计算。Sandbox: ${result.sandboxId}`}</p>{result.cleanup === 'failed' && <p className="ip-error-text">沙箱释放尚未确认，将受 90 秒生命周期上限约束。</p>}</div>
        <div className="ip-report-footer"><span>{result.mode === 'demo' ? 'Computed locally' : 'Executed in E2B'} · {result.durationMs < 1_000 ? '< 1s' : `${(result.durationMs / 1_000).toFixed(1)}s`}</span><button onClick={() => exportFile('analysis-results.csv', createResultCsv(plan?.spec.kind ?? 'aggregate', result.values), 'text/csv;charset=utf-8')}><ArrowDownToLine size={13} /> 下载结果 CSV</button></div>
      </div>)}
      </div>
    </section>
  )
}

function ShieldIcon() { return <CheckCircle2 size={16} /> }

function EmptyReport({ status, trace }: { status: RunStatus; trace: TraceItem[] }) {
  const working = status === 'planning' || status === 'running'
  if (status === 'error' || status === 'needs_clarification') return <div className={`ip-empty-report ip-empty-feedback ${status === 'error' ? 'is-error' : ''}`}><ScanLine size={32} /><span className="ip-eyebrow">{status === 'error' ? 'NO REPORT PUBLISHED' : 'CLARIFICATION NEEDED'}</span><h2>{status === 'error' ? '本次分析未完成。' : '先把问题说清楚。'}</h2><p>{trace.at(-1)?.message ?? '请检查提示，调整目标后重新生成计划。'}</p><p>{status === 'error' ? '没有发布可验证的结果。请重新生成计划，再决定是否批准；本次不会自动重试执行。' : '请使用左侧的建议调整问题，再生成计划。当前没有执行任何分析。'}</p></div>
  return <div className="ip-empty-report"><div className="ip-empty-visual" aria-hidden="true"><div className="ip-visual-grid" /><div className="ip-floating-file"><FileText size={19} /><span>raw data</span><i /><i /><i /></div><div className="ip-visual-connector"><span /><span /><span /></div><div className="ip-floating-chart"><span>clear insights <ArrowUpRight size={13} /></span><div><i /><i /><i /><i /></div></div><span className="ip-visual-spark">✳</span></div><span className="ip-eyebrow">A LITTLE LESS GUESSWORK.</span><h2>{working ? '正在把数据，变成答案。' : status === 'pending' ? '计划就绪，等你做决定。' : '你的下一个洞察，\n从这里开始。'}</h2><p>{working ? trace.at(-1)?.message : status === 'pending' ? '在左侧检查分析计划，批准后才会开始执行。' : status === 'declined' ? '本次计划已拒绝。修改问题后，可以重新生成。' : '从一个好问题出发。让 Agent 理清计划、完成计算，\n把每个结论的来处交代清楚。'}</p><div className="ip-empty-pills"><span><ScanLine size={13} /> 可检查的过程</span><span><CheckCircle2 size={13} /> 可验证的结果</span></div></div>
}
