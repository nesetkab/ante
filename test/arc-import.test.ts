import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  arcImportToBundle,
  flattenArcTabs,
  parseArcSidebar,
  type ArcImport,
  type ArcNode,
} from '@shared/importers/arc'
import { applyImport, mergeImport, type ImportBundle } from '@shared/importers/bundle'
import { dataSchema, type Data, type Item, type Tab } from '@shared/schema'
import { createAppState, createInitialData } from '@shared/state/initial'
import { reduce } from '@shared/state/reducer'
import { sanitize } from '@shared/state/sanitize'
import { flattenTabs } from '@shared/state/tree'

const fixture: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/arc/StorableSidebar.json'), 'utf8'),
)

const counter = (prefix: string) => {
  let next = 0
  return () => `${prefix}-${++next}`
}

const bundleFrom = (arc: ArcImport, prefix = 'id') =>
  arcImportToBundle(arc, { newId: counter(prefix), now: 1000 })

const sidebar = (container: Record<string, unknown>) => ({
  sidebar: { containers: [{ global: {} }, container] },
})

const space = (id: string, pinned: string, unpinned: string, extra: object = {}) => [
  id,
  {
    id,
    title: id,
    profile: { default: true },
    containerIDs: ['pinned', pinned, 'unpinned', unpinned],
    ...extra,
  },
]

const containerItem = (id: string, children: string[]) => [
  id,
  {
    id,
    parentID: null,
    childrenIds: children,
    data: { itemContainer: { containerType: { spaceItems: { _0: 'x' } } } },
  },
]

const names = (nodes: readonly ArcNode[]): unknown[] =>
  nodes.map((node) => {
    switch (node.kind) {
      case 'tab':
        return node.url
      case 'folder':
        return { [node.name]: names(node.children) }
      case 'split':
        return { split: node.tabs.map((entry) => entry.url) }
    }
  })

const tabsOf = (data: Data, ids: readonly string[]): Tab[] =>
  flattenTabs(data, ids).flatMap((id) => {
    const item = data.items[id]
    return item?.kind === 'tab' ? [item] : []
  })

const freshData = (): Data => {
  const data = createInitialData('personal')
  data.windows.w1 = {
    id: 'w1',
    kind: 'main',
    spaceId: 'personal',
    activeBySpace: {},
    sidebarHidden: false,
    bounds: null,
    peekTabId: null,
    littleTabId: null,
  }
  return data
}

const savedTab = (id: string, url: string): Item => ({
  kind: 'tab',
  id,
  url,
  title: url,
  favicon: null,
  savedUrl: url,
  savedTitle: url,
  customTitle: null,
  createdAt: 0,
  lastActiveAt: 0,
})

