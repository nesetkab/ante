import { describe, expect, it } from 'vitest'
import type { Container, Data } from '@shared/schema'
import {
  activeTabId,
  descendantIds,
  displayTitle,
  flattenTabs,
  getList,
  getTab,
  isPersistent,
  locate,
  parentSplit,
  profileIndex,
  rootOf,
  sameContainer,
  sectionOf,
  spaceTabOrder,
  visibleTabIds,
} from '@shared/state/tree'
import {
  buildData,
  favorites,
  folder,
  inFolder,
  inSplit,
  makeTab,
  makeWindow,
  pinned,
  split,
  today,
} from './helpers'

const data = buildData({
  profiles: ['work'],
  spaces: {
    s1: {
      pinned: ['p', folder('f', ['q', folder('g', ['r'])])],
      today: ['a', split('sp', ['b', 'c'])],
    },
    s2: { profileId: 'work', today: ['x'] },
  },
  favorites: { default: ['fav'], work: ['wfav'] },
  loose: ['peek'],
})

describe('getList', () => {
  it.each<[Container, string[] | null]>([
    [pinned('s1'), ['p', 'f']],
    [today('s1'), ['a', 'sp']],
    [favorites(), ['fav']],
    [inFolder('f'), ['q', 'g']],
    [inSplit('sp'), ['b', 'c']],
    [pinned('missing'), null],
    [today('missing'), null],
    [favorites('ghost'), null],
    [inFolder('sp'), null],
    [inSplit('f'), null],
    [inFolder('missing'), null],
  ])('returns the list for %j', (container, expected) => {
    expect(getList(data, container)).toEqual(expected)
  })
})

describe('locate', () => {
  it.each<[string, Container | null, number]>([
    ['p', pinned('s1'), 0],
    ['a', today('s1'), 0],
    ['fav', favorites(), 0],
    ['wfav', favorites('work'), 0],
    ['r', inFolder('g'), 0],
    ['c', inSplit('sp'), 1],
  ])('finds %s', (id, container, index) => {
    expect(locate(data, id)).toEqual({ container, index })
  })

  it('returns null for loose and missing items', () => {
    expect(locate(data, 'peek')).toBeNull()
    expect(locate(data, 'missing')).toBeNull()
  })
})

describe('rootOf and sections', () => {
  it.each([
    ['r', { section: 'pinned', spaceId: 's1', profileId: 'default' }],
    ['c', { section: 'today', spaceId: 's1', profileId: 'default' }],
    ['x', { section: 'today', spaceId: 's2', profileId: 'work' }],
    ['wfav', { section: 'favorites', spaceId: null, profileId: 'work' }],
  ])('walks %s up to its root', (id, expected) => {
    expect(rootOf(data, id)).toEqual(expected)
  })

  it('returns null for loose tabs and cycles', () => {
    expect(rootOf(data, 'peek')).toBeNull()
    const cyclic: Data = {
      ...data,
      items: {
        ...data.items,
        l1: { kind: 'folder', id: 'l1', name: 'l1', children: ['l2'], open: true, feedUrl: null },
        l2: { kind: 'folder', id: 'l2', name: 'l2', children: ['l1'], open: true, feedUrl: null },
      },
    }
    expect(rootOf(cyclic, 'l1')).toBeNull()
  })

  it('reports sections and persistence', () => {
    expect(sectionOf(data, 'q')).toBe('pinned')
    expect(sectionOf(data, 'peek')).toBeNull()
    expect(isPersistent(data, 'r')).toBe(true)
    expect(isPersistent(data, 'fav')).toBe(true)
    expect(isPersistent(data, 'b')).toBe(false)
    expect(isPersistent(data, 'peek')).toBe(false)
  })
})

