import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHistoryRepository, HISTORY_KEY } from './history-repository'
import { historyRecordSchema, projectHistoryRecord } from './history-types'
import { createHistorySession } from './history-session'
import { historyFixture } from './history-fixture'

function memoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}

describe('history DTO privacy and consistency', () => {
  it('projects only whitelisted fields, including nested plan/result fields', () => {
    const fixture = historyFixture()
    const poisoned = { ...fixture, csv: 'RAW_CSV_SENTINEL', credentials: 'SECRET_SENTINEL',
      plan: { ...fixture.plan!, approvalToken: 'TOKEN_SENTINEL', headers: { key: 'SECRET_SENTINEL' }, spec: { ...fixture.plan!.spec, secret: 'SECRET_SENTINEL' } },
      result: { ...fixture.result!, headers: { key: 'SECRET_SENTINEL' }, values: { ...fixture.result!.values, rows: ['RAW_CSV_SENTINEL'] } },
      datasetSummary: { ...fixture.datasetSummary, rows: ['RAW_CSV_SENTINEL'] },
    }
    const projection = projectHistoryRecord(poisoned)
    const json = JSON.stringify(projection)
    assert.ok(!json.includes('SENTINEL'))
    const keys: string[] = []
    JSON.parse(json, (key, value) => { keys.push(key); return value })
    for (const forbidden of ['approvalToken', 'credentials', 'headers', 'rows', 'csv']) assert.ok(!keys.includes(forbidden), forbidden)
    assert.equal(projection.result?.values.total, 69_900)
  })
  it('rejects completed records without results or with inconsistent source metadata', () => {
    const record = historyFixture()
    for (const candidate of [
      { ...record, result: undefined }, { ...record, plan: undefined },
      { ...record, status: 'running' }, { ...record, mode: 'e2b' },
      { ...record, datasetSummary: { ...record.datasetSummary, rowCount: 2 } },
    ]) assert.equal(historyRecordSchema.safeParse(candidate).success, false)
  })
  it('rejects unexpected persisted credentials rather than silently accepting their schema', () => {
    assert.equal(historyRecordSchema.safeParse({ ...historyFixture(), credentials: { deepseek: 'fake' } }).success, false)
  })
})

describe('single history repository', () => {
  it('hydrates before writes, persists selection and recovers serialized reports', () => {
    const storage = memoryStorage()
    const first = createHistoryRepository(() => storage)
    assert.equal(first.insert(historyFixture()), true)
    const second = createHistoryRepository(() => storage)
    assert.equal(second.getSnapshot().loaded, false)
    assert.equal(second.insert(historyFixture('run-2')), true)
    assert.equal(second.getSnapshot().records.length, 2)
    assert.equal(second.select('run-1'), true)
    const restored = createHistoryRepository(() => storage)
    restored.initialize()
    assert.equal(restored.getSnapshot().selectedRunId, 'run-1')
    assert.equal(restored.getSnapshot().records[0].result?.values.total, 69_900)
    assert.ok(restored.getSnapshot().records[0].result?.report.includes('69900'))
  })
  it('updates one record, not duplicates, and notifies subscribers', () => {
    const storage = memoryStorage()
    const repo = createHistoryRepository(() => storage)
    let changes = 0
    const unsubscribe = repo.subscribe(() => changes++)
    repo.insert(historyFixture())
    repo.update({ ...historyFixture(), question: 'new question' })
    assert.equal(repo.getSnapshot().records.length, 1)
    assert.equal(repo.getSnapshot().records[0].question, 'new question')
    assert.ok(changes >= 2)
    unsubscribe()
    const count = changes
    repo.select(null)
    assert.equal(changes, count)
  })
  it('deletes without resurrecting a late update and clears only its own key', () => {
    const storage = memoryStorage()
    storage.setItem('other-app', 'keep')
    const repo = createHistoryRepository(() => storage)
    repo.insert(historyFixture())
    repo.insert(historyFixture('run-2'))
    repo.select('run-1')
    assert.equal(repo.remove('run-1'), true)
    assert.equal(repo.getSnapshot().selectedRunId, 'run-2')
    assert.equal(repo.update(historyFixture()), false)
    assert.equal(repo.getSnapshot().records.length, 1)
    assert.equal(repo.clear(), true)
    assert.equal(storage.getItem(HISTORY_KEY), null)
    assert.equal(storage.getItem('other-app'), 'keep')
  })
  it('refreshes external changes without writing or invoking any provider', () => {
    const storage = memoryStorage()
    const one = createHistoryRepository(() => storage)
    const two = createHistoryRepository(() => storage)
    two.initialize()
    one.insert(historyFixture())
    two.refresh()
    assert.equal(two.getSnapshot().records.length, 1)
    one.clear()
    two.refresh()
    assert.equal(two.getSnapshot().records.length, 0)
  })
  for (const raw of ['{broken', JSON.stringify({ version: 2, records: [], selectedRunId: null }), JSON.stringify({ version: 1, records: [{ wrong: true }], selectedRunId: null })]) {
    it('preserves corrupt or unknown history and blocks automatic overwrites', () => {
      const storage = memoryStorage()
      storage.setItem(HISTORY_KEY, raw)
      const repo = createHistoryRepository(() => storage)
      repo.initialize()
      assert.ok(repo.getSnapshot().warning)
      assert.equal(repo.insert(historyFixture()), false)
      assert.equal(storage.getItem(HISTORY_KEY), raw)
      assert.equal(repo.clear(), true)
      assert.equal(repo.insert(historyFixture()), true)
    })
  }
  it('does not evict old records when a 21st run exceeds the limit', () => {
    const storage = memoryStorage()
    const repo = createHistoryRepository(() => storage)
    for (let index = 0; index < 20; index++) assert.equal(repo.insert(historyFixture(`run-${index}`)), true)
    const before = storage.getItem(HISTORY_KEY)
    assert.equal(repo.insert(historyFixture('too-many')), false)
    assert.equal(storage.getItem(HISTORY_KEY), before)
    assert.equal(repo.getSnapshot().records.length, 20)
  })
  it('preserves the last snapshot on size and storage quota failures', () => {
    const storage = memoryStorage()
    const repo = createHistoryRepository(() => storage)
    repo.insert(historyFixture())
    const before = storage.getItem(HISTORY_KEY)
    const large = historyFixture()
    large.result!.report = 'X'.repeat(2 * 1024 * 1024)
    assert.equal(repo.update(large), false)
    assert.equal(storage.getItem(HISTORY_KEY), before)
    storage.setItem = () => { throw new Error('quota') }
    assert.equal(repo.update({ ...historyFixture(), question: 'changed' }), false)
    assert.equal(repo.getSnapshot().records[0].question, historyFixture().question)
    assert.ok(repo.getSnapshot().warning)
  })
  it('handles unavailable storage without crashing the analysis caller', () => {
    const repo = createHistoryRepository(() => { throw new Error('denied') })
    assert.doesNotThrow(() => repo.initialize())
    assert.equal(repo.insert(historyFixture()), false)
    assert.equal(repo.clear(), false)
    assert.ok(repo.getSnapshot().warning)
  })
})

