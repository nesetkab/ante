import { Pause, PictureInPicture2, Play, Volume2, VolumeX } from 'lucide-react'
import { memo } from 'react'
import type { Id } from '@shared/schema'
import { miniPlayerTabIds } from '@shared/media'
import { displayTitle, getTab } from '@shared/state/tree'
import { hostOf } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { useAppSelector, useAppState } from '../store'
import styles from './MiniPlayer.module.css'

const PlayerRow = memo(function PlayerRow({ id }: { id: Id }) {
  const tab = useAppState((state) => getTab(state.data, id))
  const runtime = useAppState((state) => state.runtime.tabs[id])
  if (!tab || !runtime) return null
  const media = runtime.media
  const playing = media?.playing ?? runtime.audible
  return (
    <div className={styles.player}>
      <button
        type="button"
        className={styles.info}
        title="Go to tab"
        onClick={() => ante.command({ type: 'tab/activate', tabId: id })}
      >
        {media?.artwork ? (
          <img className={styles.artwork} src={media.artwork} alt="" />
        ) : (
          <span className={styles.artwork}>
            <Favicon src={tab.favicon} pageUrl={tab.url} size={16} />
          </span>
        )}
        <span className={styles.text}>
          <span className={styles.title}>{media?.title ?? displayTitle(tab)}</span>
          <span className={styles.subtitle}>{media?.artist ?? hostOf(tab.url)}</span>
        </span>
      </button>
      {media?.video && (
        <IconButton
          size="sm"
          label="Picture in picture"
          onClick={() => ante.command({ type: 'media/pip', tabId: id })}
        >
          <PictureInPicture2 size={13} />
        </IconButton>
      )}
      {media?.controllable ? (
        <IconButton
          size="sm"
          label={playing ? 'Pause' : 'Play'}
          onClick={() => ante.command({ type: 'media/toggle', tabId: id })}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </IconButton>
      ) : (
        <IconButton
          size="sm"
          label={runtime.muted ? 'Unmute' : 'Mute'}
          onClick={() => ante.command({ type: 'tab/toggleMute', tabId: id })}
        >
          {runtime.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </IconButton>
      )}
    </div>
  )
})

export function MiniPlayer() {
  const ids = useAppSelector((state) => miniPlayerTabIds(state))
  if (ids.length === 0) return null
  return (
    <div className={styles.stack}>
      {ids.map((id) => (
        <PlayerRow key={id} id={id} />
      ))}
    </div>
  )
}
