import { displayTitle, getTab } from '@shared/state/tree'
import { hostOf } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { useAppState } from '../store'
import styles from './TabSwitcher.module.css'

export function TabSwitcher({ tabIds, index }: { tabIds: readonly string[]; index: number }) {
  const data = useAppState((state) => state.data)
  const tabs = tabIds.flatMap((id) => {
    const tab = getTab(data, id)
    return tab ? [tab] : []
  })

  return (
    <div className={styles.backdrop} onMouseDown={() => ante.command({ type: 'overlay/close' })}>
      <div
        className={styles.panel}
        role="listbox"
        aria-label="Recent tabs"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {tabs.map((tab, position) => (
          <button
            key={tab.id}
            type="button"
            role="option"
            aria-selected={position === index}
            className={styles.row}
            onClick={() => ante.command({ type: 'switcher/commit', index: position })}
          >
            <Favicon src={tab.favicon} pageUrl={tab.url} size={16} />
            <span className={styles.title}>{displayTitle(tab)}</span>
            <span className={styles.host}>{hostOf(tab.url)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
