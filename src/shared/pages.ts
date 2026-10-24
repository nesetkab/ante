import type { Data } from './schema'
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

export interface LibraryPage {
  kind: InternalPage['kind']
  id: string
  title: string
  detail: string
  updatedAt: number
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.trim() ?? ''

export function libraryPages(data: Data, query = ''): LibraryPage[] {
  const notes = Object.values(data.notes)
    .filter((note) => !note.private)
    .map((note): LibraryPage => {
      const title = note.title.trim() || firstLine(note.body) || 'Untitled note'
      const preview = note.title.trim() ? firstLine(note.body) : ''
      return {
        kind: 'note',
        id: note.id,
        title,
        detail: preview || 'Note',
        updatedAt: note.updatedAt,
      }
    })
  const easels = Object.values(data.easels)
    .filter((easel) => !easel.private)
    .map((easel): LibraryPage => ({
      kind: 'easel',
      id: easel.id,
      title: easel.title.trim() || 'Untitled easel',
      detail: `Easel · ${easel.elements.length} ${easel.elements.length === 1 ? 'item' : 'items'}`,
      updatedAt: easel.updatedAt,
    }))
  const needle = query.trim().toLowerCase()
  const bodies = new Map(
    Object.values(data.notes).map((note) => [note.id, note.body.toLowerCase()]),
  )
  return [...notes, ...easels]
    .filter(
      (page) =>
        !needle ||
        page.title.toLowerCase().includes(needle) ||
        (page.kind === 'note' && (bodies.get(page.id) ?? '').includes(needle)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
