'use client'

import { useState } from 'react'
import { KeyRound, PlugZap, ShieldCheck, X } from 'lucide-react'
import type { Credentials } from '@/lib/analysis/use-workspace'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export function ConnectionDialog({ open, onOpenChange, connected, onSave, onDisconnect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  connected: boolean
  onSave: (credentials: Credentials) => string | null
  onDisconnect: () => void
}) {
  const [deepseek, setDeepseek] = useState('')
  const [e2b, setE2b] = useState('')
  const [error, setError] = useState('')
  function changeOpen(next: boolean) {
    if (!next) { setDeepseek(''); setE2b(''); setError('') }
    onOpenChange(next)
  }
  function save() {
    const error = onSave({ deepseek, e2b })
    if (error) { setError(error); return }
    setDeepseek('')
    setE2b('')
    setError('')
    changeOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="ip-dialog sm:max-w-[480px]">
        <div className="ip-dialog-icon"><PlugZap size={23} /></div>
        <DialogTitle className="text-xl font-semibold tracking-tight">连接你的分析引擎</DialogTitle>
        <DialogDescription className="leading-6">DeepSeek 负责理解目标，E2B 提供 Python 沙箱。两项服务分别使用你自己的额度。</DialogDescription>
        <div className="ip-key-label"><KeyRound size={14} /><label htmlFor="deepseek-key">DeepSeek API Key</label></div>
        <input id="deepseek-key" type="password" autoComplete="off" spellCheck={false} value={deepseek} onChange={(event) => setDeepseek(event.target.value)} placeholder="sk-…" className="ip-text-input" />
        <div className="ip-key-label"><KeyRound size={14} /><label htmlFor="e2b-key">E2B API Key</label></div>
        <input id="e2b-key" type="password" autoComplete="off" spellCheck={false} value={e2b} onChange={(event) => setE2b(event.target.value)} placeholder="e2b_…" className="ip-text-input" />
        <div className="ip-privacy"><ShieldCheck size={17} /><p>Key 仅保存在当前标签页会话中。规划时会向 DeepSeek 发送列信息与前 5 行样本；批准后才向 E2B 上传完整 CSV。Key 不进入分析代码。</p></div>
        {error && <p role="alert" className="ip-error-text">{error}</p>}
        <button className="ip-primary-button" onClick={save}>保存会话连接 <PlugZap size={15} /></button>
        <p className="ip-dialog-note">保存仅代表已配置；实际连接会在运行时验证。</p>
        {connected && <button className="ip-text-button" onClick={() => { onDisconnect(); changeOpen(false) }}><X size={13} /> 清除连接，返回演示模式</button>}
      </DialogContent>
    </Dialog>
  )
}
