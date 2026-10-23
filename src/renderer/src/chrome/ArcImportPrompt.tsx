import { Import } from 'lucide-react'
import { ante } from '../ante'
import { useAppState } from '../store'
import styles from './ArcImportPrompt.module.css'

export function ArcImportPrompt() {
  const available = useAppState((state) => state.runtime.arcImportAvailable === true)
  const hasTabs = useAppState((state) =>
    Object.values(state.data.items).some((item) => item.kind === 'tab'),
  )
  if (!available || hasTabs) return null

  return (
    <section className={styles.prompt}>
      <span className={styles.icon}>
        <Import size={18} />
      </span>
      <h2 className={styles.title}>Import your spaces from Arc</h2>
      <p className={styles.body}>Bring over your spaces, pinned tabs, folders and favorites.</p>
      <button
        type="button"
        className={styles.button}
        onClick={() => ante.command({ type: 'import/arc' })}
      >
        Import from Arc
      </button>
    </section>
  )
}
