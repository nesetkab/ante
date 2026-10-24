import { ChevronRight, Folder as FolderIcon, FolderOpen, Rss } from 'lucide-react'
import { memo } from 'react'
import type { Id } from '@shared/schema'
import { displayTitle, getTab } from '@shared/state/tree'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { RenameInput, useRenameEvent } from '../components/RenameInput'
import { useAppSelector, useAppState } from '../store'
import styles from './Sidebar.module.css'
import { TabRow } from './TabRow'
import { useDragSource } from './drag'
import { dropRow } from './dropTargets'
import { selectActiveId } from './selectors'

interface RowProps {
  id: Id
  depth: number
  persistent: boolean
  feed: boolean
}

const FolderRow = memo(function FolderRow({ id, depth, persistent }: Omit<RowProps, 'feed'>) {
  const folder = useAppState((state) => {
    const item = state.data.items[id]
    return item?.kind === 'folder' ? item : null
  })
  const unread = useAppState((state) => {
    const item = state.data.items[id]
    if (item?.kind !== 'folder' || !item.feedUrl) return 0
    return item.children.filter((child) => getTab(state.data, child)?.lastActiveAt === 0).length
  })
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id, variant: 'row' })
  const [editing, setEditing] = useRenameEvent(id)
  if (!folder) return null

  return (
    <div className={styles.folder}>
      <div
        role="button"
        tabIndex={-1}
        className={[styles.row, dragging && styles.dragging].filter(Boolean).join(' ')}
        style={{ paddingLeft: 10 + depth * 14 }}
        {...dropRow(id, depth)}
        onPointerDown={editing ? undefined : onPointerDown}
        onClick={() => ante.dispatch({ type: 'folder/toggle', id })}
        onDoubleClick={() => setEditing(true)}
        onContextMenu={(event) => {
          event.preventDefault()
          ante.command({ type: 'tab/contextMenu', tabId: id })
        }}
      >
        <ChevronRight
          size={12}
          className={[styles.chevron, folder.open && styles.chevronOpen].filter(Boolean).join(' ')}
        />
        {folder.feedUrl ? (
          <Rss size={14} className={styles.folderIcon} />
        ) : folder.open ? (
          <FolderOpen size={15} className={styles.folderIcon} />
        ) : (
          <FolderIcon size={15} className={styles.folderIcon} />
        )}
        {editing ? (
          <RenameInput
            className={styles.renameInput}
            value={folder.name}
            onCancel={() => setEditing(false)}
            onCommit={(name) => {
              setEditing(false)
              if (name) ante.dispatch({ type: 'folder/rename', id, name })
            }}
          />
        ) : (
          <span className={styles.title}>{folder.name || 'Untitled'}</span>
        )}
        {unread > 0 && <span className={styles.unreadCount}>{unread}</span>}
      </div>
      {folder.open && (
        <ItemList
          ids={folder.children}
          depth={depth + 1}
          persistent={persistent}
          feed={folder.feedUrl !== null}
        />
      )}
    </div>
  )
})

const SplitPane = memo(function SplitPane({ id }: { id: Id }) {
  const tab = useAppState((state) => getTab(state.data, id))
  const loading = useAppState((state) => state.runtime.tabs[id]?.loading ?? false)
  const active = useAppState((state) => selectActiveId(state) === id)
  if (!tab) return null
  return (
    <button
      type="button"
      className={[styles.splitPane, active && styles.splitPaneActive].filter(Boolean).join(' ')}
      onClick={() => ante.command({ type: 'tab/activate', tabId: id })}
      title={tab.title || tab.url}
    >
      <Favicon src={tab.favicon} pageUrl={tab.url} loading={loading} size={14} />
      <span className={styles.title}>{displayTitle(tab)}</span>
    </button>
  )
})

const NO_CHILDREN: readonly Id[] = []

const SplitRow = memo(function SplitRow({ id, depth }: Pick<RowProps, 'id' | 'depth'>) {
  const children = useAppSelector((state) => {
    const item = state.data.items[id]
    return item?.kind === 'split' ? item.children : NO_CHILDREN
  })
  const containsActive = useAppState((state) => {
    const active = selectActiveId(state)
    return active !== null && children.includes(active)
  })
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id, variant: 'row' })
  if (children.length === 0) return null
  return (
    <div
      className={[styles.splitRow, containsActive && styles.active, dragging && styles.dragging]
        .filter(Boolean)
        .join(' ')}
      style={{ marginLeft: depth * 14 }}
      {...dropRow(id, depth)}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => {
        event.preventDefault()
        ante.command({ type: 'tab/contextMenu', tabId: id })
      }}
    >
      {children.map((child) => (
        <SplitPane key={child} id={child} />
      ))}
    </div>
  )
})

const ItemRow = memo(function ItemRow({ id, depth, persistent, feed }: RowProps) {
  const kind = useAppState((state) => state.data.items[id]?.kind ?? null)
  switch (kind) {
    case 'tab':
      return <TabRow id={id} depth={depth} persistent={persistent} feed={feed} />
    case 'folder':
      return <FolderRow id={id} depth={depth} persistent={persistent} />
    case 'split':
      return <SplitRow id={id} depth={depth} />
    case null:
      return null
  }
})

interface ItemListProps {
  ids: readonly Id[]
  depth?: number
  persistent: boolean
  feed?: boolean
}

export const ItemList = memo(function ItemList({
  ids,
  depth = 0,
  persistent,
  feed = false,
}: ItemListProps) {
  return (
    <>
      {ids.map((id) => (
        <ItemRow key={id} id={id} depth={depth} persistent={persistent} feed={feed} />
      ))}
    </>
  )
})
