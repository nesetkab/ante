import type { Data, Id, Runtime } from '@shared/schema'
import { getTab } from '@shared/state/tree'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { useDragSource, useDragType } from './drag'
import { dropTile, dropZone } from './dropTargets'
import styles from './Sidebar.module.css'

interface FavoritesProps {
  data: Data
  runtime: Runtime
  profileId: Id
  activeId: Id | null
}

function FavoriteTile({
  id,
  data,
  runtime,
  activeId,
}: Omit<FavoritesProps, 'profileId'> & { id: Id }) {
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id, variant: 'tile' })
  const tab = getTab(data, id)
  if (!tab) return null
  return (
    <button
      type="button"
      title={tab.customTitle ?? tab.title}
      className={[
        styles.favorite,
        id === activeId && styles.favoriteActive,
        !runtime.tabs[id] && styles.unloaded,
        dragging && styles.dragging,
      ]
        .filter(Boolean)
        .join(' ')}
      {...dropTile(id)}
      onPointerDown={onPointerDown}
      onMouseDown={(event) => {
        if (event.button === 0) ante.command({ type: 'tab/activate', tabId: id })
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        ante.command({ type: 'tab/contextMenu', tabId: id })
      }}
    >
      <Favicon src={tab.favicon} pageUrl={tab.url} loading={runtime.tabs[id]?.loading} size={18} />
    </button>
  )
}

export function FavoritesDrop({ profileId }: { profileId: Id }) {
  const dragType = useDragType()
  if (dragType !== 'item') return null
  return (
    <div
      className={styles.favoritesDrop}
      {...dropZone({ placement: { to: { type: 'favorites', profileId }, index: 0 }, line: 'box' })}
    >
      Drop to add to Favorites
    </div>
  )
}

export function Favorites({ data, runtime, profileId, activeId }: FavoritesProps) {
  const favorites = data.favorites[profileId] ?? []
  if (favorites.length === 0) return null
  return (
    <div className={styles.favorites}>
      {favorites.map((id) => (
        <FavoriteTile key={id} id={id} data={data} runtime={runtime} activeId={activeId} />
      ))}
    </div>
  )
}
