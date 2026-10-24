import { RotateCw, TriangleAlert } from 'lucide-react'
import { CRASH_COPY, describeLoadError } from '@shared/loadErrors'
import type { Id, Rect } from '@shared/schema'
import { displayUrl } from '@shared/url'
import { ante } from '../ante'
import { useAppState } from '../store'
import styles from './TabProblem.module.css'

export function TabProblem({ tabId, rect }: { tabId: Id; rect: Rect }) {
  const runtime = useAppState((state) => state.runtime.tabs[tabId])
  if (!runtime?.error && !runtime?.crashed) return null
  const copy = runtime.error ? describeLoadError(runtime.error) : CRASH_COPY
  return (
    <section
      className={styles.problem}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className={styles.body}>
        <TriangleAlert size={22} className={styles.icon} />
        <h2 className={styles.title}>{copy.title}</h2>
        <p className={styles.detail}>{copy.detail}</p>
        {runtime.error && <p className={styles.url}>{displayUrl(runtime.error.url)}</p>}
        <button
          type="button"
          className={styles.retry}
          onClick={() => ante.command({ type: 'tab/reload', tabId })}
        >
          <RotateCw size={13} />
          Try Again
        </button>
      </div>
    </section>
  )
}
