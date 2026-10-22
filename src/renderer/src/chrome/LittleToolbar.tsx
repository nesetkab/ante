import { ArrowLeft, ArrowRight, RotateCw, SquareArrowOutUpRight } from 'lucide-react'
import { getTab } from '@shared/state/tree'
import { displayUrl } from '@shared/url'
import { ante, isMac } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { useAppState, useWindowData } from '../store'
import styles from './LittleToolbar.module.css'

export function LittleToolbar() {
  const window = useWindowData()
  const tab = useAppState((state) => getTab(state.data, window?.littleTabId))
  const runtime = useAppState((state) => (tab ? state.runtime.tabs[tab.id] : undefined))
  const spaceName = useAppState((state) =>
    window ? state.data.spaces[window.spaceId]?.name : undefined,
  )

  return (
    <header className={[styles.toolbar, isMac && styles.mac].filter(Boolean).join(' ')}>
      <IconButton
        label="Back"
        disabled={!runtime?.canGoBack}
        onClick={() => ante.command({ type: 'tab/back' })}
      >
        <ArrowLeft size={15} />
      </IconButton>
      <IconButton
        label="Forward"
        disabled={!runtime?.canGoForward}
        onClick={() => ante.command({ type: 'tab/forward' })}
      >
        <ArrowRight size={15} />
      </IconButton>
      <IconButton label="Reload" onClick={() => ante.command({ type: 'tab/reload' })}>
        <RotateCw size={14} />
      </IconButton>
      <button
        type="button"
        className={styles.location}
        onClick={() => ante.command({ type: 'commandBar/open', mode: 'edit' })}
      >
        <Favicon src={tab?.favicon ?? null} loading={runtime?.loading} size={14} />
        <span className={styles.url}>{tab ? displayUrl(tab.url) : ''}</span>
      </button>
      <button
        type="button"
        className={styles.openIn}
        title={spaceName ? `Move to ${spaceName}` : 'Move to main window'}
        onClick={() => ante.command({ type: 'little/moveToSpace' })}
      >
        <SquareArrowOutUpRight size={13} />
        <span>Open in Ante</span>
      </button>
    </header>
  )
}
