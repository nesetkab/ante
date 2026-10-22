import { useEffect } from 'react'
import { ante } from '../ante'
import { Sidebar } from '../chrome/Sidebar'
import { useWindowData, useWindowRuntime } from '../store'
import { CommandBar } from './CommandBar'
import styles from './OverlaySurface.module.css'
import { PeekFrame } from './PeekFrame'

export function OverlaySurface() {
  const window = useWindowData()
  const runtime = useWindowRuntime()
  const overlay = runtime?.overlay ?? null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (overlay) ante.command({ type: 'overlay/close' })
      else if (window?.peekTabId) ante.command({ type: 'peek/close' })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay, window?.peekTabId])

  if (overlay?.kind === 'sidebar') {
    return (
      <div
        className={styles.floatingSidebar}
        onMouseLeave={() => ante.command({ type: 'window/sidebarHover', hovering: false })}
      >
        <Sidebar floating />
      </div>
    )
  }

  return (
    <div className={styles.surface}>
      {window?.peekTabId && <PeekFrame />}
      {overlay?.kind === 'commandBar' && <CommandBar key={overlay.mode} mode={overlay.mode} />}
    </div>
  )
}
