import { describe, expect, it } from 'vitest'
import type { Data, Item } from '@shared/schema'
import { sanitize } from '@shared/state/sanitize'
import { DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { buildData, folder, makeTab, makeWindow, split } from './helpers'

const withItems = (data: Data, ...items: Item[]): Data => ({
  ...data,
  items: { ...Object.fromEntries(items.map((item) => [item.id, item])), ...data.items },
})

describe('sanitize', () => {
  it('returns fresh data when there are no spaces', () => {
    const empty = { ...buildData(), spaces: {}, spaceOrder: [] }
    const result = sanitize(empty, 'fresh')
    expect(result.spaceOrder).toEqual(['fresh'])
    expect(result.spaces.fresh?.name).toBe('Personal')
  })

  it('does not mutate its input', () => {
    const input = buildData({ spaces: { s1: { today: ['a', 'a'] } } })
    const copy = structuredClone(input)
    sanitize(input, 'x')
    expect(input).toEqual(copy)
  })

  it('leaves valid data untouched', () => {
    const input = buildData({
      spaces: {
        s1: { pinned: [folder('f', ['p'])], today: ['a', split('sp', ['b', 'c'])] },
        s2: {},
      },
      favorites: { default: ['fav'] },
      windows: { w1: { active: 'a' } },
    })
    expect(sanitize(input, 'x')).toEqual(input)
  })

  it('restores the default profile and fixes spaces pointing at missing profiles', () => {
    const input = buildData({ profiles: ['work'], spaces: { s1: { profileId: 'work' } } })
    input.profiles = { work: { id: 'work', name: 'Work' } }
    input.spaces.s1 = { ...input.spaces.s1, profileId: 'ghost' } as Data['spaces'][string]
    const result = sanitize(input, 'x')
    expect(result.profiles[DEFAULT_PROFILE_ID]).toBeDefined()
    expect(result.spaces.s1?.profileId).toBe(DEFAULT_PROFILE_ID)
    expect(result.favorites).toEqual({ work: [], default: [] })
  })

  it('drops favorites of missing profiles along with their tabs', () => {
    const input = buildData({ profiles: ['work'], favorites: { work: ['w'] } })
    Reflect.deleteProperty(input.profiles, 'work')
    const result = sanitize(input, 'x')
    expect(result.favorites).toEqual({ default: [] })
    expect(result.items.w).toBeUndefined()
  })

  it('repairs the space order', () => {
    const input = buildData({ spaces: { s1: {}, s2: {}, s3: {} } })
    input.spaceOrder = ['s2', 'ghost', 's2']
    expect(sanitize(input, 'x').spaceOrder).toEqual(['s2', 's1', 's3'])
  })

  it('drops references to missing items', () => {
    const input = buildData({ spaces: { s1: { pinned: [folder('f', ['p'])], today: ['a'] } } })
    input.spaces.s1?.today.push('ghost')
    input.spaces.s1?.pinned.push('ghost')
    const f = input.items.f
    if (f?.kind === 'folder') f.children.push('ghost')
    const result = sanitize(input, 'x')
    expect(result.spaces.s1?.today).toEqual(['a'])
    expect(result.spaces.s1?.pinned).toEqual(['f'])
    expect(result.items.f).toMatchObject({ children: ['p'] })
  })

  it('keeps the first claim when an id is listed in several containers', () => {
    const input = buildData({
      spaces: { s1: { pinned: ['a'] }, s2: { today: ['b'] } },
      favorites: { default: ['c'] },
    })
    input.spaces.s1?.today.push('a', 'b')
    input.spaces.s2?.today.push('c')
    input.favorites.default?.push('a')
    const result = sanitize(input, 'x')
    expect(result.spaces.s1).toMatchObject({ pinned: ['a'], today: ['b'] })
    expect(result.spaces.s2?.today).toEqual(['c'])
    expect(result.favorites.default).toEqual([])
  })

  it('removes a container that lists itself', () => {
    const input = withItems(
      buildData(),
      { kind: 'folder', id: 'f', name: 'f', children: ['f', 'p'], open: true },
      makeTab('p'),
    )
    input.spaces.s1?.pinned.push('f')
    const result = sanitize(input, 'x')
    expect(result.items.f).toMatchObject({ children: ['p'] })
  })

  it('drops orphaned items', () => {
    const input = withItems(
      buildData({ spaces: { s1: { today: ['a'] } }, loose: ['peek'] }),
      { kind: 'folder', id: 'lost', name: 'lost', children: ['inside'], open: true },
      makeTab('inside'),
    )
    const result = sanitize(input, 'x')
    expect(Object.keys(result.items).sort()).toEqual(['a'])
  })

  it('does not let an orphaned container steal a live child', () => {
    const live = buildData({ spaces: { s1: { pinned: [folder('f', ['p'])] } } })
    const input = withItems(live, {
      kind: 'folder',
      id: 'orphan',
      name: 'orphan',
      children: ['p'],
      open: true,
    })
    const result = sanitize(input, 'x')
    expect(result.items.f).toMatchObject({ children: ['p'] })
    expect(result.items.p).toBeDefined()
    expect(result.items.orphan).toBeUndefined()
  })

  it('equalizes split sizes that do not match the children', () => {
    const input = buildData({
      spaces: { s1: { today: [split('sp', ['a', 'b', 'c'], { sizes: [0.5, 0.5] })] } },
    })
    const result = sanitize(input, 'x')
    expect(result.items.sp).toMatchObject({ sizes: [1 / 3, 1 / 3, 1 / 3] })
  })

  it('dissolves a split left with a single tab', () => {
    const input = buildData({ spaces: { s1: { today: ['x', split('sp', ['a', 'b']), 'y'] } } })
    const sp = input.items.sp
    if (sp?.kind === 'split') sp.children = ['a', 'ghost']
    Reflect.deleteProperty(input.items, 'b')
    const result = sanitize(input, 'x')
    expect(result.items.sp).toBeUndefined()
    expect(result.spaces.s1?.today).toEqual(['x', 'a', 'y'])
  })

  it('drops splits with no tabs left', () => {
    const input = buildData({ spaces: { s1: { today: ['x', split('sp', ['a', 'b'])] } } })
    Reflect.deleteProperty(input.items, 'a')
    Reflect.deleteProperty(input.items, 'b')
    const result = sanitize(input, 'x')
    expect(result.items.sp).toBeUndefined()
    expect(result.spaces.s1?.today).toEqual(['x'])
  })

  it('repairs windows', () => {
    const input = buildData({
      spaces: { s1: { today: ['a'] }, s2: { pinned: [folder('f', ['p'])] } },
      loose: ['peek'],
    })
    input.windows = {
      main: makeWindow('main', 'ghost', {
        activeBySpace: { s1: 'a', s2: 'f', ghost: 'a' },
        peekTabId: 'peek',
        littleTabId: 'peek',
      }),
      kept: makeWindow('kept', 's2', { activeBySpace: { s1: null } }),
      little: makeWindow('little', 's1', { kind: 'little', littleTabId: 'peek' }),
    }
    const result = sanitize(input, 'x')
    expect(Object.keys(result.windows)).toEqual(['main', 'kept'])
    expect(result.windows.main).toMatchObject({
      spaceId: 's1',
      activeBySpace: { s1: 'a' },
      peekTabId: null,
      littleTabId: null,
    })
    expect(result.windows.kept?.activeBySpace).toEqual({ s1: null })
    expect(result.items.peek).toBeUndefined()
  })
})
