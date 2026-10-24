export interface SavedEntry {
  url: string
  title: string
  pageState?: string
}

export interface SavedHistory {
  entries: SavedEntry[]
  index: number
}

export interface SavedTabHistory extends SavedHistory {
  profileId: string
}

export const MAX_SAVED_ENTRIES = 30

export function trimHistory(
  entries: readonly SavedEntry[],
  index: number,
  max = MAX_SAVED_ENTRIES,
): SavedHistory | null {
  if (index < 0 || index >= entries.length || max < 1) return null
  const start = Math.max(0, Math.min(index - Math.floor(max / 2), entries.length - max))
  return { entries: entries.slice(start, start + max), index: index - start }
}

export function restorableHistory(saved: SavedHistory | undefined, url: string): boolean {
  return saved?.entries[saved.index]?.url === url
}
