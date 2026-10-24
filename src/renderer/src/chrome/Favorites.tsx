import { memo } from 'react'
import type { Id } from '@shared/schema'
import { getTab } from '@shared/state/tree'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { useAppSelector, useAppState } from '../store'
import { useDragSource, useDragType } from './drag'
import { dropTile, dropZone } from './dropTargets'
import { selectActiveId } from './selectors'
import styles from './Sidebar.module.css'

const FavoriteTile = memo(function FavoriteTile({ id }: { id: Id }) {
  const tab = useAppState((state) => getTab(state.data, id))
  const runtime = useAppState((state) => state.runtime.tabs[id])
  const active = useAppState((state) => selectActiveId(state) === id)
  const { dragging, onPointerDown } = useDragSource({ type: 'item', id, variant: 'tile' })
  if (!tab) return null
  return (
    <button
      type="button"
      title={tab.customTitle ?? tab.title}
      className={[
        styles.favorite,
        active && styles.favoriteActive,
        !runtime && styles.unloaded,
        dragging && styles.dragging,
      ]
        .filter(Boolean)
        .join(' ')}
      {...dropTile(id)}
      onPointerDown={onPointerDown}
      onClick={() => ante.command({ type: 'tab/activate', tabId: id })}
      onContextMenu={(event) => {
        event.preventDefault()
        ante.command({ type: 'tab/contextMenu', tabId: id })
      }}
    >
      <Favicon src={tab.favicon} pageUrl={tab.url} loading={runtime?.loading} size={18} />
    </button>
  )
})

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

const NO_FAVORITES: readonly Id[] = []

export const Favorites = memo(function Favorites({ profileId }: { profileId: Id }) {
  const favorites = useAppSelector((state) => state.data.favorites[profileId] ?? NO_FAVORITES)
  if (favorites.length === 0) return null
  return (
    <div className={styles.favorites}>
      {favorites.map((id) => (
        <FavoriteTile key={id} id={id} />
      ))}
    </div>
  )
})
