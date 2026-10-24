import { ChevronRight, Folder as FolderIcon, FolderOpen, Rss } from 'lucide-react'
import type { Data, Folder, Id, Runtime, Split } from '@shared/schema'
import { getTab } from '@shared/state/tree'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { RenameInput, useRenameEvent } from '../components/RenameInput'
import styles from './Sidebar.module.css'
import { TabRow } from './TabRow'
import { useDragSource } from './drag'
import { dropRow } from './dropTargets'

interface ListContext {
  data: Data
  runtime: Runtime
  activeId: Id | null
  persistent: boolean
}

interface ItemListProps extends ListContext {
  ids: readonly Id[]
  depth?: number
}

function FolderRow({ folder, depth, ...context }: ListContext & { folder: Folder; depth: number }) {
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id: folder.id, variant: 'row' })
  const [editing, setEditing] = useRenameEvent(folder.id)
  const unread = folder.feedUrl
    ? folder.children.filter((id) => getTab(context.data, id)?.lastActiveAt === 0).length
    : 0
  return (
    <div className={styles.folder}>
      <div
        role="button"
        tabIndex={-1}
        className={[styles.row, dragging && styles.dragging].filter(Boolean).join(' ')}
        style={{ paddingLeft: 10 + depth * 14 }}
        {...dropRow(folder.id, depth)}
        onPointerDown={editing ? undefined : onPointerDown}
        onClick={() => ante.dispatch({ type: 'folder/toggle', id: folder.id })}
        onDoubleClick={() => setEditing(true)}
        onContextMenu={(event) => {
          event.preventDefault()
          ante.command({ type: 'tab/contextMenu', tabId: folder.id })
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
              if (name) ante.dispatch({ type: 'folder/rename', id: folder.id, name })
            }}
          />
        ) : (
          <span className={styles.title}>{folder.name || 'Untitled'}</span>
        )}
        {unread > 0 && <span className={styles.unreadCount}>{unread}</span>}
      </div>
      {folder.open && <ItemList {...context} ids={folder.children} depth={depth + 1} />}
    </div>
  )
}

function SplitRow({
  split,
  depth,
  data,
  runtime,
  activeId,
}: ListContext & { split: Split; depth: number }) {
  const tabs = split.children.map((id) => getTab(data, id)).filter((tab) => tab !== null)
  const containsActive = activeId !== null && split.children.includes(activeId)
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id: split.id, variant: 'row' })
  return (
    <div
      className={[styles.splitRow, containsActive && styles.active, dragging && styles.dragging]
        .filter(Boolean)
        .join(' ')}
      style={{ marginLeft: depth * 14 }}
      {...dropRow(split.id, depth)}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => {
        event.preventDefault()
        ante.command({ type: 'tab/contextMenu', tabId: split.id })
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={[styles.splitPane, tab.id === activeId && styles.splitPaneActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => ante.command({ type: 'tab/activate', tabId: tab.id })}
          title={tab.title || tab.url}
        >
          <Favicon
            src={tab.favicon}
            pageUrl={tab.url}
            loading={runtime.tabs[tab.id]?.loading}
            size={14}
          />
          <span className={styles.title}>{tab.customTitle ?? (tab.title || tab.url)}</span>
        </button>
      ))}
    </div>
  )
}

export function ItemList({ ids, depth = 0, ...context }: ItemListProps) {
  return (
    <>
      {ids.map((id) => {
        const item = context.data.items[id]
        if (!item) return null
        switch (item.kind) {
          case 'tab':
            return (
              <TabRow
                key={id}
                tab={item}
                runtime={context.runtime.tabs[id]}
                active={id === context.activeId}
                depth={depth}
                persistent={context.persistent}
              />
            )
          case 'folder':
            return <FolderRow key={id} folder={item} depth={depth} {...context} />
          case 'split':
            return <SplitRow key={id} split={item} depth={depth} {...context} />
        }
      })}
    </>
  )
}
