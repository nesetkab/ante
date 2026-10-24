import { CornerUpLeft, Volume2, VolumeX, X, Shapes, StickyNote } from 'lucide-react'
import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Id, Tab, TabRuntime } from '@shared/schema'
import { internalPage } from '@shared/pages'
import { displayTitle, getTab } from '@shared/state/tree'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { useAppState } from '../store'
import { onUiEvent } from '../uiEvents'
import { selectActiveId } from './selectors'
import { useDragSource } from './drag'
import { dropRow } from './dropTargets'
import styles from './Sidebar.module.css'

interface TabRowProps {
  id: Id
  depth: number
  persistent: boolean
  feed?: boolean
  compact?: boolean
}

export const TabRow = memo(function TabRow({
  id,
  depth,
  persistent,
  feed = false,
  compact = false,
}: TabRowProps) {
  const tab = useAppState((state) => getTab(state.data, id))
  const runtime = useAppState((state) => state.runtime.tabs[id])
  const active = useAppState((state) => selectActiveId(state) === id)
  if (!tab) return null
  return (
    <TabRowView
      tab={tab}
      runtime={runtime}
      active={active}
      depth={depth}
      persistent={persistent}
      unread={feed && tab.lastActiveAt === 0}
      compact={compact}
    />
  )
})

interface TabRowViewProps {
  tab: Tab
  runtime: TabRuntime | undefined
  active: boolean
  depth: number
  persistent: boolean
  unread: boolean
  compact: boolean
}

function TabRowView({ tab, runtime, active, depth, persistent, unread, compact }: TabRowViewProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const title = displayTitle(tab)
  const drifted = persistent && tab.savedUrl !== null && tab.savedUrl !== tab.url
  const page = internalPage(tab.url)
  const unloaded = persistent && !runtime && !page
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id: tab.id, variant: 'row' })

  useEffect(
    () =>
      onUiEvent((event) => {
        if (event.type === 'rename' && event.id === tab.id) setEditing(true)
      }),
    [tab.id],
  )

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = (value: string) => {
    setEditing(false)
    ante.dispatch({ type: 'tab/rename', id: tab.id, title: value === tab.title ? null : value })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') commitRename(event.currentTarget.value)
    if (event.key === 'Escape') setEditing(false)
  }

  const onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) ante.command({ type: 'tab/close', tabId: tab.id })
  }

  const stop = (event: MouseEvent) => event.stopPropagation()

  return (
    <div
      role="button"
      tabIndex={-1}
      className={[
        styles.row,
        active && styles.active,
        unloaded && styles.unloaded,
        compact && styles.compact,
        dragging && styles.dragging,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: 10 + depth * 14 }}
      {...dropRow(tab.id, depth)}
      onPointerDown={editing ? undefined : onPointerDown}
      onClick={() => {
        if (!editing) ante.command({ type: 'tab/activate', tabId: tab.id })
      }}
      onAuxClick={onAuxClick}
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) return
        setEditing(true)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        ante.command({ type: 'tab/contextMenu', tabId: tab.id })
      }}
      title={tab.url}
    >
      {drifted ? (
        <button
          type="button"
          className={styles.resetButton}
          data-no-drag
          title="Back to pinned page"
          onMouseDown={stop}
          onClick={(event) => {
            event.stopPropagation()
            ante.command({ type: 'tab/resetToSaved', tabId: tab.id })
          }}
        >
          <span className={styles.resetFavicon}>
            <Favicon src={tab.favicon} pageUrl={tab.url} loading={runtime?.loading} />
          </span>
          <CornerUpLeft className={styles.resetIcon} size={14} />
        </button>
      ) : page?.kind === 'note' ? (
        <StickyNote size={15} className={styles.noteIcon} />
      ) : page?.kind === 'easel' ? (
        <Shapes size={15} className={styles.noteIcon} />
      ) : (
        <Favicon src={tab.favicon} pageUrl={tab.url} loading={runtime?.loading} />
      )}
      {editing ? (
        <input
          ref={inputRef}
          className={styles.renameInput}
          defaultValue={title}
          onBlur={(event) => commitRename(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          onMouseDown={stop}
        />
      ) : (
        <span className={styles.title}>
          {drifted && <span className={styles.divider}>/</span>}
          {title || 'New Tab'}
        </span>
      )}
      {unread && <span className={styles.unreadDot} aria-label="Unread" />}
      {runtime?.audible || runtime?.muted ? (
        <IconButton
          size="sm"
          label={runtime.muted ? 'Unmute tab' : 'Mute tab'}
          data-no-drag
          onMouseDown={stop}
          onClick={(event) => {
            event.stopPropagation()
            ante.command({ type: 'tab/toggleMute', tabId: tab.id })
          }}
        >
          {runtime.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </IconButton>
      ) : null}
      {!compact && (
        <IconButton
          size="sm"
          label={persistent ? 'Unload tab' : 'Close tab'}
          className={styles.close}
          data-no-drag
          onMouseDown={stop}
          onClick={(event) => {
            event.stopPropagation()
            ante.command({ type: 'tab/close', tabId: tab.id })
          }}
        >
          {persistent ? <span className={styles.unloadGlyph} /> : <X size={13} />}
        </IconButton>
      )}
    </div>
  )
}
