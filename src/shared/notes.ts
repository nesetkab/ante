import type { Data, Id } from './schema'

export const NOTE_PREFIX = 'ante:note/'

export function noteUrl(noteId: Id): string {
  return `${NOTE_PREFIX}${noteId}`
}

export function noteIdOf(url: string): Id | null {
  if (!url.startsWith(NOTE_PREFIX)) return null
  const id = url.slice(NOTE_PREFIX.length)
  return id.length > 0 ? id : null
}

export function isNoteUrl(url: string): boolean {
  return noteIdOf(url) !== null
}

export function noteTabTitle(title: string): string {
  return title.trim() || 'Untitled note'
}

export function referencedNoteIds(data: Data): Set<Id> {
  const urls = [
    ...Object.values(data.items).flatMap((item) =>
      item.kind === 'tab' ? [item.url, item.savedUrl ?? ''] : [],
    ),
    ...data.closed.map((entry) => entry.tab.url),
    ...data.archive.map((entry) => entry.url),
  ]
  return new Set(urls.map(noteIdOf).filter((id): id is Id => id !== null))
}
