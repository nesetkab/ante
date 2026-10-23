import { CornerUpLeft, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Tab, TabRuntime } from '@shared/schema'
import { displayTitle } from '@shared/state/tree'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { onUiEvent } from '../uiEvents'
import styles from './Sidebar.module.css'

interface TabRowProps {
  tab: Tab
  runtime: TabRuntime | undefined
  active: boolean
  depth: number
  persistent: boolean
  compact?: boolean
}

export function TabRow({ tab, runtime, active, depth, persistent, compact = false }: TabRowProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const title = displayTitle(tab)
  const drifted = persistent && tab.savedUrl !== null && tab.savedUrl !== tab.url
  const unloaded = persistent && !runtime

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
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: 10 + depth * 14 }}
      onMouseDown={(event) => {
        if (event.button === 0 && !editing) ante.command({ type: 'tab/activate', tabId: tab.id })
      }}
      onAuxClick={onAuxClick}
      onDoubleClick={() => setEditing(true)}
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
          title="Back to pinned page"
          onMouseDown={stop}
          onClick={(event) => {
            event.stopPropagation()
            ante.command({ type: 'tab/resetToSaved', tabId: tab.id })
          }}
        >
          <span className={styles.resetFavicon}>
            <Favicon src={tab.favicon} loading={runtime?.loading} />
          </span>
          <CornerUpLeft className={styles.resetIcon} size={14} />
        </button>
      ) : (
        <Favicon src={tab.favicon} loading={runtime?.loading} />
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
      {runtime?.audible || runtime?.muted ? (
        <IconButton
          size="sm"
          label={runtime.muted ? 'Unmute tab' : 'Mute tab'}
          onMouseDown={stop}
          onClick={() => ante.command({ type: 'tab/toggleMute', tabId: tab.id })}
        >
          {runtime.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </IconButton>
      ) : null}
      {!compact && (
        <IconButton
          size="sm"
          label={persistent ? 'Unload tab' : 'Close tab'}
          className={styles.close}
          onMouseDown={stop}
          onClick={() => ante.command({ type: 'tab/close', tabId: tab.id })}
        >
          {persistent ? <span className={styles.unloadGlyph} /> : <X size={13} />}
        </IconButton>
      )}
    </div>
  )
}
