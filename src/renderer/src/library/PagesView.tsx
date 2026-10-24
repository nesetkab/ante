import { Shapes, StickyNote, Trash2 } from 'lucide-react'
import { groupByDay } from '@shared/history'
import { libraryPages, type LibraryPage } from '@shared/pages'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppSelector } from '../store'
import { dayLabel, timeLabel } from './format'
import styles from './Library.module.css'
import { useConfirm } from './useConfirm'

const samePages = (a: LibraryPage[], b: LibraryPage[]) => JSON.stringify(a) === JSON.stringify(b)

function PageRow({ page }: { page: LibraryPage }) {
  const [confirming, remove] = useConfirm(() =>
    ante.command({ type: 'page/delete', kind: page.kind, id: page.id }),
  )
  return (
    <div
      className={styles.row}
      onClick={() => ante.command({ type: 'page/open', kind: page.kind, id: page.id })}
    >
      <span className={styles.time}>{timeLabel(page.updatedAt)}</span>
      {page.kind === 'note' ? <StickyNote size={16} /> : <Shapes size={16} />}
      <button type="button" className={styles.title}>
        {page.title}
      </button>
      <span className={styles.meta}>{page.detail}</span>
      <span
        className={[styles.rowActions, confirming && styles.rowActionsVisible]
          .filter(Boolean)
          .join(' ')}
      >
        <IconButton
          label={confirming ? 'Click again to delete' : `Delete ${page.kind}`}
          size="sm"
          className={confirming ? styles.danger : undefined}
          onClick={(event) => {
            event.stopPropagation()
            remove()
          }}
        >
          <Trash2 size={13} />
        </IconButton>
      </span>
    </div>
  )
}

export function PagesView({ query }: { query: string }) {
  const pages = useAppSelector((state) => libraryPages(state.data, query), samePages)

  if (pages.length === 0) {
    return (
      <div className={styles.empty}>
        <StickyNote size={22} strokeWidth={1.75} />
        <span>
          {query ? 'No matching notes or easels' : 'Notes and easels you make show up here'}
        </span>
      </div>
    )
  }

  return (
    <>
      {groupByDay(pages, (page) => page.updatedAt).map((group) => (
        <section key={group.day} className={styles.group}>
          <h3 className={styles.groupTitle}>{dayLabel(group.day)}</h3>
          {group.items.map((page) => (
            <PageRow key={`${page.kind}:${page.id}`} page={page} />
          ))}
        </section>
      ))}
    </>
  )
}