describe('per-run lifecycle recording', () => {
  it('preserves one ID through planning, approval and clean completion without tokens', () => {
    const storage = memoryStorage()
    const repo = createHistoryRepository(() => storage)
    const session = createHistorySession(repo)
    const fixture = historyFixture()
    session.start({ question: fixture.question, mode: fixture.mode, datasetSummary: fixture.datasetSummary })
    session.update({ status: 'pending', plan: { ...fixture.plan!, approvalToken: 'NEVER_SAVE_THIS' } } as Parameters<typeof session.update>[0])
    assert.equal(repo.getSnapshot().records[0].status, 'pending')
    assert.equal(repo.getSnapshot().records[0].result, undefined)
    session.update({ status: 'running' })
    session.append({ tone: 'success', message: 'done', timestamp: '2026-11-19T03:00:00.000Z' })
    session.update({ status: 'completed', result: fixture.result })
    assert.equal(repo.getSnapshot().records.length, 1)
    assert.equal(repo.getSnapshot().records[0].result?.values.total, 69_900)
    assert.ok(!storage.getItem(HISTORY_KEY)!.includes('NEVER_SAVE_THIS'))
  })
  it('keeps a successful in-memory analysis separate from a failed historical save', () => {
    const storage = memoryStorage()
    const repo = createHistoryRepository(() => storage)
    const session = createHistorySession(repo)
    const fixture = historyFixture()
    session.start({ question: fixture.question, mode: 'demo', datasetSummary: fixture.datasetSummary })
    session.update({ status: 'pending', plan: fixture.plan })
    storage.setItem = () => { throw new Error('quota') }
    session.update({ status: 'completed', result: fixture.result })
    assert.ok(session.getWarning())
    assert.equal(fixture.result?.values.total, 69_900)
    assert.equal(repo.getSnapshot().records[0].status, 'pending')
  })
  it('leaves the saved running stage untouched on recovery and can receive a later completion', () => {
    const storage = memoryStorage()
    const repo = createHistoryRepository(() => storage)
    const session = createHistorySession(repo)
    const fixture = historyFixture()
    session.start({ question: fixture.question, mode: 'demo', datasetSummary: fixture.datasetSummary })
    session.update({ status: 'pending', plan: fixture.plan })
    session.append({ tone: 'running', phase: 'analysis', message: 'started', timestamp: fixture.createdAt }, {
      status: 'running', phases: { analysis: 'running' },
    })
    const before = storage.getItem(HISTORY_KEY)
    const restored = createHistoryRepository(() => storage)
    restored.initialize()
    assert.equal(restored.getSnapshot().records[0].status, 'running')
    assert.equal(restored.getSnapshot().records[0].result, undefined)
    assert.equal(storage.getItem(HISTORY_KEY), before)
    session.update({ status: 'completed', result: fixture.result, phases: { analysis: 'completed' } })
    restored.refresh()
    assert.equal(restored.getSnapshot().records[0].status, 'completed')
  })
})
