import { Plus } from 'lucide-react'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppState, useWindowData } from '../store'
import styles from './Sidebar.module.css'

export function SpaceBar() {
  const window = useWindowData()
  const spaces = useAppState((state) => state.data.spaces)
  const order = useAppState((state) => state.data.spaceOrder)

  return (
    <footer className={styles.spaceBar}>
      <div className={styles.spaceDots}>
        {order.map((id) => {
          const space = spaces[id]
          if (!space) return null
          const active = id === window?.spaceId
          return (
            <button
              key={id}
              type="button"
              title={space.name}
              aria-pressed={active}
              className={[styles.spaceDot, active && styles.spaceDotActive]
                .filter(Boolean)
                .join(' ')}
              onClick={() => ante.command({ type: 'space/select', spaceId: id })}
            >
              {space.icon ? (
                <span className={styles.spaceDotEmoji}>{space.icon}</span>
              ) : (
                <span className={styles.spaceDotSwatch} style={{ background: space.color }} />
              )}
            </button>
          )
        })}
      </div>
      <IconButton label="New space" size="sm" onClick={() => ante.command({ type: 'space/new' })}>
        <Plus size={14} />
      </IconButton>
    </footer>
  )
}
