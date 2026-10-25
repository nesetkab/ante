import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPLE_EPOCH_OFFSET_MS,
  arcImportToBundle,
  flattenArcTabs,
  parseArcArchive,
  parseArcProfileNames,
  parseArcRouting,
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

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/arc', name), 'utf8'))

const fixture = readFixture('StorableSidebar.json')

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

  it('keeps emoji icons and drops symbols Arc does not have', () => {
    expect(arc.spaces.map((entry) => entry.icon)).toEqual(['🏠', null, '📚'])
  })

  it('keeps Arc symbol icons', () => {
    const parsed = parseArcSidebar(
      sidebar({
        spaces: space('s', 'p', 'u', { customInfo: { iconType: { icon: 'chatBubbleEllipses' } } }),
        items: [],
      }),
    )
    expect(parsed.spaces[0]?.icon).toBe('symbol:chatBubbleEllipses')
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
          arcId: 'ok',
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
          arcId: 'S',
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
          arcId: 'blank',
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

describe('arc extras', () => {
  const full = (): ArcImport => ({
    ...parseArcSidebar(fixture),
    archive: parseArcArchive(readFixture('StorableArchiveItems.json')),
    routing: parseArcRouting(readFixture('StorableLinkRouting.json')),
    profileNames: parseArcProfileNames(readFixture('User Data/Local State')),
  })

  it('reads archived tabs newest first with real dates and skips non tabs', () => {
    const archive = parseArcArchive(readFixture('StorableArchiveItems.json'))
    expect(archive).toEqual([
      {
        url: 'https://news.ycombinator.com/',
        title: 'HN',
        arcSpaceId: null,
        archivedAt: 810_000_000_000 + APPLE_EPOCH_OFFSET_MS,
      },
      {
        url: 'https://linear.app/',
        title: 'Linear',
        arcSpaceId: 'space-work',
        archivedAt: 800_000_000_000 + APPLE_EPOCH_OFFSET_MS,
      },
    ])
    expect(new Date(archive[0]?.archivedAt ?? 0).getUTCFullYear()).toBe(2026)
  })

  it('reads link rules it can express and the fallback destination', () => {
    const routing = parseArcRouting(readFixture('StorableLinkRouting.json'))
    expect(routing).toEqual({
      routes: [
        {
          match: { kind: 'contains', value: 'figma.com' },
          destination: { kind: 'space', arcSpaceId: 'space-work' },
        },
        { match: { kind: 'contains', value: 'zoom.us' }, destination: { kind: 'little' } },
      ],
      externalLinks: 'space',
    })
  })

  it('turns exact and prefix matches into safe patterns', () => {
    const rule = (kind: string, value: string) => ({
      sourceComponents: [{ componentType: { urlMatch: { _0: { [kind]: {} }, _1: value } } }],
      destination: { littleArc: {} },
    })
    const routing = parseArcRouting({
      defaultDestination: { littleArc: {} },
      rules: [rule('startsWith', 'https://a.b/?'), rule('hostname', 'x.com'), rule('odd', 'y')],
    })
    expect(routing.externalLinks).toBe('little')
    expect(routing.routes.map((route) => route.match)).toEqual([
      { kind: 'regex', value: '^https://a\\.b/\\?' },
      { kind: 'domain', value: 'x.com' },
    ])
  })

  it('tolerates missing or broken files', () => {
    expect(parseArcArchive(null)).toEqual([])
    expect(parseArcArchive({ items: ['x', { archivedAt: 'no' }] })).toEqual([])
    expect(parseArcRouting(undefined)).toEqual({ routes: [], externalLinks: null })
    expect(parseArcProfileNames({ profile: {} })).toEqual({})
  })

  it('names custom profiles the way Arc shows them', () => {
    expect(parseArcProfileNames(readFixture('User Data/Local State'))).toEqual({
      'Profile 1': 'Work',
    })
    const bundle = bundleFrom(full())
    expect(bundle.profiles.map((profile) => profile.name).sort()).toEqual(['Default', 'Work'])
  })

  it('brings archive and rules into the matching spaces', () => {
    const bundle = bundleFrom(full())
    const { data } = mergeImport(freshData(), bundle)
    const spaceNamed = (name: string) =>
      Object.values(data.spaces).find((candidate) => candidate.name === name)?.id
    expect(data.archive.map((entry) => [entry.title, entry.spaceId])).toEqual([
      ['HN', spaceNamed('Home')],
      ['Linear', spaceNamed('Work')],
    ])
    expect(data.routes.map((route) => [route.match.value, route.target])).toEqual([
      ['figma.com', 'space'],
      ['zoom.us', 'little'],
    ])
    expect(data.routes[0]?.spaceId).toBe(spaceNamed('Work'))
    expect(data.settings.externalLinks).toBe('space')
    expect(dataSchema.safeParse(data).success).toBe(true)
    expect(sanitize(data, 'fallback')).toEqual(data)
  })

  it('does not duplicate archive entries or rules on reimport', () => {
    const first = mergeImport(freshData(), bundleFrom(full(), 'a')).data
    const second = mergeImport(first, bundleFrom(full(), 'b')).data
    expect(second.archive).toHaveLength(2)
    expect(second.routes).toHaveLength(2)
  })

  it('never puts Arc data into a private profile with the same name', () => {
    const data = freshData()
    data.profiles['private-1'] = { id: 'private-1', name: 'Work' }
    const { data: merged } = mergeImport(data, bundleFrom(full()))
    const work = Object.values(merged.profiles).find(
      (profile) => profile.name === 'Work' && profile.id !== 'private-1',
    )
    expect(work).toBeDefined()
    expect(Object.values(merged.spaces).every((entry) => entry.profileId !== 'private-1')).toBe(
      true,
    )
  })

  it('reuses a profile imported earlier under its Arc folder name', () => {
    const data = freshData()
    data.profiles.old = { id: 'old', name: 'Profile 1' }
    data.favorites.old = []
    const { data: merged } = mergeImport(data, bundleFrom(full()))
    expect(Object.values(merged.profiles).map((profile) => profile.name)).not.toContain('Work')
    const work = Object.values(merged.spaces).find((entry) => entry.name === 'Work')
    expect(work?.profileId).toBe('old')
  })

  it('only takes the external links setting on a first import', () => {
    const existing = freshData()
    existing.items.kept = savedTab('kept', 'https://kept.example.com/')
    existing.spaces.personal?.pinned.push('kept')
    const { data } = mergeImport(existing, bundleFrom(full()))
    expect(data.settings.externalLinks).toBe('little')
  })
})
