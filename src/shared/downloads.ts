import type { DownloadRuntime } from './schema'

const MAX_ATTEMPTS = 10_000
const UNSAFE_CHARACTERS = /[/\\:*?"<>|\p{Cc}]/gu

export function safeFileName(name: string): string {
  const cleaned = name.replace(UNSAFE_CHARACTERS, '_').replace(/^\.+/, '').trim()
  return cleaned || 'download'
}

export function splitExtension(name: string): [string, string] {
  const compound = /\.tar\.(gz|bz2|xz|zst)$/i.exec(name)
  const dot = compound ? compound.index : name.lastIndexOf('.')
  if (dot <= 0) return [name, '']
  return [name.slice(0, dot), name.slice(dot)]
}

export function uniqueFileName(name: string, taken: (candidate: string) => boolean): string {
  const safe = safeFileName(name)
  if (!taken(safe)) return safe
  const [stem, extension] = splitExtension(safe)
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = `${stem} (${attempt})${extension}`
    if (!taken(candidate)) return candidate
  }
  return `${stem} (${Date.now()})${extension}`
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${UNITS[exponent] ?? 'B'}`
}

export function downloadProgress(download: DownloadRuntime): number | null {
  if (download.state === 'completed') return 1
  if (download.totalBytes <= 0) return null
  return Math.min(download.receivedBytes / download.totalBytes, 1)
}

export function isActiveDownload(download: DownloadRuntime): boolean {
  return download.state === 'progressing' || download.state === 'paused'
}
