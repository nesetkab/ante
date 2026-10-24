import { produceWithPatches, enablePatches } from 'immer'
import { describe, expect, it } from 'vitest'
import type { Data, Id } from '@shared/schema'
import { createAppState, createInitialData, DEFAULT_PROFILE_ID } from '@shared/state/initial'
import type { Action } from '@shared/state/actions'
import { reduce } from '@shared/state/reducer'
import {
  applySync,
  createDeviceFile,
  deviceFileSchema,
  diffEntities,
  mergeEntities,
  pruneTombstones,
  sameEntities,
  stableStringify,
  syncCycle,
  syncSnapshot,
  TOMBSTONE_TTL_MS,
  type DeviceFile,
  type SyncEntities,
} from '@shared/sync'
import { apply, buildData, folder, makeTab, split } from './helpers'

enablePatches()

interface Device {
  id: string
  data: Data
  baseline: SyncEntities | null
  file: DeviceFile | null
}

const device = (id: string, data: Data): Device => ({ id, data, baseline: null, file: null })

function sync(target: Device, peers: readonly Device[], now: number): void {
  const remotes = [target, ...peers].flatMap((peer) => (peer.file ? [peer.file] : []))
  const result = syncCycle({
    data: target.data,
    deviceId: target.id,
    baseline: target.baseline,
    remotes,
    now,
  })
  target.data = result.data
  target.baseline = result.entities
  target.file = createDeviceFile(target.id, target.id, result.entities, now)
}

function edit(target: Device, ...actions: Action[]): void {
  target.data = apply(createAppState(target.data), ...actions).data
}

const tabIds = (data: Data, ids: readonly Id[]): Id[] =>
  ids.filter((id) => data.items[id]?.kind === 'tab')

function seeded(): Data {
  const data = buildData({
    spaces: {
      s1: { pinned: [folder('f', ['p1', 'p2']), 'p3', split('sp', ['p4', 'p5'])], today: ['t1'] },
      s2: { name: 'Work', pinned: ['w1'] },
    },
    favorites: { [DEFAULT_PROFILE_ID]: ['fav'] },
    windows: { win: { spaceId: 's1', active: 't1' } },
  })
  data.archive = [
    {
      id: 'old',
      url: 'https://old.test/',
      title: 'Old',
      favicon: null,
      spaceId: 's1',
      archivedAt: 1,
    },
  ]
  data.closed = [
    {
      tab: makeTab('gone'),
      location: { container: { type: 'today', spaceId: 's1' }, index: 0 },
      closedAt: 1,
    },
  ]
  data.sitePermissions = { [DEFAULT_PROFILE_ID]: { 'https://cam.test': { camera: 'allow' } } }
  return data
}

function pair(): { a: Device; b: Device } {
  const a = device('device-a', seeded())
  const b = device('device-b', createInitialData('fresh'))
  sync(a, [b], 1000)
  sync(b, [a], 2000)
  sync(a, [b], 3000)
  return { a, b }
}

describe('stableStringify', () => {
  it('ignores key order and undefined values', () => {
    expect(stableStringify({ b: 1, a: [1, { d: undefined, c: 2 }] })).toBe(
      stableStringify({ a: [1, { c: 2 }], b: 1 }),
    )
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
  })
})

