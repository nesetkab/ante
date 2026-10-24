import { Maximize2, X } from 'lucide-react'
import { computeLayout, PEEK_TOOLBAR_HEIGHT, WINDOW_CONTROLS_HEIGHT } from '@shared/layout'
import { getTab } from '@shared/state/tree'
import { displayUrl } from '@shared/url'
import { ante, isMac } from '../ante'
import { Favicon } from '../components/Favicon'
import { IconButton } from '../components/IconButton'
import { useViewportSize } from '../hooks'
import { useAppState, useWindowData } from '../store'
import styles from './PeekFrame.module.css'

export function PeekFrame() {
  const window = useWindowData()
  const data = useAppState((state) => state.data)
  const runtime = useAppState((state) =>
    window?.peekTabId ? state.runtime.tabs[window.peekTabId] : undefined,
  )
  const { width, height } = useViewportSize()
  if (!window?.peekTabId) return null
  const tab = getTab(data, window.peekTabId)
  const { peek } = computeLayout({
    width,
    height,
    window,
    data,
    fullscreenTabId: null,
    controlsInset: isMac ? 0 : WINDOW_CONTROLS_HEIGHT,
  })
  if (!peek || !tab) return null

  return (
    <>
      <div className={styles.backdrop} onMouseDown={() => ante.command({ type: 'peek/close' })} />
      <div
        className={styles.card}
        style={{
          left: peek.x - 6,
          top: peek.y - PEEK_TOOLBAR_HEIGHT,
          width: peek.width + 12,
          height: peek.height + PEEK_TOOLBAR_HEIGHT + 6,
        }}
      >
        <div className={styles.toolbar}>
          <Favicon src={tab.favicon} pageUrl={tab.url} loading={runtime?.loading} size={14} />
          <span className={styles.url}>{displayUrl(tab.url)}</span>
          <IconButton label="Open as tab" onClick={() => ante.command({ type: 'peek/expand' })}>
            <Maximize2 size={14} />
          </IconButton>
          <IconButton label="Close" onClick={() => ante.command({ type: 'peek/close' })}>
            <X size={15} />
          </IconButton>
        </div>
      </div>
    </>
  )
}
