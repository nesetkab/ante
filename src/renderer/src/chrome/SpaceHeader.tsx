import { ChevronDown, ChevronRight, Ellipsis, FolderPlus } from 'lucide-react'
import type { Space } from '@shared/schema'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { RenameInput, useRenameEvent } from '../components/RenameInput'
import { dropZone } from './dropTargets'
import styles from './Sidebar.module.css'
import { SpaceIcon } from '../components/SpaceIcon'

export function SpaceHeader({ space }: { space: Space }) {
  const [editing, setEditing] = useRenameEvent(space.id)
  const openMenu = () => ante.command({ type: 'space/contextMenu', spaceId: space.id })
  const toggle = () =>
    ante.dispatch({ type: 'space/update', id: space.id, patch: { collapsed: !space.collapsed } })

  return (
    <div
      className={styles.spaceHeader}
      {...dropZone({
        placement: { to: { type: 'pinned', spaceId: space.id }, index: 0 },
        line: 'bottom',
      })}
      onContextMenu={(event) => {
        event.preventDefault()
        openMenu()
      }}
    >
      <button
        type="button"
        className={styles.collapseToggle}
        aria-label={space.collapsed ? 'Show pinned tabs' : 'Hide pinned tabs'}
        aria-expanded={!space.collapsed}
        onClick={toggle}
      >
        {space.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      {space.icon && <SpaceIcon icon={space.icon} className={styles.spaceIcon} />}
      {editing ? (
        <RenameInput
          className={styles.renameInput}
          value={space.name}
          onCancel={() => setEditing(false)}
          onCommit={(name) => {
            setEditing(false)
            if (name) ante.dispatch({ type: 'space/update', id: space.id, patch: { name } })
          }}
        />
      ) : (
        <span
          className={styles.spaceName}
          onClick={(event) => {
            if (event.detail === 1) toggle()
          }}
          onDoubleClick={() => {
            toggle()
            setEditing(true)
          }}
        >
          {space.name}
        </span>
      )}
      <span className={styles.spaceHeaderActions}>
        <IconButton
          size="sm"
          label="New folder"
          onClick={() =>
            ante.dispatch({
              type: 'folder/create',
              id: crypto.randomUUID(),
              name: 'New Folder',
              spaceId: space.id,
              children: [],
            })
          }
        >
          <FolderPlus size={13} />
        </IconButton>
        <IconButton size="sm" label="Space options" onClick={openMenu}>
          <Ellipsis size={13} />
        </IconButton>
      </span>
    </div>
  )
}
