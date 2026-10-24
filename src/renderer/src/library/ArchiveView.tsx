import { Archive, ArchiveRestore, X } from 'lucide-react'
import { useMemo } from 'react'
import { groupByDay } from '@shared/history'
import { displayUrl, hostOf } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { useAppState } from '../store'
import { dayLabel, timeLabel } from './format'
import styles from './Library.module.css'
import { rowProps } from './rowProps'
import { useConfirm } from './useConfirm'

export function ArchiveView({ query }: { query: string }) {
  const archive = useAppState((state) => state.data.archive)
  const spaces = useAppState((state) => state.data.spaces)
  const [confirming, clear] = useConfirm(() => ante.dispatch({ type: 'archive/clear' }))

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? archive.filter(
          (entry) =>
            entry.title.toLowerCase().includes(needle) || entry.url.toLowerCase().includes(needle),
        )
      : archive
    return [...matches].sort((a, b) => b.archivedAt - a.archivedAt)
  }, [archive, query])

  if (visible.length === 0) {
    return (
      <div className={styles.empty}>
        <Archive size={22} strokeWidth={1.75} />
        <span>{query ? 'No matching tabs' : 'Tabs archived from Today will show up here'}</span>
      </div>
    )
  }

  return (
    <>
      {!query && (
        <div className={styles.toolbar}>
          <span>
            {archive.length} archived {archive.length === 1 ? 'tab' : 'tabs'}
          </span>
          <button
            type="button"
            className={[styles.textButton, confirming && styles.danger].filter(Boolean).join(' ')}
            onClick={clear}
          >
            {confirming ? 'Click again to clear archive' : 'Clear archive'}
          </button>
        </div>
      )}
      {groupByDay(visible, (entry) => entry.archivedAt).map((group) => (
        <section key={group.day} className={styles.group}>
          <h3 className={styles.groupTitle}>{dayLabel(group.day)}</h3>
          {group.items.map((entry) => {
            const space = spaces[entry.spaceId]
            return (
              <div
                key={entry.id}
                className={styles.row}
                title={`Restore ${entry.url}`}
                {...rowProps(() => ante.command({ type: 'archive/restore', id: entry.id }))}
              >
                <span className={styles.time}>{timeLabel(entry.archivedAt)}</span>
                <Favicon src={entry.favicon} size={16} />
                <span className={styles.title}>{entry.title || displayUrl(entry.url)}</span>
                <span className={styles.meta}>
                  {space && (
                    <span className={styles.spaceTag}>
                      <span className={styles.spaceSwatch} style={{ background: space.color }} />
                      {space.name}
                    </span>
                  )}
                  {hostOf(entry.url)}
                </span>
                <span className={styles.rowActions}>
                  <IconButton
                    label="Restore tab"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      ante.command({ type: 'archive/restore', id: entry.id })
                    }}
                  >
                    <ArchiveRestore size={13} />
                  </IconButton>
                  <IconButton
                    label="Remove from archive"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      ante.dispatch({ type: 'archive/remove', id: entry.id })
                    }}
                  >
                    <X size={13} />
                  </IconButton>
                </span>
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}