describe('item helpers', () => {
  it('gets tabs only', () => {
    expect(getTab(data, 'a')?.id).toBe('a')
    expect(getTab(data, 'f')).toBeNull()
    expect(getTab(data, null)).toBeNull()
    expect(getTab(data, undefined)).toBeNull()
    expect(getTab(data, 'missing')).toBeNull()
  })

  it('finds the parent split', () => {
    expect(parentSplit(data, 'b')?.id).toBe('sp')
    expect(parentSplit(data, 'a')).toBeNull()
    expect(parentSplit(data, 'peek')).toBeNull()
  })

  it('flattens nested containers in order', () => {
    expect(flattenTabs(data, ['f', 'sp', 'missing', 'a'])).toEqual(['q', 'r', 'b', 'c', 'a'])
  })

  it('lists descendants including the root', () => {
    expect(descendantIds(data, 'f')).toEqual(['f', 'q', 'g', 'r'])
    expect(descendantIds(data, 'missing')).toEqual([])
  })

  it('stops at absurd depths instead of looping', () => {
    const cyclic: Data = {
      ...data,
      items: {
        loop: {
          kind: 'folder',
          id: 'loop',
          name: 'loop',
          children: ['loop'],
          open: true,
          feedUrl: null,
        },
      },
    }
    expect(flattenTabs(cyclic, ['loop'])).toEqual([])
    expect(descendantIds(cyclic, 'loop')).toHaveLength(33)
  })

  it('orders tabs as favorites, pinned, today', () => {
    expect(spaceTabOrder(data, 's1')).toEqual(['fav', 'p', 'q', 'r', 'a', 'b', 'c'])
    expect(spaceTabOrder(data, 's2')).toEqual(['wfav', 'x'])
    expect(spaceTabOrder(data, 'missing')).toEqual([])
  })

  it('falls back to no favorites when a profile has no list', () => {
    expect(spaceTabOrder({ ...data, favorites: {} }, 's1')).toEqual(['p', 'q', 'r', 'a', 'b', 'c'])
  })
})

describe('active and visible tabs', () => {
  it('reads the active tab of the current space', () => {
    const window = makeWindow('w', 's1', { activeBySpace: { s1: 'b', s2: 'x' } })
    expect(activeTabId(data, window)).toBe('b')
    expect(visibleTabIds(data, window)).toEqual(['b', 'c'])
  })

  it('ignores stale or non tab ids', () => {
    expect(activeTabId(data, makeWindow('w', 's1', { activeBySpace: { s1: 'f' } }))).toBeNull()
    expect(activeTabId(data, makeWindow('w', 's1'))).toBeNull()
    expect(visibleTabIds(data, makeWindow('w', 's1'))).toEqual([])
  })

  it('shows a single tab outside of splits', () => {
    const window = makeWindow('w', 's1', { activeBySpace: { s1: 'a' } })
    expect(visibleTabIds(data, window)).toEqual(['a'])
  })

  it('uses the little tab for little windows and never splits', () => {
    const window = makeWindow('w', 's1', { kind: 'little', littleTabId: 'b' })
    expect(activeTabId(data, window)).toBe('b')
    expect(visibleTabIds(data, window)).toEqual(['b'])
    expect(activeTabId(data, makeWindow('w', 's1', { kind: 'little' }))).toBeNull()
  })
})

describe('sameContainer', () => {
  const containers: Container[] = [
    pinned('s1'),
    pinned('s2'),
    today('s1'),
    favorites('default'),
    favorites('work'),
    inFolder('f'),
    inFolder('g'),
    inSplit('f'),
  ]

  it('only matches identical containers', () => {
    containers.forEach((a, i) => {
      containers.forEach((b, j) => {
        expect(sameContainer(a, b)).toBe(i === j)
      })
    })
  })
})

describe('displayTitle', () => {
  it('prefers custom title, then title, then url', () => {
    expect(displayTitle(makeTab('a', { customTitle: 'Custom' }))).toBe('Custom')
    expect(displayTitle(makeTab('a', { title: 'Title' }))).toBe('Title')
    expect(displayTitle(makeTab('a', { title: '' }))).toBe('https://a.test/')
  })
})

describe('profileIndex', () => {
  it('maps every tab to the profile of its space or favorites', () => {
    const index = profileIndex(data)
    expect(index.get('p')).toBe(data.spaces.s1?.profileId)
    expect(index.get('wfav')).toBeDefined()
  })

  it('caches frozen data and rebuilds for drafts', () => {
    const frozen = Object.freeze({ ...data })
    expect(profileIndex(frozen)).toBe(profileIndex(frozen))
  })
})