describe('parseArcSidebar', () => {
  const arc = parseArcSidebar(fixture)

  it('reads every space in order with its name and profile', () => {
    expect(arc.spaces.map((entry) => entry.name)).toEqual(['Home', 'Work', 'Reading'])
    expect(arc.spaces.map((entry) => entry.profile)).toEqual([
      { kind: 'default' },
      { kind: 'custom', name: 'Profile 1' },
      { kind: 'default' },
    ])
  })

  it('keeps emoji icons and drops symbol icons', () => {
    expect(arc.spaces.map((entry) => entry.icon)).toEqual(['🏠', null, '📚'])
  })

  it('derives a hex color from the mid tone and clamps out of range channels', () => {
    expect(arc.spaces.map((entry) => entry.color)).toEqual(['#3366cc', null, '#ff0080'])
  })

  it('preserves nested folders in order and skips easels and arc urls', () => {
    expect(names(arc.spaces[0]?.pinned ?? [])).toEqual([
      'https://news.example.com/',
      { Projects: [{ Archive: ['https://old.example.com/'] }, 'https://docs.example.com/'] },
    ])
  })

  it('keeps custom tab titles', () => {
    const first = arc.spaces[0]?.pinned[0]
    expect(first).toMatchObject({ kind: 'tab', title: 'News', customTitle: 'My News' })
  })

  it('reads today tabs, split views and children only linked by parent', () => {
    expect(names(arc.spaces[0]?.today ?? [])).toEqual([
      'https://search.example.com/?q=ante',
      { split: ['https://left.example.com/', 'https://right.example.com/'] },
      'https://orphan.example.com/',
    ])
  })

  it('understands the newer container id format and ignores missing children', () => {
    expect(names(arc.spaces[1]?.pinned ?? [])).toEqual(['https://wiki.example.com/'])
    expect(arc.spaces[1]?.today).toEqual([])
    expect(arc.spaces[2]?.today).toEqual([])
  })

  it('collects favorites per profile', () => {
    expect(
      arc.favorites.map((entry) => ({
        profile: entry.profile,
        urls: entry.tabs.map((item) => item.url),
      })),
    ).toEqual([
      {
        profile: { kind: 'default' },
        urls: [
          'https://mail.example.com/',
          'https://calendar.example.com/',
          'https://mail.example.com/',
        ],
      },
      { profile: { kind: 'custom', name: 'Profile 1' }, urls: ['https://tracker.example.com/'] },
    ])
  })

  it.each([null, 42, 'text', [], {}, { sidebar: {} }, { sidebar: { containers: 'nope' } }])(
    'rejects input that is not an Arc sidebar: %j',
    (input) => {
      expect(() => parseArcSidebar(input)).toThrow()
    },
  )

  it('rejects a sidebar without spaces', () => {
    expect(() => parseArcSidebar({ sidebar: { containers: [{ global: {} }] } })).toThrow()
  })

  it('tolerates malformed spaces, items and favorites', () => {
    const arc = parseArcSidebar(
      sidebar({
        spaces: [
          'bad',
          { title: 'no id' },
          'ok',
          {
            id: 'ok',
            title: 42,
            profile: { custom: { _0: {} } },
            containerIDs: ['pinned', 7, 'unpinned'],
            customInfo: { iconType: { emoji_v2: '' }, windowTheme: { primaryColorPalette: 1 } },
          },
        ],
        items: 'not a list',
        topAppsContainerIDs: [{ default: true }, 'missing'],
      }),
    )
    expect(arc).toEqual({
      spaces: [
        {
          name: '',
          icon: null,
          color: null,
          profile: { kind: 'default' },
          pinned: [],
          today: [],
        },
      ],
      favorites: [],
    })
  })

  it('reads numeric emoji code points', () => {
    const arc = parseArcSidebar(
      sidebar({
        spaces: space('s', 'p', 'u', { customInfo: { iconType: { emoji: 0x1f3af } } }),
        items: [],
      }),
    )
    expect(arc.spaces[0]?.icon).toBe('🎯')
  })

  it('survives cycles between items', () => {
    const arc = parseArcSidebar(
      sidebar({
        spaces: space('s', 'p', 'u'),
        items: [
          ...containerItem('p', ['a']),
          'a',
          { id: 'a', parentID: 'p', childrenIds: ['b'], title: 'A', data: { list: {} } },
          'b',
          { id: 'b', parentID: 'a', childrenIds: ['a'], title: 'B', data: { list: {} } },
        ],
      }),
    )
    expect(names(arc.spaces[0]?.pinned ?? [])).toEqual([{ A: [{ B: [] }] }])
  })
})

describe('arcImportToBundle', () => {
  const bundle = bundleFrom(parseArcSidebar(fixture))

  it('creates one space per Arc space', () => {
    expect(bundle.spaces.map((entry) => [entry.name, entry.icon, entry.color])).toEqual([
      ['Home', '🏠', '#3366cc'],
      ['Work', null, '#1f9e8f'],
      ['Reading', '📚', '#ff0080'],
    ])
  })

  it('maps the default profile and creates custom profiles by name', () => {
    expect(bundle.profiles).toEqual([
      { id: 'default', name: 'Default' },
      { id: expect.any(String) as string, name: 'Profile 1' },
    ])
    const custom = bundle.profiles[1]?.id ?? ''
    expect(bundle.spaces.map((entry) => entry.profileId)).toEqual(['default', custom, 'default'])
    expect(Object.keys(bundle.favorites)).toEqual(['default', custom])
  })

  it('gives pinned and favorite tabs a saved url and leaves today tabs unsaved', () => {
    const data = mergeImport(createInitialData('personal'), bundle).data
    const home = data.spaces[bundle.spaces[0]?.id ?? '']
    expect(home).toBeDefined()
    const pinned = tabsOf(data, home?.pinned ?? [])
    const today = tabsOf(data, home?.today ?? [])
    expect(pinned.every((entry) => entry.savedUrl === entry.url)).toBe(true)
    expect(today.every((entry) => entry.savedUrl === null)).toBe(true)
    expect([...pinned, ...today].every((entry) => entry.lastActiveAt === 1000)).toBe(true)
  })

  it('turns Arc split views into Ante splits', () => {
    const today = bundle.spaces[0]?.today ?? []
    const split = bundle.items[today[1] ?? '']
    expect(split).toMatchObject({ kind: 'split', sizes: [0.5, 0.5] })
  })

  it('flattens folders outside pinned and oversized splits', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      kind: 'tab' as const,
      url: `https://${index}.example.com/`,
      title: '',
      customTitle: null,
    }))
    const result = bundleFrom({
      spaces: [
        {
          name: 'S',
          icon: null,
          color: null,
          profile: { kind: 'default' },
          pinned: [{ kind: 'split', tabs: many }],
          today: [{ kind: 'folder', name: 'F', children: many.slice(0, 2) }],
        },
      ],
      favorites: [
        { profile: { kind: 'default' }, tabs: flattenArcTabs([{ kind: 'split', tabs: many }]) },
      ],
    })
    const kinds = (ids: readonly string[]) => ids.map((id) => result.items[id]?.kind)
    expect(kinds(result.spaces[0]?.pinned ?? [])).toEqual(Array(5).fill('tab'))
    expect(kinds(result.spaces[0]?.today ?? [])).toEqual(['tab', 'tab'])
    expect(kinds(result.favorites.default ?? [])).toEqual(Array(5).fill('tab'))
  })

  it('names unnamed spaces and folders', () => {
    const result = bundleFrom({
      spaces: [
        {
          name: '',
          icon: null,
          color: null,
          profile: { kind: 'default' },
          pinned: [{ kind: 'folder', name: '', children: [] }],
          today: [],
        },
      ],
      favorites: [],
    })
    expect(result.spaces[0]?.name).toBe('Arc Space 1')
    expect(result.items[result.spaces[0]?.pinned[0] ?? '']).toMatchObject({ name: 'Folder' })
  })
})

