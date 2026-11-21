import { z } from 'zod'
import { historyRecordSchema, projectHistoryRecord, type AnalysisRunRecord } from './history-types'

export const HISTORY_KEY = 'insightpilot.history.v1'
export const HISTORY_LIMIT = 20
const MAX_BYTES = 2 * 1024 * 1024
const encoder = new TextEncoder()
const storeSchema = z.object({
  version: z.literal(1),
  selectedRunId: z.string().nullable(),
  records: z.array(historyRecordSchema).max(HISTORY_LIMIT),
}).strict().refine(({ records, selectedRunId }) =>
  new Set(records.map(({ id }) => id)).size === records.length &&
  (selectedRunId === null || records.some(({ id }) => id === selectedRunId)))

type Store = z.infer<typeof storeSchema>
type Snapshot = Store & { loaded: boolean; warning: string; canClear: boolean }
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const empty: Store = { version: 1, selectedRunId: null, records: [] }
const initial: Snapshot = { ...empty, loaded: false, warning: '', canClear: false }
const unavailable = '浏览器无法访问本地历史。当前分析仍可使用。'
const unreadable = '本地历史无法读取（数据损坏、超限或版本不支持）。原内容已保留，可手动清空后重新保存。'
const saveFailed = '本地历史写入失败。已保存的内容保持原样，请检查浏览器存储设置或删除旧记录。'
const recordLimit = '本地历史已达到容量上限。请先删除旧记录。'

function sorted(records: AnalysisRunRecord[]) {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function createHistoryRepository(getStorage: () => HistoryStorage) {
  let snapshot = initial
  let cached: { raw: string | null; data: Store | null } | undefined
  const listeners = new Set<() => void>()

  function publish(data: Store, warning = '', canClear = data.records.length > 0) {
    if (snapshot.loaded && snapshot.records === data.records && snapshot.selectedRunId === data.selectedRunId &&
      snapshot.warning === warning && snapshot.canClear === canClear) return
    snapshot = { ...data, loaded: true, warning, canClear }
    listeners.forEach((listener) => listener())
  }

  function read(storage: HistoryStorage) {
    const raw = storage.getItem(HISTORY_KEY)
    if (cached?.raw === raw) return cached.data
    let data: Store | null = null
    if (raw === null) data = empty
    else if (raw.length <= MAX_BYTES && encoder.encode(raw).length <= MAX_BYTES) {
      try {
        const parsed = storeSchema.safeParse(JSON.parse(raw))
        if (parsed.success) data = { ...parsed.data, records: sorted(parsed.data.records) }
      } catch { /* keep the original value until explicitly cleared */ }
    }
    cached = { raw, data }
    return data
  }

  function refresh() {
    try {
      const data = read(getStorage())
      if (data) publish(data)
      else publish(empty, unreadable, true)
    } catch { publish(empty, unavailable, false) }
  }

  function mutate(change: (data: Store) => Store | false) {
    let storage: HistoryStorage
    let data: Store | null
    try {
      storage = getStorage()
      data = read(storage)
    } catch { publish(empty, unavailable, false); return false }
    if (!data) { publish(empty, unreadable, true); return false }
    try {
      const next = change(data)
      if (!next) { publish(data); return false }
      if (next.records.length > HISTORY_LIMIT) { publish(data, recordLimit); return false }
      const raw = JSON.stringify(next)
      if (encoder.encode(raw).length > MAX_BYTES) { publish(data, recordLimit); return false }
      if (next !== data) storage.setItem(HISTORY_KEY, raw)
      cached = { raw: next === data ? cached!.raw : raw, data: next }
      publish(next)
      return true
    } catch { publish(data, saveFailed); return false }
  }

  function save(record: AnalysisRunRecord, inserting: boolean) {
    return mutate((data) => {
      const exists = data.records.some(({ id }) => id === record.id)
      if (exists === inserting) return false
      const parsed = historyRecordSchema.parse(projectHistoryRecord(record))
      return {
        ...data,
        selectedRunId: inserting ? parsed.id : data.selectedRunId,
        records: sorted([parsed, ...data.records.filter(({ id }) => id !== parsed.id)]),
      }
    })
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    initialize: () => { if (!snapshot.loaded) refresh() },
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    insert: (record: AnalysisRunRecord) => save(record, true),
    update: (record: AnalysisRunRecord) => save(record, false),
    select: (id: string | null) => mutate((data) => {
      if (id !== null && !data.records.some((record) => record.id === id)) return false
      return id === data.selectedRunId ? data : { ...data, selectedRunId: id }
    }),
    remove: (id: string) => mutate((data) => {
      const records = data.records.filter((record) => record.id !== id)
      if (records.length === data.records.length) return false
      return { ...data, records, selectedRunId: data.selectedRunId === id ? records[0]?.id ?? null : data.selectedRunId }
    }),
    clear() {
      try {
        getStorage().removeItem(HISTORY_KEY)
        cached = { raw: null, data: empty }
        publish(empty)
        return true
      } catch {
        // Keep the last readable state when the browser rejects deletion.
        publish(snapshot, '浏览器未能清空本地历史。', snapshot.canClear)
        return false
      }
    },
  }
}

export const historyRepository = createHistoryRepository(() => window.localStorage)
