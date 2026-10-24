import { describe, expect, it } from 'vitest'
import { MAX_CLOSED } from '@shared/state/reducer'
import {
  apply,
  buildState,
  favorites,
  folder,
  inFolder,
  inSplit,
  itemOf,
  list,
  makeTab,
  pinned,
  split,
  splitOf,
  tabOf,
  today,
  windowOf,
} from './helpers'

describe('tab/create', () => {
  const start = buildState({ spaces: { s1: { today: ['a'] } } })

  it('creates a loose tab without a container', () => {
    const next = apply(start, { type: 'tab/create', tab: makeTab('n'), to: null, index: 0 })
    expect(tabOf(next, 'n').url).toBe('https://n.test/')
    expect(list(next, today('s1'))).toEqual(['a'])
  })

  it('inserts into today without a saved url', () => {
    const tab = makeTab('n', { savedUrl: 'https://old.test/' })
    const next = apply(start, { type: 'tab/create', tab, to: today('s1'), index: 0 })
    expect(list(next, today('s1'))).toEqual(['n', 'a'])
    expect(tabOf(next, 'n').savedUrl).toBeNull()
  })

  it('remembers the url when created pinned', () => {
    const next = apply(start, { type: 'tab/create', tab: makeTab('n'), to: pinned('s1'), index: 5 })
    expect(list(next, pinned('s1'))).toEqual(['n'])
    expect(tabOf(next, 'n').savedUrl).toBe('https://n.test/')
  })

  it('ignores a duplicate id', () => {
    const tab = makeTab('a', { url: 'https://other.test/' })
    expect(apply(start, { type: 'tab/create', tab, to: today('s1'), index: 0 })).toBe(start)
  })

  it('drops the tab when the container cannot take it', () => {
    const next = apply(start, {
      type: 'tab/create',
      tab: makeTab('n'),
      to: today('missing'),
      index: 0,
    })
    expect(itemOf(next, 'n')).toBeUndefined()
  })

  it('drops the tab when the split is full', () => {
    const full = buildState({ spaces: { s1: { today: [split('sp', ['a', 'b', 'c', 'd'])] } } })
    const next = apply(full, { type: 'tab/create', tab: makeTab('n'), to: inSplit('sp'), index: 0 })
    expect(itemOf(next, 'n')).toBeUndefined()
    expect(splitOf(next, 'sp').children).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('tab/update, tab/rename, tab/reset, tab/setSavedUrl', () => {
  const start = buildState({
    spaces: { s1: { pinned: ['p', folder('f', ['q'])], today: ['a'] } },
    tabs: { p: { url: 'https://p.test/deep', title: 'Deep' } },
  })

  it('patches a tab', () => {
    const next = apply(start, {
      type: 'tab/update',
      id: 'a',
      patch: { title: 'New', favicon: 'x' },
    })
    expect(tabOf(next, 'a')).toMatchObject({ title: 'New', favicon: 'x' })
  })

  it('ignores updates for folders and missing ids', () => {
    expect(apply(start, { type: 'tab/update', id: 'f', patch: { title: 'x' } })).toBe(start)
    expect(apply(start, { type: 'tab/update', id: 'nope', patch: { title: 'x' } })).toBe(start)
  })

  it.each([
    ['  Mail  ', 'Mail'],
    ['   ', null],
    [null, null],
  ])('renames with %j to %j', (title, expected) => {
    const named = apply(start, { type: 'tab/rename', id: 'a', title: 'Before' })
    const next = apply(named, { type: 'tab/rename', id: 'a', title })
    expect(tabOf(next, 'a').customTitle).toBe(expected)
  })

  it('resets a pinned tab to its saved url and title', () => {
    const next = apply(start, { type: 'tab/reset', id: 'p' })
    expect(tabOf(next, 'p')).toMatchObject({ url: 'https://p.test/', title: 'p' })
  })

  it('keeps the title when no saved title exists', () => {
    const state = buildState({
      spaces: { s1: { pinned: ['p'] } },
      tabs: { p: { savedTitle: null, title: 'Live' } },
    })
    expect(tabOf(apply(state, { type: 'tab/reset', id: 'p' }), 'p').title).toBe('Live')
  })

  it('does not reset a tab without a saved url', () => {
    expect(apply(start, { type: 'tab/reset', id: 'a' })).toBe(start)
  })

  it('saves the current url for persistent tabs only', () => {
    const next = apply(start, { type: 'tab/setSavedUrl', id: 'p' })
    expect(tabOf(next, 'p')).toMatchObject({ savedUrl: 'https://p.test/deep', savedTitle: 'Deep' })
    expect(apply(start, { type: 'tab/setSavedUrl', id: 'a' })).toBe(start)
    expect(apply(start, { type: 'tab/setSavedUrl', id: 'missing' })).toBe(start)
  })

  it('saves the url of a tab nested in a pinned folder', () => {
    const moved = apply(start, { type: 'tab/update', id: 'q', patch: { url: 'https://q.test/x' } })
    const next = apply(moved, { type: 'tab/setSavedUrl', id: 'q' })
    expect(tabOf(next, 'q').savedUrl).toBe('https://q.test/x')
  })
})

describe('pinning and favorites', () => {
  const start = buildState({
    profiles: ['work'],
    spaces: {
      s1: { pinned: ['p', folder('f', ['q'])], today: ['a', split('sp', ['b', 'c'])] },
      s2: { profileId: 'work' },
    },
    favorites: { default: ['fav'] },
  })

  it('pins a today tab at the end', () => {
    const next = apply(start, { type: 'tab/pin', id: 'a', spaceId: 's1' })
    expect(list(next, pinned('s1'))).toEqual(['p', 'f', 'a'])
    expect(tabOf(next, 'a').savedUrl).toBe('https://a.test/')
  })

  it('pins the whole split when pinning one of its tabs', () => {
    const next = apply(start, { type: 'tab/pin', id: 'c', spaceId: 's1' })
    expect(list(next, pinned('s1'))).toEqual(['p', 'f', 'sp'])
    expect(splitOf(next, 'sp').children).toEqual(['b', 'c'])
  })

  it('pins into another space', () => {
    const next = apply(start, { type: 'tab/pin', id: 'a', spaceId: 's2' })
    expect(list(next, pinned('s2'))).toEqual(['a'])
  })

  it('ignores pinning into a missing space or a missing tab', () => {
    expect(apply(start, { type: 'tab/pin', id: 'a', spaceId: 'missing' })).toBe(start)
    expect(apply(start, { type: 'tab/pin', id: 'f', spaceId: 's1' })).toBe(start)
  })

  it('unpins to the top of today and forgets the saved url', () => {
    const next = apply(start, { type: 'tab/unpin', id: 'q', spaceId: 's1' })
    expect(list(next, today('s1'))).toEqual(['q', 'a', 'sp'])
    expect(list(next, inFolder('f'))).toEqual([])
    expect(tabOf(next, 'q').savedUrl).toBeNull()
  })

  it('ignores unpin for missing spaces or tabs', () => {
    expect(apply(start, { type: 'tab/unpin', id: 'p', spaceId: 'missing' })).toBe(start)
    expect(apply(start, { type: 'tab/unpin', id: 'missing', spaceId: 's1' })).toBe(start)
  })

  it('favorites a tab out of a split and dissolves the split', () => {
    const next = apply(start, { type: 'tab/favorite', id: 'b', profileId: 'default' })
    expect(list(next, favorites())).toEqual(['fav', 'b'])
    expect(itemOf(next, 'sp')).toBeUndefined()
    expect(list(next, today('s1'))).toEqual(['a', 'c'])
    expect(tabOf(next, 'b').savedUrl).toBe('https://b.test/')
  })

  it('creates the favorites list for a profile that has none', () => {
    const state = buildState({ profiles: ['work'], spaces: { s1: { today: ['a'] } } })
    const missing = {
      ...state,
      data: { ...state.data, favorites: { default: [] } },
    }
    const next = apply(missing, { type: 'tab/favorite', id: 'a', profileId: 'work' })
    expect(list(next, favorites('work'))).toEqual(['a'])
  })

  it('ignores favorites for unknown profiles', () => {
    expect(apply(start, { type: 'tab/favorite', id: 'a', profileId: 'ghost' })).toBe(start)
    expect(apply(start, { type: 'tab/favorite', id: 'f', profileId: 'default' })).toBe(start)
  })

  it('unfavorites into today of the given space', () => {
    const next = apply(start, { type: 'tab/unfavorite', id: 'fav', spaceId: 's2' })
    expect(list(next, favorites())).toEqual([])
    expect(list(next, today('s2'))).toEqual(['fav'])
    expect(tabOf(next, 'fav').savedUrl).toBeNull()
  })
})

describe('tab/remove', () => {
  const start = buildState({
    spaces: {
      s1: { pinned: ['p', folder('f', ['q'])], today: ['a', split('sp', ['b', 'c']), 'd'] },
      s2: { today: ['x'] },
    },
    favorites: { default: ['fav'] },
    loose: ['peek', 'little'],
    windows: {
      w1: { spaceId: 's1', active: 'a', peekTabId: 'peek' },
      w2: { spaceId: 's1', active: 'd', activeBySpace: { s2: 'x' } },
      w3: { kind: 'little', spaceId: 's1', littleTabId: 'little' },
    },
  })

  it.each(['p', 'q', 'fav'])('does not close persistent tab %s', (id) => {
    expect(apply(start, { type: 'tab/remove', id, now: 1 })).toBe(start)
  })

  it('ignores missing ids and non tabs', () => {
    expect(apply(start, { type: 'tab/remove', id: 'missing', now: 1 })).toBe(start)
    expect(apply(start, { type: 'tab/remove', id: 'sp', now: 1 })).toBe(start)
  })

  it('records the closed tab with its location', () => {
    const withRuntime = apply(start, {
      type: 'runtime/tab',
      id: 'a',
      patch: { loading: true },
      create: true,
    })
    const next = apply(withRuntime, { type: 'tab/remove', id: 'a', now: 42 })
    expect(itemOf(next, 'a')).toBeUndefined()
    expect(next.runtime.tabs.a).toBeUndefined()
    expect(next.data.closed[0]).toEqual({
      tab: tabOf(start, 'a'),
      location: { container: today('s1'), index: 0 },
      closedAt: 42,
    })
  })

  it('selects the next tab after the closed one', () => {
    const next = apply(start, { type: 'tab/remove', id: 'a', now: 1 })
    expect(windowOf(next, 'w1').activeBySpace.s1).toBe('b')
  })

  it('selects the previous tab when closing the last one', () => {
    const next = apply(start, { type: 'tab/remove', id: 'd', now: 1 })
    expect(windowOf(next, 'w2').activeBySpace.s1).toBe('c')
    expect(windowOf(next, 'w2').activeBySpace.s2).toBe('x')
  })

  it('falls back to a favorite of the space profile', () => {
    const next = apply(start, { type: 'tab/remove', id: 'x', now: 1 })
    expect(windowOf(next, 'w2').activeBySpace.s2).toBe('fav')
  })

  it('falls back to null when nothing is left in the space', () => {
    const lonely = buildState({ spaces: { s1: { today: ['a'] } }, windows: { w: { active: 'a' } } })
    const next = apply(lonely, { type: 'tab/remove', id: 'a', now: 1 })
    expect(windowOf(next, 'w').activeBySpace.s1).toBeNull()
  })

  it('leaves other windows alone', () => {
    const next = apply(start, { type: 'tab/remove', id: 'a', now: 1 })
    expect(windowOf(next, 'w2').activeBySpace.s1).toBe('d')
  })

  it('dissolves a split when one of two tabs closes', () => {
    const next = apply(start, { type: 'tab/remove', id: 'b', now: 1 })
    expect(itemOf(next, 'sp')).toBeUndefined()
    expect(list(next, today('s1'))).toEqual(['a', 'c', 'd'])
    expect(next.data.closed[0]?.location).toEqual({ container: inSplit('sp'), index: 0 })
  })

  it('closes loose peek tabs without recording them', () => {
    const next = apply(start, { type: 'tab/remove', id: 'peek', now: 1 })
    expect(itemOf(next, 'peek')).toBeUndefined()
    expect(windowOf(next, 'w1').peekTabId).toBeNull()
    expect(next.data.closed).toEqual([])
  })

  it('clears the little window tab', () => {
    const next = apply(start, { type: 'tab/remove', id: 'little', now: 1 })
    expect(windowOf(next, 'w3').littleTabId).toBeNull()
  })

  it('keeps at most MAX_CLOSED entries', () => {
    const ids = Array.from({ length: MAX_CLOSED + 5 }, (_, index) => `t${index}`)
    const many = buildState({ spaces: { s1: { today: ids } } })
    const next = apply(many, ...ids.map((id, now) => ({ type: 'tab/remove' as const, id, now })))
    expect(next.data.closed).toHaveLength(MAX_CLOSED)
    expect(next.data.closed[0]?.tab.id).toBe(ids.at(-1))
  })
})

describe('tab/restoreClosed', () => {
  const start = buildState({
    spaces: {
      s1: { today: ['a', 'b', split('sp', ['c', 'd', 'e'])] },
      s2: { today: ['x'] },
    },
  })

  it('does nothing when nothing was closed', () => {
    expect(apply(start, { type: 'tab/restoreClosed', fallbackSpaceId: 's1' })).toBe(start)
  })

  it('restores to the original position', () => {
    const next = apply(
      start,
      { type: 'tab/remove', id: 'b', now: 1 },
      { type: 'tab/restoreClosed', fallbackSpaceId: 's2' },
    )
    expect(list(next, today('s1'))).toEqual(['a', 'b', 'sp'])
    expect(next.data.closed).toEqual([])
  })

  it('restores into a split that still exists', () => {
    const next = apply(
      start,
      { type: 'tab/remove', id: 'd', now: 1 },
      { type: 'tab/restoreClosed', fallbackSpaceId: 's2' },
    )
    expect(splitOf(next, 'sp').children).toEqual(['c', 'd', 'e'])
  })

  it('falls back to today of the fallback space when the split is gone', () => {
    const next = apply(
      start,
      { type: 'tab/remove', id: 'c', now: 1 },
      { type: 'tab/remove', id: 'd', now: 2 },
      { type: 'tab/restoreClosed', fallbackSpaceId: 's2' },
    )
    expect(itemOf(next, 'sp')).toBeUndefined()
    expect(list(next, today('s2'))).toEqual(['d', 'x'])
  })

  it('falls back when the original space was deleted', () => {
    const next = apply(
      start,
      { type: 'tab/remove', id: 'a', now: 1 },
      { type: 'space/delete', id: 's1' },
      { type: 'tab/restoreClosed', fallbackSpaceId: 's2' },
    )
    expect(list(next, today('s2'))).toEqual(['a', 'x'])
  })

  it('drops the entry when even the fallback space is missing', () => {
    const next = apply(
      start,
      { type: 'tab/remove', id: 'a', now: 1 },
      { type: 'space/delete', id: 's1' },
      { type: 'tab/restoreClosed', fallbackSpaceId: 's1' },
    )
    expect(itemOf(next, 'a')).toBeUndefined()
    expect(next.data.closed).toEqual([])
  })

  it('skips an entry whose id is already in use', () => {
    const closed = apply(start, { type: 'tab/remove', id: 'a', now: 1 })
    const reused = apply(closed, {
      type: 'tab/create',
      tab: makeTab('a', { url: 'https://new.test/' }),
      to: today('s2'),
      index: 0,
    })
    const next = apply(reused, { type: 'tab/restoreClosed', fallbackSpaceId: 's1' })
    expect(tabOf(next, 'a').url).toBe('https://new.test/')
    expect(next.data.closed).toEqual([])
  })
})