describe('applyImport', () => {
  const bundle = bundleFrom(parseArcSidebar(fixture))

  it('produces data that passes the schema and survives sanitize unchanged', () => {
    const { data } = mergeImport(freshData(), bundle)
    expect(dataSchema.safeParse(data).success).toBe(true)
    expect(sanitize(data, 'fallback')).toEqual(data)
  })

  it('replaces the untouched starter space on first import', () => {
    const { data, spaceIds, tabCount } = mergeImport(freshData(), bundle)
    expect(data.spaceOrder).toEqual(spaceIds)
    expect(data.spaces.personal).toBeUndefined()
    expect(data.windows.w1?.spaceId).toBe(spaceIds[0])
    expect(tabCount).toBe(12)
  })

  it('adds spaces next to existing data without wiping it', () => {
    const existing = freshData()
    existing.items.kept = savedTab('kept', 'https://kept.example.com/')
    existing.spaces.personal?.pinned.push('kept')
    const { data, spaceIds } = mergeImport(existing, bundle)
    expect(data.spaceOrder).toEqual(['personal', ...spaceIds])
    expect(data.items.kept).toEqual(existing.items.kept)
    expect(data.windows.w1?.spaceId).toBe('personal')
  })

  it('dedupes favorites by url against existing favorites and within the import', () => {
    const existing = freshData()
    existing.items.mail = savedTab('mail', 'https://mail.example.com/')
    existing.favorites.default = ['mail']
    const { data } = mergeImport(existing, bundle)
    expect(tabsOf(data, data.favorites.default ?? []).map((entry) => entry.url)).toEqual([
      'https://mail.example.com/',
      'https://calendar.example.com/',
    ])
    expect(data.favorites.default?.[0]).toBe('mail')
  })

  it('assigns favorites to the matching profile', () => {
    const { data } = mergeImport(freshData(), bundle)
    const work = Object.values(data.profiles).find((profile) => profile.name === 'Profile 1')
    expect(work).toBeDefined()
    expect(tabsOf(data, data.favorites[work?.id ?? ''] ?? []).map((entry) => entry.url)).toEqual([
      'https://tracker.example.com/',
    ])
    expect(data.spaces[bundle.spaces[1]?.id ?? '']?.profileId).toBe(work?.id)
  })

  it('reuses a profile with the same name and does not duplicate favorites on reimport', () => {
    const first = mergeImport(freshData(), bundle).data
    const second = mergeImport(first, bundleFrom(parseArcSidebar(fixture), 'again'))
    expect(Object.keys(second.data.profiles)).toHaveLength(2)
    expect(second.data.spaceOrder).toHaveLength(6)
    for (const [profileId, ids] of Object.entries(second.data.favorites)) {
      expect(ids).toEqual(first.favorites[profileId])
    }
  })

  it('runs through the reducer as an internal action', () => {
    const state = createAppState(freshData())
    reduce(state, { type: 'data/import', bundle })
    expect(state.data).toEqual(mergeImport(freshData(), bundle).data)
  })

  it('does not mutate the input when merging', () => {
    const existing = freshData()
    const before = structuredClone(existing)
    mergeImport(existing, bundle)
    expect(existing).toEqual(before)
  })

  it('handles an empty import', () => {
    const empty: ImportBundle = { profiles: [], spaces: [], items: {}, favorites: {} }
    const existing = freshData()
    const data = structuredClone(existing)
    expect(applyImport(data, empty)).toEqual({ spaceIds: [], tabCount: 0 })
    expect(data).toEqual(existing)
  })
})
