'use client'

import { useRef, useState } from 'react'
import { ArrowUpFromLine, Check, FileSpreadsheet, RotateCcw } from 'lucide-react'
import { MAX_CSV_BYTES } from '@/lib/analysis/csv'
import { sampleDataset } from '@/lib/analysis/sample'
import type { CsvDataset, DatasetProfile } from '@/lib/analysis/types'

export function DatasetPanel({ dataset, profile, disabled, onChange }: {
  dataset: CsvDataset
  profile: DatasetProfile
  disabled: boolean
  onChange: (dataset: CsvDataset) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  async function upload(file?: File) {
    if (!file || disabled) return
    setError('')
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('请上传 UTF-8 编码的 .csv 文件。')
      if (file.size > MAX_CSV_BYTES) throw new Error('文件不能超过 1 MiB。')
      onChange({ name: file.name.slice(0, 160), csv: await file.text() })
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取此文件。') }
    if (input.current) input.current.value = ''
  }
  return (
    <section className="ip-section">
      <div className="ip-section-heading"><span className="ip-step-number">01</span><h2>数据源</h2><span className="ip-section-meta">SOURCE</span></div>
      <button
        className={`ip-upload ${dragOver ? 'is-dragging' : ''}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); void upload(event.dataTransfer.files[0]) }}
      >
        <span className="ip-upload-icon"><ArrowUpFromLine size={17} /></span>
        <strong>拖入 CSV，或点击上传</strong>
        <span>UTF-8 · 最多 10,000 行 · 1 MiB</span>
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" aria-label="上传 CSV 文件" onChange={(event) => void upload(event.target.files?.[0])} hidden />
      {error && <p role="alert" className="ip-error-text">{error}</p>}
      <div className="ip-file-card">
        <div className="ip-file-icon"><FileSpreadsheet size={19} /></div>
        <div><strong title={dataset.name}>{dataset.name}</strong><span>{profile.rowCount.toLocaleString()} 行 · {profile.columns.length} 列{dataset.csv === sampleDataset.csv ? ' · 示例数据' : ''}</span></div>
        <Check size={15} className="ip-file-check" />
      </div>
      <div className="ip-column-list">
        {profile.columns.slice(0, 8).map((column) => <span key={column.name}><i>{column.kind === 'number' ? '#' : 'Aa'}</i>{column.name}</span>)}
        {profile.columns.length > 8 && <span>+{profile.columns.length - 8} 列</span>}
      </div>
      {dataset.csv !== sampleDataset.csv && <button className="ip-text-button" disabled={disabled} onClick={() => { setError(''); onChange(sampleDataset) }}><RotateCcw size={11} /> 使用示例数据</button>}
    </section>
  )
}
