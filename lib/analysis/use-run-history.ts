'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { HISTORY_KEY, historyRepository } from './history-repository'

export function useRunHistory() {
  const snapshot = useSyncExternalStore(
    historyRepository.subscribe, historyRepository.getSnapshot, historyRepository.getServerSnapshot,
  )
  const [open, setOpen] = useState(false)
  const [viewedId, setViewedId] = useState<string | null>(null)
  const restored = useRef(false)

  useEffect(() => {
    historyRepository.refresh()
    if (!restored.current) {
      restored.current = true
      const { selectedRunId } = historyRepository.getSnapshot()
      if (selectedRunId) {
        setViewedId(selectedRunId)
        setOpen(true)
      }
    }
    function sync(event: StorageEvent) {
      if (event.key === HISTORY_KEY || event.key === null) historyRepository.refresh()
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const record = snapshot.records.find(({ id }) => id === viewedId) ?? snapshot.records[0] ?? null

  function select(id: string) {
    setViewedId(id)
    historyRepository.select(id)
  }

  function show() {
    const { selectedRunId, records } = historyRepository.getSnapshot()
    const selected = selectedRunId ?? records[0]?.id
    if (selected) select(selected)
    setOpen(true)
  }

  function close() {
    setOpen(false)
  }

  function remove(id: string) {
    if (historyRepository.remove(id) && record?.id === id) {
      const remaining = historyRepository.getSnapshot().records
      const next = remaining[0]
      if (next) select(next.id)
      else close()
    }
  }

  function clear() {
    if (historyRepository.clear()) close()
  }

  return { snapshot, record, open, show, close, select, remove, clear }
}
