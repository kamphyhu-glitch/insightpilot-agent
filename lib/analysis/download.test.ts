import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createResultCsv, downloadText } from './download'
import { parseCsv } from './csv'
import type { ComputedAnalysis } from './types'

const values: ComputedAnalysis = {
  rowCount: 3, missingCells: 1, duplicateRows: 1, validValues: 2, total: -5,
  groups: [{ label: '=UNTRUSTED()', value: -5, count: 2 }],
}

describe('download content and browser handoff', () => {
  it('exports numeric results and formula-safe labels with BOM and CRLF', () => {
    const csv = createResultCsv('aggregate', values)
    assert.ok(csv.startsWith('\uFEFF'))
    assert.ok(csv.includes('\r\n'))
    const profile = parseCsv(csv)
    assert.equal(profile.rows[0][0], "'=UNTRUSTED()")
    assert.equal(profile.rows[0][1], '-5')
  })
  it('exports quality counts instead of a header-only empty aggregation', () => {
    const profile = parseCsv(createResultCsv('quality', values))
    assert.deepEqual(profile.rows, [['row_count', '3'], ['missing_cells', '1'], ['duplicate_rows', '1']])
  })
  for (const failClick of [false, true]) {
    it(failClick ? 'releases resources when the browser rejects the click' : 'attaches a real anchor and does not revoke the blob before handoff', () => {
      const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
      const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
      const originalCreate = URL.createObjectURL
      const originalRevoke = URL.revokeObjectURL
      const calls: string[] = []
      let release: (() => void) | undefined
      const anchor = {
        href: '', download: '',
        click() { calls.push('click'); if (failClick) throw new Error('blocked') },
        remove() { calls.push('remove') },
      }
      Object.defineProperty(globalThis, 'document', { configurable: true, value: {
        createElement: () => anchor, body: { appendChild() { calls.push('attach') } },
      } })
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {
        setTimeout(callback: () => void, delay: number) { assert.ok(delay >= 10_000); release = callback },
      } })
      URL.createObjectURL = () => { calls.push('create'); return 'blob:local-test' }
      URL.revokeObjectURL = () => { calls.push('revoke') }
      try {
        if (failClick) assert.throws(() => downloadText('report.md', 'content'), /blocked/)
        else downloadText('report.md', 'content')
        assert.equal(anchor.download, 'report.md')
        assert.deepEqual(calls, ['create', 'attach', 'click', 'remove'])
        release!()
        assert.equal(calls.at(-1), 'revoke')
      } finally {
        URL.createObjectURL = originalCreate
        URL.revokeObjectURL = originalRevoke
        if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor)
        else Reflect.deleteProperty(globalThis, 'document')
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
        else Reflect.deleteProperty(globalThis, 'window')
      }
    })
  }
})
