'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, ChevronRight, CircleHelp, Command, Database, ExternalLink, FlaskConical, Github, History, Layers3, Loader2, Plus, Settings2, Sparkles } from 'lucide-react'
import { DatasetPanel } from './dataset-panel'
import { PlanCard } from './plan-card'
import { ResultsPanel } from './results-panel'
import { ConnectionDialog } from './connection-dialog'
import { HistoryPanel } from './history-panel'
import { sampleDataset, sampleQuestions } from '@/lib/analysis/sample'
import { useWorkspace } from '@/lib/analysis/use-workspace'
import { useRunHistory } from '@/lib/analysis/use-run-history'
import { downloadText } from '@/lib/analysis/download'

export function AnalysisWorkspace({ liveEnabled }: { liveEnabled: boolean }) {
  const agent = useWorkspace(liveEnabled)
  const history = useRunHistory()
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [downloadNotice, setDownloadNotice] = useState('')
  return <div className="ip-app">
    <aside className="ip-sidebar">
      <Link href="/" className="ip-brand"><span className="ip-brand-mark"><BarChart3 size={20} /></span><span>insightpilot<span className="ip-brand-period">.</span></span></Link>
      <div className="ip-sidebar-label">WORKSPACE</div>
      <button className={`ip-sidebar-item ${history.open ? '' : 'is-selected'}`} onClick={history.close}><Layers3 size={16} /><span>分析工作台</span></button>
      <button className="ip-sidebar-item" onClick={() => { history.close(); agent.setTab('data') }}><Database size={16} /><span>数据预览</span></button>
      <button className="ip-sidebar-item" onClick={() => { history.close(); agent.setTab('trace') }}><Command size={16} /><span>执行记录</span>{agent.trace.length > 0 && <span className="ip-sidebar-count">{agent.trace.length}</span>}</button>
      <button className={`ip-sidebar-item ${history.open ? 'is-selected' : ''}`} aria-label="打开运行历史" disabled={agent.isBusy} onClick={history.show}><History size={16} /><span>运行历史</span></button>
      <div className="ip-sidebar-divider" />
      <div className="ip-sidebar-label">EXPLORE</div>
      <button className="ip-sidebar-item" disabled={agent.isBusy} onClick={() => { history.close(); agent.replaceDataset(sampleDataset); agent.changeQuestion(sampleQuestions[0].question) }}><FlaskConical size={16} /><span>示例分析</span><ArrowUpRight size={13} /></button>
      <a className="ip-sidebar-item" href="https://github.com/e2b-dev/fragments" target="_blank" rel="noreferrer"><Github size={16} /><span>开源底座</span><ExternalLink size={12} /></a>
      <div className="ip-sidebar-bottom">
        <div className="ip-sidebar-note">
          <span className="ip-live-dot" />
          <strong>Built for curious minds.</strong>
          <p>让数据说话，<br />让过程值得信任。</p>
        </div>
        {liveEnabled && (
          <button className="ip-sidebar-user" onClick={() => setConnectionOpen(true)} disabled={agent.isBusy}>
            <span>Y</span>
            <div><strong>Your workspace</strong><small>{agent.connected ? 'API keys configured' : 'Personal · local demo'}</small></div>
            <Settings2 size={14} />
          </button>
        )}
      </div>
    </aside>

    <div className="ip-main">
      <header className="ip-topbar">
        <div>
          <span>Workspace</span>
          <ChevronRight size={13} />
          <strong>{history.open ? '运行历史' : '分析工作台'}</strong>
          <span className="ip-beta-tag">BETA</span>
        </div>
        <div>
          <button className="ip-help" aria-label="使用说明" onClick={() => setHelpOpen(!helpOpen)}><CircleHelp size={17} /></button>
          {liveEnabled ? (
            <>
              <span className="ip-topbar-divider" />
              <button className={`ip-connect ${agent.connected ? 'is-connected' : ''}`} onClick={() => setConnectionOpen(true)} disabled={agent.isBusy}>
                <span className="ip-status-dot" />{agent.connected ? 'API 已配置' : '连接模型与沙箱'}<Settings2 size={13} />
              </button>
            </>
          ) : <span className="ip-beta-tag">公开演示</span>}
        </div>
      </header>
      {helpOpen && <div className="ip-help-banner"><strong>开始你的第一次分析</strong><p>① 选择示例或上传 CSV　② 输入问题并生成计划　③ 检查计划与代码　④ 批准后查看图表、结果校验和执行记录。{liveEnabled ? 'Demo 无需 Key。Live 需要自己的 DeepSeek 与 E2B Key。' : '公开演示无需 API Key。'}首版支持分组求和、平均、计数和数据质量检查。</p></div>}
      <main className="ip-main-content">
        {(agent.historyWarning || history.snapshot.warning) && <div className="ip-history-warning" role="status">{agent.historyWarning} {history.snapshot.warning}</div>}
        {history.open ? <HistoryPanel records={history.snapshot.records} record={history.record} canClear={history.snapshot.canClear}
          onSelect={history.select} onRemove={history.remove} onClear={history.clear}
          onNew={() => { agent.newAnalysis(); history.close(); setDownloadNotice('') }} /> : <>
        <div className="ip-page-heading"><div><span className="ip-eyebrow">YOUR DATA. A CLEARER DIRECTION.</span><h1>从数据，找到下一步<span>。</span></h1><p>提一个问题。先看计划，再让 Agent 动手。</p></div><div className="ip-heading-actions"><button className="ip-secondary-button" disabled={agent.isBusy} onClick={history.show}><History size={14} />运行历史</button><button className="ip-secondary-button" onClick={() => { try { downloadText('campaign_performance.csv', sampleDataset.csv, 'text/csv;charset=utf-8'); setDownloadNotice('已请求下载示例数据，请查看浏览器下载列表。') } catch { setDownloadNotice('浏览器未能启动下载，请允许下载后重试。') } }}><ArrowDownToLine size={14} /> 示例数据</button></div></div>
        {downloadNotice && <p role="status" className="ip-download-notice">{downloadNotice}</p>}
        <div className="ip-workbench">
          <div className="ip-controls">
            <DatasetPanel dataset={agent.dataset} profile={agent.profile} disabled={agent.isBusy} onChange={agent.replaceDataset} />
            <section className="ip-section ip-question-section">
              <div className="ip-section-heading"><span className="ip-step-number">02</span><h2>你想了解什么？</h2><Sparkles size={13} className="ip-heading-spark" /></div>
              <label className="sr-only" htmlFor="analysis-question">分析目标</label>
              <textarea
                id="analysis-question" value={agent.question} disabled={agent.isBusy}
                onChange={(event) => agent.changeQuestion(event.target.value)}
                placeholder="例如：按渠道比较收入，哪些渠道表现最好？" maxLength={1_000} rows={4}
              />
              {liveEnabled && (
                <div className="ip-mode-picker">
                  <button disabled={agent.isBusy} className={agent.mode === 'demo' ? 'is-active' : ''} onClick={() => agent.changeMode('demo')}>
                    <span />本地演示
                  </button>
                  <button disabled={agent.isBusy} className={agent.mode === 'e2b' ? 'is-active' : ''} onClick={() => {
                    if (!agent.connected) setConnectionOpen(true)
                    agent.changeMode('e2b')
                  }}>
                    <span />Live · E2B
                  </button>
                </div>
              )}
              <p className="ip-mode-note">{agent.mode === 'demo' ? '使用示例或上传 CSV · 无需 API Key' : 'DeepSeek 规划 + E2B Python 执行 · 使用你的额度'}</p>
              <button className="ip-primary-button ip-generate" disabled={agent.isBusy || agent.question.trim().length < 2} onClick={() => void agent.generatePlan()}>
                {agent.isBusy ? <Loader2 size={16} className="ip-spin" /> : <Sparkles size={16} />}
                {agent.isRevising ? '正在保存计划…' : agent.status === 'planning' ? '正在生成计划…' : agent.status === 'running' ? '分析正在执行…' : '生成分析计划'}
                {!agent.isBusy && <ArrowRight size={15} />}
              </button>
              {agent.error && <div role="alert" className="ip-error-box">{agent.error}</div>}
            </section>
            {agent.feedback && <section className="ip-planning-feedback" role="status"><strong>{agent.feedback.reason === 'unsupported' ? '这个目标暂不支持' : '先明确一下分析目标'}</strong><p>{agent.feedback.error}</p><span>试试当前支持的问题 · 点击只填入，不执行</span>{agent.feedback.suggestions.map((suggestion) => <button key={suggestion} onClick={() => agent.changeQuestion(suggestion)}>{suggestion}<ArrowRight size={12} /></button>)}</section>}
            <PlanCard key={agent.plan?.id} plan={agent.plan} status={agent.status} phases={agent.phases} columns={agent.profile.columns}
              saving={agent.isRevising} revisionSummary={agent.revisionSummary} onRevise={agent.revisePlan}
              onApprove={() => void agent.approve()} onDecline={agent.decline} onCode={() => agent.setTab('code')} />
            {!agent.plan && agent.status !== 'planning' && <section className="ip-examples"><div className="ip-examples-label">没想好？从一个问题开始</div>{sampleQuestions.map((example) => <button key={example.tag} disabled={agent.isBusy} onClick={() => { agent.replaceDataset(sampleDataset); agent.changeQuestion(example.question) }}><span><i>{example.tag}</i>{example.title}</span><Plus size={13} /></button>)}</section>}
            <p className="ip-controls-footnote"><span />执行前需要你的批准</p>
          </div>
          <ResultsPanel dataset={agent.dataset} profile={agent.profile} plan={agent.plan} result={agent.result} status={agent.status} trace={agent.trace} tab={agent.tab} onTab={agent.setTab} />
        </div>
        </>}
        <footer className="ip-page-footer"><span><span className="ip-mini-mark">↗</span> InsightPilot <span className="ip-footer-dot">·</span> A small step from data to decision.</span><a href="https://github.com/e2b-dev/fragments" target="_blank" rel="noreferrer">Based on E2B Fragments <ArrowUpRight size={11} /></a></footer>
      </main>
    </div>
    {liveEnabled && <ConnectionDialog open={connectionOpen} onOpenChange={setConnectionOpen} connected={agent.connected} onSave={agent.saveCredentials} onDisconnect={agent.disconnect} />}
  </div>
}
