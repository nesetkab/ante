import { useEffect } from 'react'
import { isMac, panelParams } from '../ante'
import { BoostPanel } from './BoostPanel'
import styles from './Panel.module.css'
import { RoutesPanel } from './RoutesPanel'
import { SettingsPanel } from './SettingsPanel'

const titles: Record<string, string> = {
  boost: 'Boost',
  routes: 'Air Traffic Control',
  settings: 'Settings',
}

export function PanelSurface() {
  const kind = panelParams.get('panel') ?? ''
  const title = titles[kind] ?? 'Ante'
  useEffect(() => {
    document.title = title
  }, [title])
  return (
    <div className={styles.panel}>
      <header className={[styles.titleBar, isMac && styles.titleBarMac].filter(Boolean).join(' ')}>
        {title}
      </header>
      <main className={styles.body}>
        {kind === 'boost' && <BoostPanel boostId={panelParams.get('boost') ?? ''} />}
        {kind === 'routes' && <RoutesPanel />}
        {kind === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}
