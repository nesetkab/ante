import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LibrarySection } from '@shared/schema'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { ArchiveView } from './ArchiveView'
import { DownloadsView } from './DownloadsView'
import { HistoryView } from './HistoryView'
import styles from './Library.module.css'

const sections: { id: LibrarySection; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'archive', label: 'Archive' },
  { id: 'downloads', label: 'Downloads' },
]

const placeholders: Record<LibrarySection, string> = {
  history: 'Search history',
  archive: 'Search archived tabs',
  downloads: '',
}

export function LibraryPanel({ section }: { section: LibrarySection }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchable = section !== 'downloads'

  useEffect(() => {
    if (searchable) searchRef.current?.focus()
    else panelRef.current?.focus()
  }, [section, searchable])

  return (
    <div ref={panelRef} className={styles.panel} tabIndex={-1}>
      <header className={styles.header}>
        <div className={styles.tabs} role="tablist">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === section}
              className={[styles.tab, id === section && styles.tabActive].filter(Boolean).join(' ')}
              onClick={() => {
                if (id !== section) ante.command({ type: 'library/open', section: id })
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.headerSpacer} />
        {searchable && (
          <label className={styles.search}>
            <Search size={14} />
            <input
              ref={searchRef}
              value={query}
              placeholder={placeholders[section]}
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
        <IconButton label="Close library" onClick={() => ante.command({ type: 'overlay/close' })}>
          <X size={16} />
        </IconButton>
      </header>
      <div className={styles.body}>
        <div className={styles.column}>
          {section === 'history' && <HistoryView query={query} />}
          {section === 'archive' && <ArchiveView query={query} />}
          {section === 'downloads' && <DownloadsView />}
        </div>
      </div>
    </div>
  )
}
