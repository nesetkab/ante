import { Folder } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { Data } from '@shared/schema'
import { displayTitle, flattenTabs, getTab } from '@shared/state/tree'
import { Favicon } from '../components/Favicon'
import { useAppState } from '../store'
import { useDragSession, type DragSession } from './drag'
import styles from './DragLayer.module.css'

function ItemGhost({ session, data }: { session: DragSession; data: Data }) {
  const { source } = session
  if (source.type !== 'item') return null
  const item = data.items[source.id]
  if (!item) return null
  if (source.variant === 'tile' && item.kind === 'tab')
    return (
      <div className={styles.tile}>
        <Favicon src={item.favicon} size={18} />
      </div>
    )
  if (item.kind === 'folder')
    return (
      <div className={styles.row}>
        <Folder size={15} className={styles.muted} />
        <span className={styles.title}>{item.name || 'Untitled'}</span>
      </div>
    )
  const tabs = flattenTabs(data, [item.id])
    .map((id) => getTab(data, id))
    .filter((tab) => tab !== null)
  return (
    <div className={styles.row}>
      {tabs.map((tab) => (
        <Favicon key={tab.id} src={tab.favicon} />
      ))}
      {tabs.length === 1 && tabs[0] && (
        <span className={styles.title}>{displayTitle(tabs[0]) || 'New Tab'}</span>
      )}
    </div>
  )
}

function SpaceGhost({ session, data }: { session: DragSession; data: Data }) {
  const space = data.spaces[session.source.id]
  if (!space) return null
  return (
    <div className={styles.dot}>
      {space.icon ? (
        <span className={styles.emoji}>{space.icon}</span>
      ) : (
        <span className={styles.swatch} style={{ background: space.color }} />
      )}
    </div>
  )
}

export function DragLayer() {
  const session = useDragSession()
  const data = useAppState((state) => state.data)
  if (!session) return null
  const visual = session.target?.visual ?? null
  const ghostStyle = {
    left: session.x - session.offsetX,
    top: session.y - session.offsetY,
    width: session.width,
    height: session.height,
  }
  return createPortal(
    <div className={styles.layer}>
      {visual && (
        <div
          className={styles[visual.kind]}
          style={{
            left: visual.rect.x,
            top: visual.rect.y,
            width: visual.rect.width,
            height: visual.rect.height,
          }}
        />
      )}
      <div className={styles.ghost} style={ghostStyle}>
        {session.source.type === 'item' ? (
          <ItemGhost session={session} data={data} />
        ) : (
          <SpaceGhost session={session} data={data} />
        )}
      </div>
    </div>,
    document.body,
  )
}
