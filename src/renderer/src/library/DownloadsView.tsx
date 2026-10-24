import { isPrivateProfile } from '@shared/state/private'
import { Download, FileDown, FolderOpen, Pause, Play, RotateCw, X } from 'lucide-react'
import { useMemo } from 'react'
import { downloadProgress, formatBytes, isActiveDownload } from '@shared/downloads'
import type { DownloadRuntime } from '@shared/schema'
import { hostOf } from '@shared/url'
import { IconButton } from '../components/IconButton'
import { library } from '../libraryApi'
import { useAppState, useWindowData } from '../store'
import styles from './Library.module.css'
import { rowProps } from './rowProps'

function statusLine(download: DownloadRuntime): string {
  const host = hostOf(download.url)
  const total = download.totalBytes > 0 ? formatBytes(download.totalBytes) : null
  switch (download.state) {
    case 'progressing':
    case 'paused': {
      const received = formatBytes(download.receivedBytes)
      const amount = total ? `${received} of ${total}` : received
      return download.state === 'paused' ? `Paused, ${amount}` : amount
    }
    case 'completed':
      return [total ?? formatBytes(download.receivedBytes), host].filter(Boolean).join(' · ')
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return 'Failed'
  }
}

function DownloadRow({ download }: { download: DownloadRuntime }) {
  const run = (type: 'open' | 'show' | 'cancel' | 'retry' | 'pause' | 'resume' | 'remove') =>
    library.download({ type, id: download.id })
  const active = isActiveDownload(download)
  const progress = downloadProgress(download)
  const failed = download.state === 'cancelled' || download.state === 'interrupted'

  return (
    <div
      className={[styles.row, styles.downloadRow, failed && styles.failed]
        .filter(Boolean)
        .join(' ')}
      title={download.path}
      {...rowProps(() => run(download.state === 'completed' ? 'open' : 'show'))}
    >
      <FileDown size={18} strokeWidth={1.75} className={styles.fileIcon} />
      <span className={styles.downloadText}>
        <span className={styles.title}>{download.filename}</span>
        <span className={styles.status}>{statusLine(download)}</span>
        {active && (
          <span className={styles.progress}>
            <span
              className={[styles.progressBar, progress === null && styles.indeterminate]
                .filter(Boolean)
                .join(' ')}
              style={progress === null ? undefined : { width: `${progress * 100}%` }}
            />
          </span>
        )}
      </span>
      <span
        className={[styles.rowActions, active && styles.rowActionsVisible]
          .filter(Boolean)
          .join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        {download.state === 'progressing' && (
          <IconButton label="Pause" size="sm" onClick={() => run('pause')}>
            <Pause size={13} />
          </IconButton>
        )}
        {download.state === 'paused' && (
          <IconButton label="Resume" size="sm" onClick={() => run('resume')}>
            <Play size={13} />
          </IconButton>
        )}
        {failed && (
          <IconButton label="Retry" size="sm" onClick={() => run('retry')}>
            <RotateCw size={13} />
          </IconButton>
        )}
        {download.state === 'completed' && (
          <IconButton label="Show in folder" size="sm" onClick={() => run('show')}>
            <FolderOpen size={13} />
          </IconButton>
        )}
        <IconButton
          label={active ? 'Cancel' : 'Remove from list'}
          size="sm"
          onClick={() => run(active ? 'cancel' : 'remove')}
        >
          <X size={13} />
        </IconButton>
      </span>
    </div>
  )
}

export function DownloadsView() {
  const downloads = useAppState((state) => state.runtime.downloads)
  const window = useWindowData()
  const profileId = useAppState((state) =>
    window ? (state.data.spaces[window.spaceId]?.profileId ?? null) : null,
  )
  const sorted = useMemo(
    () =>
      Object.values(downloads)
        .filter(
          (download) =>
            download.profileId === profileId ||
            (!isPrivateProfile(download.profileId) && !isPrivateProfile(profileId)),
        )
        .sort((a, b) => b.startedAt - a.startedAt),
    [downloads, profileId],
  )
  const finished = sorted.filter((download) => !isActiveDownload(download)).length

  if (sorted.length === 0) {
    return (
      <div className={styles.empty}>
        <Download size={22} strokeWidth={1.75} />
        <span>Files you download will show up here</span>
      </div>
    )
  }

  return (
    <>
      <div className={styles.toolbar}>
        <span>
          {sorted.length} {sorted.length === 1 ? 'download' : 'downloads'}
        </span>
        {finished > 0 && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => library.download({ type: 'clear' })}
          >
            Clear finished
          </button>
        )}
      </div>
      <section className={styles.group}>
        {sorted.map((download) => (
          <DownloadRow key={download.id} download={download} />
        ))}
      </section>
    </>
  )
}
