import { History, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { groupByDay, type HistoryEntry } from '@shared/history'
import { displayUrl, hostOf } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { library } from '../libraryApi'
import { dayLabel, timeLabel } from './format'
import styles from './Library.module.css'
import { useConfirm } from './useConfirm'

const PAGE = 150
const SEARCH_DEBOUNCE_MS = 120

export function openFromLibrary(url: string, event: MouseEvent) {
  const background = event.metaKey || event.ctrlKey
  ante.command({ type: 'open', input: url, disposition: background ? 'background' : 'newTab' })
}

export function HistoryView({ query }: { query: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [complete, setComplete] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const loadingMore = useRef(false)
  const generation = useRef(0)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    generation.current += 1
    const timer = setTimeout(
      () => {
        library
          .searchHistory({ query, limit: PAGE, order: 'recent' })
          .then((result) => {
            if (cancelled) return
            setEntries(result.entries)
            setComplete(result.entries.length < PAGE)
            setLoaded(true)
          })
          .catch(() => undefined)
      },
      query ? SEARCH_DEBOUNCE_MS : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const loadMore = useCallback(() => {
    const last = entries.at(-1)
    if (complete || loadingMore.current || !last) return
    loadingMore.current = true
    const requested = generation.current
    library
      .searchHistory({ query, limit: PAGE, order: 'recent', before: last.lastVisit })
      .then((result) => {
        if (requested !== generation.current) return
        setEntries((current) => [...current, ...result.entries])
        setComplete(result.entries.length < PAGE)
      })
      .catch(() => undefined)
      .finally(() => {
        loadingMore.current = false
      })
  }, [entries, complete, query])

  useEffect(() => {
    const target = sentinel.current
    if (!target) return
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) loadMore()
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [loadMore])

  const remove = (id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id))
    void library.deleteHistory([id])
  }

  const [confirming, clear] = useConfirm(() => {
    setEntries([])
    setComplete(true)
    void library.clearHistory()
  })

  if (loaded && entries.length === 0) {
    return (
      <div className={styles.empty}>
        <History size={22} strokeWidth={1.75} />
        <span>{query ? 'No matching pages' : 'Pages you visit will show up here'}</span>
      </div>
    )
  }

  return (
    <>
      {!query && entries.length > 0 && (
        <div className={styles.toolbar}>
          <span>Recently visited</span>
          <button
            type="button"
            className={[styles.textButton, confirming && styles.danger].filter(Boolean).join(' ')}
            onClick={clear}
          >
            {confirming ? 'Click again to clear all history' : 'Clear history'}
          </button>
        </div>
      )}
      {groupByDay(entries, (entry) => entry.lastVisit).map((group) => (
        <section key={group.day} className={styles.group}>
          <h3 className={styles.groupTitle}>{dayLabel(group.day)}</h3>
          {group.items.map((entry) => (
            <div
              key={entry.id}
              className={styles.row}
              title={entry.url}
              onClick={(event) => openFromLibrary(entry.url, event)}
            >
              <span className={styles.time}>{timeLabel(entry.lastVisit)}</span>
              <Favicon src={entry.favicon} size={16} />
              <span className={styles.title}>{entry.title || displayUrl(entry.url)}</span>
              <span className={styles.meta}>{hostOf(entry.url)}</span>
              <span className={styles.rowActions}>
                <IconButton
                  label="Remove from history"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    remove(entry.id)
                  }}
                >
                  <X size={13} />
                </IconButton>
              </span>
            </div>
          ))}
        </section>
      ))}
      <div ref={sentinel} className={styles.sentinel} />
    </>
  )
}
