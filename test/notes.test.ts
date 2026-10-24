import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { noteIdOf, noteUrl, referencedNoteIds } from '@shared/notes'
import type { AppState } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { reduce } from '@shared/state/reducer'
import { sanitize } from '@shared/state/sanitize'
import { buildState, makeTab } from './helpers'

const apply = (state: AppState, ...actions: Action[]) =>
  actions.reduce((current, action) => produce(current, (draft) => reduce(draft, action)), state)

describe('note urls', () => {
  it('round trips note ids', () => {
    expect(noteIdOf(noteUrl('abc'))).toBe('abc')
    expect(noteIdOf('https://example.com')).toBeNull()
    expect(noteIdOf('ante:note/')).toBeNull()
  })
})

describe('note/update', () => {
  it('creates the note and renames every tab showing it', () => {
    const state = buildState({
      spaces: { s1: { today: ['t1'] } },
      tabs: { t1: { url: noteUrl('n1') } },
    })
    const next = apply(
      state,
      { type: 'note/create', id: 'n1', now: 1 },
      { type: 'note/update', id: 'n1', title: 'Groceries', body: 'milk', now: 5 },
    )
    expect(next.data.notes.n1).toEqual({
      id: 'n1',
      title: 'Groceries',
      body: 'milk',
      updatedAt: 5,
      private: false,
    })
    expect(next.data.items.t1).toMatchObject({ title: 'Groceries' })
  })

  it('names untitled notes', () => {
    const state = buildState({
      spaces: { s1: { today: ['t1'] } },
      tabs: { t1: { url: noteUrl('n1') } },
    })
    const next = apply(
      state,
      { type: 'note/create', id: 'n1', now: 1 },
      { type: 'note/update', id: 'n1', title: '  ', now: 1 },
    )
    expect(next.data.items.t1).toMatchObject({ title: 'Untitled note' })
  })

  it('keeps a note through archive and restore', () => {
    const state = apply(
      buildState({ spaces: { s1: { today: ['t1'] } }, tabs: { t1: { url: noteUrl('n1') } } }),
      { type: 'note/create', id: 'n1', now: 1 },
      { type: 'note/update', id: 'n1', title: 'Plan', now: 1 },
      { type: 'today/clear', spaceId: 's1', now: 2 },
    )
    expect(state.data.items.t1).toBeUndefined()
    expect(referencedNoteIds(state.data).has('n1')).toBe(true)
    const restored = apply(state, {
      type: 'archive/restore',
      id: 't1',
      tabId: 't2',
      spaceId: 's1',
      now: 3,
    })
    expect(restored.data.items.t2).toMatchObject({ url: noteUrl('n1') })
  })
})

describe('sanitize', () => {
  it('keeps notes nothing points to but drops private ones', () => {
    const state = buildState({
      spaces: { s1: { today: ['t1'] } },
      tabs: { t1: { url: noteUrl('kept') } },
    })
    const data = {
      ...state.data,
      notes: {
        kept: { id: 'kept', title: '', body: '', updatedAt: 0, private: false },
        orphan: { id: 'orphan', title: '', body: '', updatedAt: 0, private: false },
        secret: { id: 'secret', title: '', body: '', updatedAt: 0, private: true },
      },
    }
    expect(Object.keys(sanitize(data, 'fallback').notes).sort()).toEqual(['kept', 'orphan'])
  })

  it('ignores updates for notes that do not exist', () => {
    const state = buildState()
    expect(
      apply(state, { type: 'note/update', id: 'gone', title: 'x', now: 1 }).data.notes,
    ).toEqual({})
  })

  it('deletes a note with its tabs and archive entries', () => {
    const state = apply(
      buildState({ spaces: { s1: { today: ['t1', 't2'] } }, tabs: { t1: { url: noteUrl('n1') } } }),
      { type: 'note/create', id: 'n1', now: 1 },
      { type: 'page/delete', kind: 'note', id: 'n1', now: 2 },
    )
    expect(state.data.notes.n1).toBeUndefined()
    expect(state.data.items.t1).toBeUndefined()
    expect(state.data.items.t2).toBeDefined()
    expect(state.data.spaces.s1?.today).toEqual(['t2'])
  })

  it('keeps notes referenced only from a pinned tab home url', () => {
    const tab = { ...makeTab('t1'), url: 'https://example.com', savedUrl: noteUrl('home') }
    const state = buildState({ spaces: { s1: { pinned: ['t1'] } }, tabs: { t1: tab } })
    expect(referencedNoteIds(state.data).has('home')).toBe(true)
  })
})
