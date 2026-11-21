import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runInSandbox, SandboxExecutionError, type SandboxFactory } from './sandbox'
import type { ProgressReporter } from './execution-progress'
import { RESULT_MARKER } from './python'

const result = { rowCount: 1, missingCells: 0, duplicateRows: 0, groups: [], total: 0, validValues: 0 }

function fakeSandbox(fail = false, cleanupFails = false) {
  const events: string[] = []
  let written = false
  const factory: SandboxFactory = async () => {
    events.push('create')
    return {
      sandboxId: 'test-sandbox',
      files: { write: async () => { await Promise.resolve(); written = true; events.push('write') } },
      runCode: async () => {
        assert.ok(written, 'CSV upload must complete before Python runs')
        events.push('run')
        if (fail) throw new Error('provider failed')
        return { logs: { stdout: [RESULT_MARKER + JSON.stringify(result)], stderr: [] } }
      },
      kill: async () => { events.push('kill'); if (cleanupFails) throw new Error('cleanup failed'); return true },
    } as unknown as Awaited<ReturnType<SandboxFactory>>
  }
  return { factory, events }
}

describe('E2B adapter lifecycle', () => {
  it('awaits upload, executes and releases its sandbox', async () => {
    const { factory, events } = fakeSandbox()
    const execution = await runInSandbox('name\nA', 'print(1)', 'test-key', () => {}, factory)
    assert.deepEqual(events, ['create', 'write', 'run', 'kill'])
    assert.deepEqual(execution.values, result)
    assert.equal(execution.cleanup, 'completed')
  })
  it('still cleans up when execution throws', async () => {
    const { factory, events } = fakeSandbox(true)
    await assert.rejects(runInSandbox('name\nA', 'raise Exception()', 'test-key', () => {}, factory))
    assert.equal(events.at(-1), 'kill')
  })
  it('reports cleanup failure honestly', async () => {
    const { factory } = fakeSandbox(false, true)
    const execution = await runInSandbox('name\nA', 'print(1)', 'test-key', () => {}, factory)
    assert.equal(execution.cleanup, 'failed')
  })
  it('preserves the failure phase after cleanup and emits a release warning separately', async () => {
    const { factory } = fakeSandbox(true, true)
    const progress: Parameters<ProgressReporter>[] = []
    await assert.rejects(runInSandbox('name\nA', 'fail()', 'test-key', (...event) => progress.push(event), factory), (error) => {
      assert.ok(error instanceof SandboxExecutionError)
      assert.equal(error.phase, 'analysis')
      assert.ok(!error.message.includes('provider failed'))
      return true
    })
    assert.equal(progress.at(-1)?.[0], 'cleanup')
    assert.equal(progress.at(-1)?.[1], 'warning')
    assert.ok(!progress.some(([phase, status]) => phase === 'analysis' && status === 'completed'))
  })
})
