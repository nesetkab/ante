import { ArrowDown, Library } from 'lucide-react'
import { overallProgress, type OverallProgress } from '@shared/downloads'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppSelector } from '../store'
import styles from './Sidebar.module.css'

const RADIUS = 9
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const sameProgress = (a: OverallProgress, b: OverallProgress) =>
  a.active === b.active && a.fraction === b.fraction

function roundedProgress(progress: OverallProgress): OverallProgress {
  return {
    active: progress.active,
    fraction: progress.fraction === null ? null : Math.round(progress.fraction * 100) / 100,
  }
}

export function LibraryButton() {
  const progress = useAppSelector(
    (state) => roundedProgress(overallProgress(Object.values(state.runtime.downloads))),
    sameProgress,
  )
  const downloading = progress.active > 0
  const label = downloading
    ? `Library, ${progress.active} download${progress.active === 1 ? '' : 's'} in progress`
    : 'Library'
  return (
    <IconButton
      label={label}
      size="sm"
      className={styles.libraryButton}
      onClick={() =>
        ante.command({ type: 'library/open', ...(downloading ? { section: 'downloads' } : {}) })
      }
    >
      {downloading ? (
        <>
          <svg className={styles.ring} viewBox="0 0 22 22" aria-hidden>
            <circle className={styles.ringTrack} cx="11" cy="11" r={RADIUS} />
            <circle
              className={[styles.ringValue, progress.fraction === null && styles.ringSpin]
                .filter(Boolean)
                .join(' ')}
              cx="11"
              cy="11"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - (progress.fraction ?? 0.25))}
            />
          </svg>
          <ArrowDown size={11} strokeWidth={2.25} />
        </>
      ) : (
        <Library size={14} />
      )}
    </IconButton>
  )
}
