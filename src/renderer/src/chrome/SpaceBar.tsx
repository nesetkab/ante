import { Plus } from 'lucide-react'
import type { Space } from '@shared/schema'
import { isPrivateSpace } from '@shared/state/private'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppState, useWindowData } from '../store'
import { useDragSource } from './drag'
import { dropSpace } from './dropTargets'
import styles from './Sidebar.module.css'

function SpaceDot({ space, active }: { space: Space; active: boolean }) {
  const { dragging, onPointerDown } = useDragSource({ type: 'space', id: space.id })
  return (
    <button
      type="button"
      title={space.name}
      aria-pressed={active}
      className={[styles.spaceDot, active && styles.spaceDotActive, dragging && styles.dragging]
        .filter(Boolean)
        .join(' ')}
      {...dropSpace(space.id)}
      onPointerDown={onPointerDown}
      onClick={() => ante.command({ type: 'space/select', spaceId: space.id })}
      onContextMenu={(event) => {
        event.preventDefault()
        ante.command({ type: 'space/contextMenu', spaceId: space.id })
      }}
    >
      {space.icon ? (
        <span className={styles.spaceDotEmoji}>{space.icon}</span>
      ) : (
        <span className={styles.spaceDotSwatch} style={{ background: space.color }} />
      )}
    </button>
  )
}

export function SpaceBar() {
  const window = useWindowData()
  const spaces = useAppState((state) => state.data.spaces)
  const order = useAppState((state) => state.data.spaceOrder)
  const data = useAppState((state) => state.data)

  if (window && isPrivateSpace(data, window.spaceId)) {
    return (
      <footer className={styles.spaceBar}>
        <span className={styles.privateLabel}>Private window</span>
      </footer>
    )
  }

  return (
    <footer className={styles.spaceBar}>
      <div className={styles.spaceDots}>
        {order.map((id) => {
          const space = spaces[id]
          return space ? <SpaceDot key={id} space={space} active={id === window?.spaceId} /> : null
        })}
      </div>
      <IconButton label="New space" size="sm" onClick={() => ante.command({ type: 'space/new' })}>
        <Plus size={14} />
      </IconButton>
    </footer>
  )
}