describe('syncSnapshot', () => {
  it('captures pinned items, favorites, spaces and the safe settings', () => {
    const snapshot = syncSnapshot(seeded())
    expect(
      Object.keys(snapshot)
        .filter((key) => key.startsWith('item:'))
        .sort(),
    ).toEqual(['f', 'fav', 'p1', 'p2', 'p3', 'p4', 'p5', 'sp', 'w1'].map((id) => `item:${id}`))
    expect(snapshot['space:s1']).toMatchObject({ pinned: ['f', 'p3', 'sp'] })
    expect(snapshot['space:s1']).not.toHaveProperty('today')
    expect(snapshot[`favorites:${DEFAULT_PROFILE_ID}`]).toEqual(['fav'])
    expect(snapshot.spaceOrder).toEqual(['s1', 's2'])
    expect(snapshot.settings).toEqual({
      searchEngine: 'google',
      archiveAfter: '12h',
      theme: 'system',
      sidebarSide: 'left',
      adblock: true,
      peekExternalLinks: true,
      externalLinks: 'little',
    })
  })

  it('keeps saved state of tabs but not their live url', () => {
    const data = seeded()
    const tab = data.items.p1
    if (tab?.kind !== 'tab') throw new Error('expected tab')
    tab.url = 'https://elsewhere.test/'
    tab.customTitle = 'Mine'
    expect(syncSnapshot(data)['item:p1']).toEqual({
      kind: 'tab',
      id: 'p1',
      savedUrl: 'https://p1.test/',
      savedTitle: 'p1',
      customTitle: 'Mine',
      createdAt: 0,
    })
  })

  it('leaves out today tabs, windows, archive, closed tabs and permissions', () => {
    const json = JSON.stringify(syncSnapshot(seeded()))
    for (const word of ['t1', 'win', 'old.test', 'gone', 'cam.test', 'sidebarWidth', '"folder":']) {
      expect(json).not.toContain(word)
    }
  })

  it('never includes private profiles, spaces or their tabs', () => {
    const state = apply(createAppState(seeded()), {
      type: 'private/create',
      profileId: 'private-1',
      spaceId: 'ps',
    })
    const data = apply(
      state,
      {
        type: 'tab/create',
        tab: makeTab('secret', { url: 'https://secret.test/' }),
        to: { type: 'today', spaceId: 'ps' },
        index: 0,
      },
      { type: 'item/move', id: 'secret', to: { type: 'pinned', spaceId: 'ps' }, index: 0 },
    ).data
    expect(data.spaces.ps?.pinned).toEqual(['secret'])
    const json = JSON.stringify(syncSnapshot(data))
    expect(json).not.toContain('private-1')
    expect(json).not.toContain('secret')
    expect(json).not.toContain('"ps"')
  })

  it('syncs live folders without their generated children', () => {
    const data = seeded()
    const live = data.items.f
    if (live?.kind !== 'folder') throw new Error('expected folder')
    live.feedUrl = 'https://feed.test/rss'
    const snapshot = syncSnapshot(data)
    expect(snapshot['item:f']).toMatchObject({ children: [], feedUrl: 'https://feed.test/rss' })
    expect(snapshot['item:p1']).toBeUndefined()
  })

  it('includes notes only when a synced tab points at them', () => {
    const data = seeded()
    data.notes = {
      shared: { id: 'shared', title: 'Plan', body: 'x', updatedAt: 1, private: false },
      local: { id: 'local', title: 'Scratch', body: 'y', updatedAt: 1, private: false },
    }
    data.items.p3 = makeTab('p3', { url: 'ante:note/shared', savedUrl: 'ante:note/shared' })
    data.items.t1 = makeTab('t1', { url: 'ante:note/local' })
    const snapshot = syncSnapshot(data)
    expect(snapshot['note:shared']).toMatchObject({ title: 'Plan' })
    expect(snapshot['note:local']).toBeUndefined()
  })
})

describe('diffEntities', () => {
  it('keeps timestamps of unchanged entities and bumps changed ones', () => {
    const first = diffEntities({ a: 1, b: { x: 1 } }, {}, 100)
    expect(first).toEqual({
      a: { updatedAt: 100, deleted: false, value: 1 },
      b: { updatedAt: 100, deleted: false, value: { x: 1 } },
    })
    const second = diffEntities({ a: 1, b: { x: 2 } }, first, 200)
    expect(second.a).toBe(first.a)
    expect(second.b).toEqual({ updatedAt: 200, deleted: false, value: { x: 2 } })
  })

  it('always moves timestamps forward even when the clock lags', () => {
    const first = diffEntities({ a: 1 }, {}, 500)
    expect(diffEntities({ a: 2 }, first, 100).a?.updatedAt).toBe(501)
  })

  it('turns removed entities into tombstones and keeps them until they expire', () => {
    const first = diffEntities({ a: 1, b: 2 }, {}, 100)
    const second = diffEntities({ a: 1 }, first, 200)
    expect(second.b).toEqual({ updatedAt: 200, deleted: true, value: null })
    const third = diffEntities({ a: 1 }, second, 300)
    expect(third.b).toBe(second.b)
    expect(diffEntities({ a: 1 }, third, 200 + TOMBSTONE_TTL_MS + 1).b).toBeUndefined()
  })

  it('revives a tombstoned entity with a newer timestamp', () => {
    const gone = { b: { updatedAt: 200, deleted: true, value: null } }
    expect(diffEntities({ b: 3 }, gone, 150).b).toEqual({
      updatedAt: 201,
      deleted: false,
      value: 3,
    })
  })
})

