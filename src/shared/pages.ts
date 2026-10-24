import { easelIdOf } from './easels'
import { noteIdOf } from './notes'

export type InternalPage = { kind: 'note'; id: string } | { kind: 'easel'; id: string }

export function internalPage(url: string): InternalPage | null {
  const note = noteIdOf(url)
  if (note) return { kind: 'note', id: note }
  const easel = easelIdOf(url)
  if (easel) return { kind: 'easel', id: easel }
  return null
}

export function isInternalPage(url: string): boolean {
  return internalPage(url) !== null
}
