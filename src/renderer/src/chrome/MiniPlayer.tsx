import { Pause, PictureInPicture2, Play, Volume2, VolumeX } from 'lucide-react'
import { useMemo } from 'react'
import { miniPlayerTabIds } from '@shared/media'
import { displayTitle, getTab } from '@shared/state/tree'
import { hostOf } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { useAppState } from '../store'
import styles from './MiniPlayer.module.css'

export function MiniPlayer() {
  const state = useAppState((current) => current)
  const ids = useMemo(() => miniPlayerTabIds(state), [state])
  if (ids.length === 0) return null

  return (
    <div className={styles.stack}>
      {ids.map((id) => {
        const tab = getTab(state.data, id)
        const runtime = state.runtime.tabs[id]
        if (!tab || !runtime) return null
        const media = runtime.media
        const playing = media?.playing ?? runtime.audible
        return (
          <div key={id} className={styles.player}>
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
      })}
    </div>
  )
}