describe('mergeEntities', () => {
  const entity = (updatedAt: number, value: unknown, deleted = false) => ({
    updatedAt,
    deleted,
    value,
  })

  it('picks the newest version of each entity', () => {
    const merged = mergeEntities(
      [
        { deviceId: 'a', entities: { x: entity(1, 'a'), y: entity(5, 'a') } },
        { deviceId: 'b', entities: { x: entity(2, 'b'), y: entity(4, 'b'), z: entity(1, 'b') } },
      ],
      10,
    )
    expect(merged).toEqual({ x: entity(2, 'b'), y: entity(5, 'a'), z: entity(1, 'b') })
  })

  it('breaks ties by device id regardless of order', () => {
    const sources = [
      { deviceId: 'a', entities: { x: entity(1, 'a') } },
      { deviceId: 'b', entities: { x: entity(1, 'b') } },
    ]
    expect(mergeEntities(sources, 10).x?.value).toBe('b')
    expect(mergeEntities([...sources].reverse(), 10).x?.value).toBe('b')
  })

  it('lets newer tombstones win and drops expired ones', () => {
    const merged = mergeEntities(
      [
        { deviceId: 'a', entities: { x: entity(1, 'a'), y: entity(1, 'a', true) } },
        { deviceId: 'b', entities: { x: entity(2, null, true) } },
      ],
      1 + TOMBSTONE_TTL_MS + 1,
    )
    expect(merged.x).toEqual(entity(2, null, true))
    expect(merged.y).toBeUndefined()
    expect(pruneTombstones({ y: entity(1, null, true) }, 2)).toEqual({ y: entity(1, null, true) })
  })
})

describe('deviceFileSchema', () => {
  it('rejects unknown versions and unexpected keys', () => {
    const file = createDeviceFile('dev', 'Mac', {}, 1)
    expect(deviceFileSchema.safeParse(file).success).toBe(true)
    expect(deviceFileSchema.safeParse({ ...file, schemaVersion: 2 }).success).toBe(false)
    expect(deviceFileSchema.safeParse({ ...file, deviceId: '../evil' }).success).toBe(false)
    const hostile = JSON.parse(
      '{"schemaVersion":1,"deviceId":"x","deviceName":"x","writtenAt":1,"entities":{"__proto__":{"updatedAt":1,"deleted":false,"value":1}}}',
    ) as unknown
    expect(Object.keys(deviceFileSchema.safeParse(hostile).data?.entities ?? {})).toEqual([])
    const unknownKey = {
      ...file,
      entities: { 'window:w': { updatedAt: 1, deleted: false, value: 1 } },
    }
    expect(deviceFileSchema.safeParse(unknownKey).success).toBe(false)
  })
})

describe('applySync', () => {
  it('ignores values that fail validation or name unsafe ids', () => {
    const data = seeded()
    const next = applySync(data, {
      'item:p1': { updatedAt: 9, deleted: false, value: { kind: 'tab', id: 'p1' } },
      'item:__proto__': {
        updatedAt: 9,
        deleted: false,
        value: {
          kind: 'tab',
          id: '__proto__',
          savedUrl: null,
          savedTitle: null,
          customTitle: null,
          createdAt: 0,
        },
      },
      'space:s1': { updatedAt: 9, deleted: false, value: { id: 'other', name: 'x' } },
    })
    expect(next).toEqual(data)
  })

  it('produces no patches when the data already matches', () => {
    const { a } = pair()
    const merged = a.baseline ?? {}
    const state = createAppState(a.data)
    const [, patches] = produceWithPatches(state, (draft) => {
      reduce(draft, { type: 'sync/apply', entities: merged, dropSpaces: [] })
    })
    expect(patches).toEqual([])
  })

  it('keeps open tabs, peeks and little windows that are not in the sidebar', () => {
    const data = seeded()
    data.items.peek = makeTab('peek')
    data.items.little = makeTab('little')
    data.windows.win = { ...data.windows.win, peekTabId: 'peek' } as Data['windows'][string]
    data.windows.lw = {
      id: 'lw',
      kind: 'little',
      spaceId: 's1',
      activeBySpace: {},
      sidebarHidden: false,
      bounds: null,
      peekTabId: null,
      littleTabId: 'little',
    }
    const next = applySync(data, mergeEntities([], 0))
    expect(next.items.peek).toBeDefined()
    expect(next.items.little).toBeDefined()
    expect(next.windows.lw?.littleTabId).toBe('little')
  })

  it('never touches private spaces even if a device file names them', () => {
    const data = apply(createAppState(seeded()), {
      type: 'private/create',
      profileId: 'private-1',
      spaceId: 'ps',
    }).data
    const next = applySync(data, {
      'space:ps': {
        updatedAt: 9,
        deleted: false,
        value: { id: 'ps', name: 'Hacked', icon: null, color: '#000000', profileId: 'default' },
      },
      'profile:private-1': { updatedAt: 9, deleted: true, value: null },
      'space:s2': {
        updatedAt: 9,
        deleted: false,
        value: { id: 's2', name: 'Leak', icon: null, color: '#000000', profileId: 'private-1' },
      },
    })
    expect(next.spaces.ps?.name).toBe('Private')
    expect(next.profiles['private-1']).toBeDefined()
    expect(next.spaces.s2?.profileId).toBe(DEFAULT_PROFILE_ID)
    expect(next.spaces.s2?.name).toBe('Work')
  })
})

