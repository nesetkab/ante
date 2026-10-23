import { describe, expect, it } from 'vitest'
import { MAX_SPLIT } from '@shared/state/reducer'
import {
  apply,
  buildState,
  favorites,
  folder,
  inFolder,
  itemOf,
  list,
  pinned,
  split,
  splitOf,
  tabOf,
  today,
  windowOf,
} from './helpers'

describe('folder/create', () => {
  const start = buildState({
    spaces: {
      s1: {
        pinned: ['p1', 'p2', folder('f', ['q'])],
        today: ['a', 'b', split('sp', ['c', 'd'])],
      },
    },
    favorites: { default: ['fav'] },
  })

  it('wraps pinned tabs in place', () => {
    const next = apply(start, {
      type: 'folder/create',
      id: 'n',
      name: 'New',
      spaceId: 's1',
      children: ['p2', 'p1'],
    })
    expect(list(next, pinned('s1'))).toEqual(['n', 'f'])
    expect(list(next, inFolder('n'))).toEqual(['p2', 'p1'])
    expect(itemOf(next, 'n')).toMatchObject({ kind: 'folder', name: 'New', open: true })
  })

  it('nests inside the folder of the first child', () => {
    const next = apply(start, {
      type: 'folder/create',
      id: 'n',
      name: 'New',
      spaceId: 's1',
      children: ['q'],
    })
    expect(list(next, inFolder('f'))).toEqual(['n'])
    expect(list(next, inFolder('n'))).toEqual(['q'])
  })

  it('moves today tabs into a new pinned folder and pins them', () => {
    const next = apply(start, {
      type: 'folder/create',
      id: 'n',
      name: 'New',
      spaceId: 's1',
      children: ['a', 'c'],
    })
    expect(list(next, pinned('s1'))).toEqual(['p1', 'p2', 'f', 'n'])
    expect(list(next, inFolder('n'))).toEqual(['a', 'sp'])
    expect(list(next, today('s1'))).toEqual(['b'])
    expect(tabOf(next, 'c').savedUrl).toBe('https://c.test/')
  })

  it('pulls favorites into a pinned folder', () => {
    const next = apply(start, {
      type: 'folder/create',
      id: 'n',
      name: 'New',
      spaceId: 's1',
      children: ['fav'],
    })
    expect(list(next, favorites())).toEqual([])
    expect(list(next, inFolder('n'))).toEqual(['fav'])
  })

  it('creates an empty folder at the end of pinned', () => {
    const next = apply(start, {
      type: 'folder/create',
      id: 'n',
      name: 'New',
      spaceId: 's1',
      children: [],
    })
    expect(list(next, pinned('s1'))).toEqual(['p1', 'p2', 'f', 'n'])
  })

  it('ignores missing spaces and taken ids', () => {
    const base = { type: 'folder/create' as const, name: 'x', children: [] }
    expect(apply(start, { ...base, id: 'n', spaceId: 'missing' })).toBe(start)
    expect(apply(start, { ...base, id: 'a', spaceId: 's1' })).toBe(start)
  })
})

describe('folder rename, toggle and ungroup', () => {
  const start = buildState({
    spaces: { s1: { pinned: ['p', folder('f', ['q', 'r'], { open: true }), 'z'], today: ['a'] } },
  })

  it('renames folders only', () => {
    const next = apply(start, { type: 'folder/rename', id: 'f', name: 'Work' })
    expect(itemOf(next, 'f')).toMatchObject({ name: 'Work' })
    expect(apply(start, { type: 'folder/rename', id: 'a', name: 'x' })).toBe(start)
  })

  it('toggles and sets the open state', () => {
    const closed = apply(start, { type: 'folder/toggle', id: 'f' })
    expect(itemOf(closed, 'f')).toMatchObject({ open: false })
    expect(itemOf(apply(closed, { type: 'folder/toggle', id: 'f' }), 'f')).toMatchObject({
      open: true,
    })
    expect(apply(start, { type: 'folder/toggle', id: 'f', open: true })).toBe(start)
    expect(apply(start, { type: 'folder/toggle', id: 'a' })).toBe(start)
  })

  it('ungroups children into the folder position', () => {
    const next = apply(start, { type: 'folder/ungroup', id: 'f' })
    expect(list(next, pinned('s1'))).toEqual(['p', 'q', 'r', 'z'])
    expect(itemOf(next, 'f')).toBeUndefined()
  })

  it('ignores ungrouping non folders', () => {
    expect(apply(start, { type: 'folder/ungroup', id: 'a' })).toBe(start)
  })
})

