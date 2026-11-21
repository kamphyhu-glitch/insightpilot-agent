import React from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, Info, XCircle } from 'lucide-react'
import type { TraceItem } from '@/lib/analysis/execution-progress'

export function TraceList({ trace, busy }: { trace: TraceItem[]; busy: boolean }) {
  return <ol className="ip-trace-list">{trace.map((event, index) => {
    const active = event.tone === 'running' && busy && index === trace.length - 1
    const Icon = event.tone === 'error' ? XCircle : event.tone === 'warning' ? AlertTriangle : event.tone === 'success' ? CheckCircle2 : active ? CircleDashed : Info
    return <li key={`${event.timestamp}-${index}`} className={`ip-trace-event is-${event.tone}`}>
      <div className="ip-trace-dot"><Icon size={14} className={active ? 'ip-spin' : undefined} /></div>
      <div><span>EVENT {String(index + 1).padStart(2, '0')} · {({ info: '记录', running: '开始', success: '成功', warning: '警告', error: '失败' })[event.tone]}</span><p>{event.message}</p></div>
      <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
    </li>
  })}</ol>
}