describe('syncing two devices', () => {
  it('brings a fresh device in line without overwriting the existing setup', () => {
    const { a, b } = pair()
    expect(b.data.spaceOrder).toEqual(['s1', 's2'])
    expect(b.data.spaces.fresh).toBeUndefined()
    expect(b.data.spaces.s1?.pinned).toEqual(['f', 'p3', 'sp'])
    expect(b.data.favorites[DEFAULT_PROFILE_ID]).toEqual(['fav'])
    expect(a.data.favorites[DEFAULT_PROFILE_ID]).toEqual(['fav'])
    expect(a.data.spaceOrder).toEqual(['s1', 's2'])
    const tab = b.data.items.p1
    expect(tab).toMatchObject({
      kind: 'tab',
      url: 'https://p1.test/',
      savedUrl: 'https://p1.test/',
    })
  })

  it('moves the windows of a fresh device onto the synced spaces', () => {
    const a = device('device-a', seeded())
    const fresh = createInitialData('fresh')
    fresh.windows.w = {
      id: 'w',
      kind: 'main',
      spaceId: 'fresh',
      activeBySpace: {},
      sidebarHidden: false,
      bounds: null,
      peekTabId: null,
      littleTabId: null,
    }
    const b = device('device-b', fresh)
    edit(b, {
      type: 'tab/create',
      tab: makeTab('btoday'),
      to: { type: 'today', spaceId: 'fresh' },
      index: 0,
    })
    sync(a, [b], 1000)
    sync(b, [a], 2000)
    expect(b.data.windows.w?.spaceId).toBe('s1')
    expect(b.data.spaces.s1?.today).toContain('btoday')
  })

  it('merges a device that already has its own spaces', () => {
    const a = device('device-a', seeded())
    const b = device(
      'device-b',
      buildData({ spaces: { mine: { pinned: ['m1'] } }, favorites: { default: ['bfav'] } }),
    )
    edit(b, { type: 'settings/update', patch: { theme: 'dark' } })
    sync(a, [b], 1000)
    sync(b, [a], 2000)
    sync(a, [b], 3000)
    for (const peer of [a, b]) {
      expect(peer.data.spaceOrder).toEqual(['s1', 's2', 'mine'])
      expect(peer.data.favorites[DEFAULT_PROFILE_ID]).toEqual(['fav', 'bfav'])
      expect(peer.data.settings.theme).toBe('system')
      expect(peer.data.items.m1).toBeDefined()
    }
  })

  it('does not ping-pong once both devices agree', () => {
    const { a, b } = pair()
    const before = { a: a.file, b: b.file, aData: a.data, bData: b.data }
    sync(b, [a], 10_000)
    sync(a, [b], 11_000)
    sync(b, [a], 12_000)
    expect(sameEntities(a.file?.entities ?? {}, before.a?.entities ?? {})).toBe(true)
    expect(sameEntities(b.file?.entities ?? {}, before.b?.entities ?? {})).toBe(true)
    expect(a.data).toEqual(before.aData)
    expect(b.data).toEqual(before.bData)
  })

  it('keeps timestamps of entities received from the other device', () => {
    const { a, b } = pair()
    edit(a, { type: 'folder/rename', id: 'f', name: 'Reading' })
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    sync(a, [b], 7000)
    expect(b.file?.entities['item:f']?.updatedAt).toBe(5000)
    expect(a.file?.entities['item:f']?.updatedAt).toBe(5000)
    expect(b.data.items.f).toMatchObject({ name: 'Reading' })
  })

  it('keeps concurrent edits to different entities', () => {
    const { a, b } = pair()
    edit(a, { type: 'space/update', id: 's1', patch: { name: 'Home' } })
    edit(b, { type: 'folder/rename', id: 'f', name: 'Later' })
    sync(a, [b], 5000)
    sync(b, [a], 5001)
    sync(a, [b], 5002)
    for (const peer of [a, b]) {
      expect(peer.data.spaces.s1?.name).toBe('Home')
      expect(peer.data.items.f).toMatchObject({ name: 'Later' })
    }
  })

  it('lets the newer edit win on the same entity', () => {
    const { a, b } = pair()
    edit(a, { type: 'tab/rename', id: 'p1', title: 'From A' })
    edit(b, { type: 'tab/rename', id: 'p1', title: 'From B' })
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    sync(a, [b], 7000)
    for (const peer of [a, b]) expect(peer.data.items.p1).toMatchObject({ customTitle: 'From B' })
  })

  it('follows a new saved url without moving a tab the user navigated away', () => {
    const { a, b } = pair()
    edit(b, { type: 'tab/update', id: 'p2', patch: { url: 'https://browsing.test/' } })
    edit(
      a,
      { type: 'tab/update', id: 'p1', patch: { url: 'https://new.test/', title: 'New' } },
      { type: 'tab/setSavedUrl', id: 'p1' },
      { type: 'tab/update', id: 'p2', patch: { url: 'https://moved.test/', title: 'Moved' } },
      { type: 'tab/setSavedUrl', id: 'p2' },
    )
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    expect(b.data.items.p1).toMatchObject({
      url: 'https://new.test/',
      savedUrl: 'https://new.test/',
    })
    expect(b.data.items.p2).toMatchObject({
      url: 'https://browsing.test/',
      savedUrl: 'https://moved.test/',
    })
  })

  it('removes tabs the other device unpinned and spaces it deleted', () => {
    const { a, b } = pair()
    edit(a, { type: 'tab/unpin', id: 'p3', spaceId: 's1' }, { type: 'space/delete', id: 's2' })
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    expect(a.data.spaces.s1?.today).toContain('p3')
    expect(b.data.items.p3).toBeUndefined()
    expect(b.data.spaces.s1?.pinned).toEqual(['f', 'sp'])
    expect(b.data.spaces.s2).toBeUndefined()
    expect(b.data.items.w1).toBeUndefined()
    expect(b.data.spaceOrder).toEqual(['s1'])
    expect(b.file?.entities['space:s2']).toMatchObject({ deleted: true, updatedAt: 5000 })
  })

  it('leaves today tabs, windows and archive of each device alone', () => {
    const { a, b } = pair()
    edit(b, {
      type: 'tab/create',
      tab: makeTab('btab'),
      to: { type: 'today', spaceId: 's1' },
      index: 0,
    })
    edit(a, { type: 'space/update', id: 's1', patch: { color: '#d64545' } })
    sync(b, [a], 5000)
    sync(a, [b], 6000)
    sync(b, [a], 7000)
    expect(b.data.spaces.s1?.today).toEqual(['btab'])
    expect(b.data.spaces.s1?.color).toBe('#d64545')
    expect(a.data.spaces.s1?.today).toEqual(['t1'])
    expect(a.data.items.btab).toBeUndefined()
    expect(a.data.windows.win?.activeBySpace.s1).toBe('t1')
    expect(a.data.archive).toHaveLength(1)
    expect(b.data.archive).toHaveLength(0)
    expect(tabIds(a.data, a.data.spaces.s1?.today ?? [])).toEqual(['t1'])
  })

  it('removes a note on other devices once it is deleted', () => {
    const { a, b } = pair()
    edit(
      a,
      { type: 'note/create', id: 'n1', now: 10 },
      { type: 'note/update', id: 'n1', title: 'Plan', now: 10 },
      {
        type: 'tab/create',
        tab: makeTab('nt', { url: 'ante:note/n1' }),
        to: { type: 'pinned', spaceId: 's1' },
        index: 0,
      },
    )
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    expect(b.data.notes.n1).toBeDefined()
    edit(a, { type: 'page/delete', kind: 'note', id: 'n1', now: 11 })
    sync(a, [b], 7000)
    sync(b, [a], 8000)
    expect(b.data.notes.n1).toBeUndefined()
    expect(b.data.items.nt).toBeUndefined()
  })

  it('syncs notes, boosts, routes and safe settings', () => {
    const { a, b } = pair()
    edit(
      a,
      { type: 'note/create', id: 'n1', now: 10 },
      { type: 'note/update', id: 'n1', title: 'Plan', body: 'ship it', now: 10 },
      {
        type: 'tab/create',
        tab: makeTab('nt', { url: 'ante:note/n1' }),
        to: { type: 'pinned', spaceId: 's1' },
        index: 0,
      },
      { type: 'boost/create', id: 'bo', name: 'Calm', domain: 'news.test' },
      { type: 'route/add', id: 'r1', match: { kind: 'domain', value: 'work.test' }, spaceId: 's2' },
      { type: 'settings/update', patch: { theme: 'dark', sidebarWidth: 400, autoPip: false } },
    )
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    expect(b.data.notes.n1).toMatchObject({ title: 'Plan', body: 'ship it' })
    expect(b.data.items.nt).toMatchObject({ url: 'ante:note/n1' })
    expect(b.data.boosts.bo).toMatchObject({ name: 'Calm', domain: 'news.test' })
    expect(b.data.routes).toEqual([
      { id: 'r1', match: { kind: 'domain', value: 'work.test' }, spaceId: 's2' },
    ])
    expect(b.data.settings.theme).toBe('dark')
    expect(b.data.settings.sidebarWidth).toBe(260)
    expect(b.data.settings.autoPip).toBe(true)
    expect(b.data.settings.sync).toEqual(a.data.settings.sync)
  })

  it('keeps live folder entries local to each device', () => {
    const { a, b } = pair()
    edit(a, {
      type: 'feed/create',
      id: 'feed',
      spaceId: 's1',
      name: 'Blog',
      feedUrl: 'https://blog.test/rss',
    })
    edit(a, {
      type: 'feed/sync',
      id: 'feed',
      entries: [{ id: 'e1', url: 'https://blog.test/1', title: 'One' }],
      now: 1,
    })
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    sync(a, [b], 7000)
    expect(b.data.items.feed).toMatchObject({ feedUrl: 'https://blog.test/rss', children: [] })
    expect(a.data.items.feed).toMatchObject({ children: ['e1'] })
    expect(a.data.items.e1).toBeDefined()
  })

  it('never writes private data into the device file', () => {
    const { a, b } = pair()
    edit(
      a,
      { type: 'private/create', profileId: 'private-9', spaceId: 'pspace' },
      {
        type: 'tab/create',
        tab: makeTab('hidden', { url: 'https://hidden.test/' }),
        to: { type: 'today', spaceId: 'pspace' },
        index: 0,
      },
    )
    sync(a, [b], 5000)
    sync(b, [a], 6000)
    const json = JSON.stringify(a.file)
    expect(json).not.toContain('private-9')
    expect(json).not.toContain('hidden')
    expect(a.data.spaces.pspace).toBeDefined()
    expect(a.data.items.hidden).toBeDefined()
    expect(b.data.spaces.pspace).toBeUndefined()
  })

  it('skips invalid values from peers but honours valid tombstones', () => {
    const { a, b } = pair()
    const broken = { ...createDeviceFile('device-c', 'C', {}, 1) }
    broken.entities = {
      'space:s1': { updatedAt: 99_999, deleted: false, value: 'not a space' },
      'item:p1': { updatedAt: 99_999, deleted: true, value: null },
    }
    const result = syncCycle({
      data: b.data,
      deviceId: b.id,
      baseline: b.baseline,
      remotes: [broken, ...(a.file ? [a.file] : [])],
      now: 8000,
    })
    expect(result.data.spaces.s1?.name).toBe('s1')
    expect(result.data.items.p1).toBeUndefined()
  })
})