describe('split/create', () => {
  const start = buildState({
    spaces: {
      s1: {
        pinned: ['p'],
        today: ['a', 'b', 'c', 'd', 'e', split('sp', ['x', 'y'])],
      },
    },
    favorites: { default: ['fav'] },
  })

  it('creates a split where the first tab was', () => {
    const next = apply(start, {
      type: 'split/create',
      id: 'n',
      tabIds: ['c', 'a'],
      direction: 'vertical',
    })
    expect(list(next, today('s1'))).toEqual(['b', 'n', 'd', 'e', 'sp'])
    expect(splitOf(next, 'n')).toMatchObject({
      children: ['c', 'a'],
      direction: 'vertical',
      sizes: [0.5, 0.5],
    })
  })

  it('caps the split size and dedupes ids', () => {
    const next = apply(start, {
      type: 'split/create',
      id: 'n',
      tabIds: ['a', 'a', 'b', 'c', 'd', 'e'],
      direction: 'horizontal',
    })
    expect(splitOf(next, 'n').children).toEqual(['a', 'b', 'c', 'd'])
    expect(splitOf(next, 'n').children).toHaveLength(MAX_SPLIT)
    expect(list(next, today('s1'))).toEqual(['n', 'e', 'sp'])
  })

  it('joins an existing split when the first tab is in one', () => {
    const next = apply(start, {
      type: 'split/create',
      id: 'n',
      tabIds: ['x', 'a'],
      direction: 'horizontal',
    })
    expect(itemOf(next, 'n')).toBeUndefined()
    expect(splitOf(next, 'sp').children).toEqual(['x', 'y', 'a'])
  })

  it('pulls a tab out of another split and dissolves it', () => {
    const next = apply(start, {
      type: 'split/create',
      id: 'n',
      tabIds: ['a', 'y'],
      direction: 'horizontal',
    })
    expect(splitOf(next, 'n').children).toEqual(['a', 'y'])
    expect(itemOf(next, 'sp')).toBeUndefined()
    expect(list(next, today('s1'))).toEqual(['n', 'b', 'c', 'd', 'e', 'x'])
  })

  it('pins tabs that join a pinned split', () => {
    const next = apply(start, {
      type: 'split/create',
      id: 'n',
      tabIds: ['p', 'a'],
      direction: 'horizontal',
    })
    expect(list(next, pinned('s1'))).toEqual(['n'])
    expect(tabOf(next, 'a').savedUrl).toBe('https://a.test/')
  })

  it.each([
    ['favorites', ['fav', 'a']],
    ['missing tabs', ['a', 'missing']],
    ['a single tab', ['a']],
    ['folders and splits', ['sp', 'a']],
  ])('does nothing with %s', (_label, tabIds) => {
    expect(apply(start, { type: 'split/create', id: 'n', tabIds, direction: 'horizontal' })).toBe(
      start,
    )
  })

  it('does nothing when the first tab is loose', () => {
    const loose = buildState({ spaces: { s1: { today: ['a'] } }, loose: ['peek'] })
    expect(
      apply(loose, {
        type: 'split/create',
        id: 'n',
        tabIds: ['peek', 'a'],
        direction: 'horizontal',
      }),
    ).toBe(loose)
  })
})

describe('split resize, direction and dissolve', () => {
  const start = buildState({
    spaces: { s1: { today: ['a', split('sp', ['b', 'c', 'd']), 'e'] } },
  })

  it('normalizes sizes to sum to one', () => {
    const next = apply(start, { type: 'split/resize', id: 'sp', sizes: [2, 1, 1] })
    expect(splitOf(next, 'sp').sizes).toEqual([0.5, 0.25, 0.25])
  })

  it('ignores sizes that do not match the children', () => {
    expect(apply(start, { type: 'split/resize', id: 'sp', sizes: [1, 1] })).toBe(start)
    expect(apply(start, { type: 'split/resize', id: 'a', sizes: [1] })).toBe(start)
  })

  it('changes direction', () => {
    const next = apply(start, { type: 'split/direction', id: 'sp', direction: 'vertical' })
    expect(splitOf(next, 'sp').direction).toBe('vertical')
    expect(apply(start, { type: 'split/direction', id: 'a', direction: 'vertical' })).toBe(start)
  })

  it('dissolves into its position', () => {
    const next = apply(start, { type: 'split/dissolve', id: 'sp' })
    expect(list(next, today('s1'))).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(itemOf(next, 'sp')).toBeUndefined()
    expect(apply(start, { type: 'split/dissolve', id: 'a' })).toBe(start)
  })
})

