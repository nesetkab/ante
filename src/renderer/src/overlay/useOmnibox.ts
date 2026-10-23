import { useEffect, useState } from 'react'
import type { HistoryEntry } from '@shared/history'
import { library } from '../libraryApi'

const SUGGEST_DEBOUNCE_MS = 120
const HISTORY_LIMIT = 12

interface HistoryState {
  query: string
  entries: HistoryEntry[]
  completion: string | null
}

const related = (current: string, previous: string) => {
  const a = current.trim().toLowerCase()
  const b = previous.trim().toLowerCase()
  return a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a))
}

export function useHistorySearch(query: string): HistoryState {
  const [state, setState] = useState<HistoryState>({ query: '', entries: [], completion: null })
  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    library
      .searchHistory({ query, limit: HISTORY_LIMIT })
      .then((result) => {
        if (!cancelled) setState({ query, ...result })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [query])
  return related(query, state.query) ? state : { query, entries: [], completion: null }
}

export function useSuggestions(query: string, enabled: boolean): string[] {
  const [state, setState] = useState<{ query: string; items: string[] }>({ query: '', items: [] })
  useEffect(() => {
    const text = query.trim()
    if (!enabled || !text) return
    let cancelled = false
    const timer = setTimeout(() => {
      library
        .suggest(text)
        .then((items) => {
          if (!cancelled) setState({ query: text, items })
        })
        .catch(() => undefined)
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, enabled])
  return enabled && related(query, state.query) ? state.items : []
}

export function extendsInput(completion: string | null, typed: string): completion is string {
  return (
    completion !== null &&
    completion.length > typed.length &&
    completion.toLowerCase().startsWith(typed.toLowerCase())
  )
}