describe('spaces', () => {
  const start = buildState({
    profiles: ['work'],
    spaces: {
      s1: { pinned: [folder('f', ['q'])], today: ['a', split('sp', ['b', 'c'])] },
      s2: { today: ['x'] },
      s3: {},
    },
    windows: {
      w1: { spaceId: 's1', active: 'a', activeBySpace: { s2: 'x' } },
      w2: { spaceId: 's2', active: 'x', activeBySpace: { s1: 'b' } },
    },
  })

  it('creates a space at the end', () => {
    const next = apply(start, {
      type: 'space/create',
      id: 'n',
      name: 'New',
      color: '#123456',
      icon: null,
      profileId: 'work',
    })
    expect(next.data.spaceOrder).toEqual(['s1', 's2', 's3', 'n'])
    expect(next.data.spaces.n).toMatchObject({ name: 'New', profileId: 'work', pinned: [] })
  })

  it('refuses unknown profiles and taken ids', () => {
    const base = { type: 'space/create' as const, name: 'x', color: '#123456', icon: null }
    expect(apply(start, { ...base, id: 'n', profileId: 'ghost' })).toBe(start)
    expect(apply(start, { ...base, id: 's1', profileId: 'default' })).toBe(start)
  })

  it('updates a space', () => {
    const next = apply(start, {
      type: 'space/update',
      id: 's1',
      patch: { name: 'Home', profileId: 'work' },
    })
    expect(next.data.spaces.s1).toMatchObject({ name: 'Home', profileId: 'work' })
    expect(apply(start, { type: 'space/update', id: 's1', patch: { profileId: 'ghost' } })).toBe(
      start,
    )
    expect(apply(start, { type: 'space/update', id: 'missing', patch: { name: 'x' } })).toBe(start)
  })

  it.each([
    [0, ['s3', 's1', 's2']],
    [1, ['s1', 's3', 's2']],
    [99, ['s1', 's2', 's3']],
  ])('moves a space to %i', (index, expected) => {
    const next = apply(start, { type: 'space/move', id: 's3', index })
    expect(next.data.spaceOrder).toEqual(expected)
  })

  it('ignores moving a missing space', () => {
    expect(apply(start, { type: 'space/move', id: 'missing', index: 0 })).toBe(start)
  })

  it('deletes a space with everything inside it', () => {
    const next = apply(start, { type: 'space/delete', id: 's1' })
    expect(next.data.spaces.s1).toBeUndefined()
    expect(next.data.spaceOrder).toEqual(['s2', 's3'])
    expect(Object.keys(next.data.items)).toEqual(['x'])
    expect(windowOf(next, 'w1').spaceId).toBe('s2')
    expect(windowOf(next, 'w1').activeBySpace).toEqual({ s2: 'x' })
    expect(windowOf(next, 'w2').spaceId).toBe('s2')
    expect(windowOf(next, 'w2').activeBySpace).toEqual({ s2: 'x' })
  })

  it('never deletes the last space', () => {
    const single = buildState({ spaces: { s1: { today: ['a'] } } })
    expect(apply(single, { type: 'space/delete', id: 's1' })).toBe(single)
    expect(apply(start, { type: 'space/delete', id: 'missing' })).toBe(start)
  })
})

describe('today/clear and archive', () => {
  const start = buildState({
    spaces: {
      s1: { pinned: ['p'], today: ['a', split('sp', ['b', 'c']), 'd'] },
      s2: { today: ['x'] },
    },
    tabs: {
      a: { lastActiveAt: 100, customTitle: 'Custom' },
      b: { lastActiveAt: 100 },
      c: { lastActiveAt: 900 },
      d: { lastActiveAt: 100 },
      x: { lastActiveAt: 100 },
      p: { lastActiveAt: 0 },
    },
    windows: { w1: { spaceId: 's1', active: 'd' } },
  })

  it('archives every today tab of a space', () => {
    const next = apply(start, { type: 'today/clear', spaceId: 's1', now: 5 })
    expect(list(next, today('s1'))).toEqual([])
    expect(next.data.archive.map((entry) => entry.id)).toEqual(['d', 'b', 'c', 'a'])
    expect(next.data.archive.at(-1)).toEqual({
      id: 'a',
      url: 'https://a.test/',
      title: 'Custom',
      favicon: null,
      spaceId: 's1',
      archivedAt: 5,
    })
    expect(windowOf(next, 'w1').activeBySpace.s1).toBe('p')
    expect(list(next, today('s2'))).toEqual(['x'])
    expect(apply(start, { type: 'today/clear', spaceId: 'missing', now: 5 })).toBe(start)
  })

  it('sweeps stale tabs but keeps fresh, kept and pinned ones', () => {
    const next = apply(start, { type: 'archive/sweep', now: 1000, thresholdMs: 500, keep: ['d'] })
    expect(list(next, today('s1'))).toEqual(['sp', 'd'])
    expect(list(next, today('s2'))).toEqual([])
    expect(list(next, pinned('s1'))).toEqual(['p'])
    expect(next.data.archive.map((entry) => entry.id).sort()).toEqual(['a', 'x'])
  })

  it('sweeps a split only when every tab is stale', () => {
    const next = apply(start, { type: 'archive/sweep', now: 2000, thresholdMs: 500, keep: [] })
    expect(list(next, today('s1'))).toEqual([])
    expect(itemOf(next, 'sp')).toBeUndefined()
  })

  it('keeps a split when one of its tabs is kept', () => {
    const next = apply(start, { type: 'archive/sweep', now: 2000, thresholdMs: 500, keep: ['b'] })
    expect(list(next, today('s1'))).toEqual(['sp'])
  })

  it('never sweeps when archiving is off', () => {
    expect(apply(start, { type: 'archive/sweep', now: 1e9, thresholdMs: 0, keep: [] })).toBe(start)
  })

  it('restores an archived tab to the top of today', () => {
    const archived = apply(start, { type: 'today/clear', spaceId: 's1', now: 5 })
    const next = apply(archived, {
      type: 'archive/restore',
      id: 'a',
      tabId: 'a2',
      spaceId: 's1',
      now: 7,
    })
    expect(list(next, today('s1'))).toEqual(['a2'])
    expect(tabOf(next, 'a2')).toMatchObject({
      url: 'https://a.test/',
      title: 'Custom',
      createdAt: 7,
      lastActiveAt: 7,
    })
    expect(next.data.archive.map((entry) => entry.id)).toEqual(['d', 'b', 'c'])
  })

  it('restores into the first space when the original is gone', () => {
    const archived = apply(start, { type: 'today/clear', spaceId: 's1', now: 5 })
    const next = apply(archived, {
      type: 'archive/restore',
      id: 'a',
      tabId: 'a2',
      spaceId: 'missing',
      now: 7,
    })
    expect(list(next, today('s1'))).toEqual(['a2'])
  })

  it('ignores missing entries and taken tab ids', () => {
    const archived = apply(start, { type: 'today/clear', spaceId: 's1', now: 5 })
    const base = { type: 'archive/restore' as const, spaceId: 's1', now: 7 }
    expect(apply(archived, { ...base, id: 'missing', tabId: 'n' })).toBe(archived)
    expect(apply(archived, { ...base, id: 'a', tabId: 'p' })).toBe(archived)
  })

  it('removes and clears archive entries', () => {
    const archived = apply(start, { type: 'today/clear', spaceId: 's1', now: 5 })
    const removed = apply(archived, { type: 'archive/remove', id: 'b' })
    expect(removed.data.archive.map((entry) => entry.id)).toEqual(['d', 'c', 'a'])
    expect(apply(archived, { type: 'archive/clear' }).data.archive).toEqual([])
  })
})

describe('settings/update', () => {
  it('merges a partial patch', () => {
    const next = apply(buildState(), {
      type: 'settings/update',
      patch: { sidebarSide: 'right', theme: 'dark' },
    })
    expect(next.data.settings).toMatchObject({
      sidebarSide: 'right',
      theme: 'dark',
      searchEngine: 'google',
    })
  })
})
