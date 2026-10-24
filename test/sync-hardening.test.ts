import { describe, expect, it } from 'vitest'
import type { Data, Route } from '@shared/schema'
import { createInitialData } from '@shared/state/initial'
import {
  createDeviceFile,
  isFreshDevice,
  isSafeSyncedRoute,
  syncCycle,
  syncSnapshot,
  TOMBSTONE_TTL_MS,
  touchesSyncedData,
} from '@shared/sync'
import { buildData } from './helpers'

const DAY = 24 * 60 * 60 * 1000

function withBoost(data: Data, js: string): Data {
  return {
    ...data,
    boosts: {
      b: {
        id: 'b',
        name: 'B',
        domain: 'example.com',
        enabled: true,
        css: 'body{}',
        js,
        zaps: [],
        fontFamily: null,
        tintHue: null,
        invert: false,
      },
    },
  }
}

describe('stale devices', () => {
  it('ignores device files older than the tombstone window', () => {
    const now = 100 * DAY
    expect(isFreshDevice({ writtenAt: now - TOMBSTONE_TTL_MS - 1 }, now)).toBe(false)
    expect(isFreshDevice({ writtenAt: now - DAY }, now)).toBe(true)
  })

  it('does not resurrect spaces from an abandoned device', () => {
    const old = buildData({ spaces: { s1: {}, ghost: { name: 'Ghost' } } })
    const oldFile = createDeviceFile('old', 'Old', syncSnapshotEntities(old), 0)
    const local = buildData({ spaces: { s1: {} } })
    const result = syncCycle({
      data: local,
      deviceId: 'me',
      baseline: null,
      remotes: [oldFile],
      now: TOMBSTONE_TTL_MS + DAY,
    })
    expect(result.data.spaces.ghost).toBeUndefined()
  })
})

function syncSnapshotEntities(data: Data) {
  return Object.fromEntries(
    Object.entries(syncSnapshot(data)).map(([key, value]) => [
      key,
      { updatedAt: 1, deleted: false, value },
    ]),
  )
}

describe('untrusted sync folders', () => {
  it('never shares boost scripts', () => {
    const snapshot = syncSnapshot(withBoost(createInitialData('s'), 'alert(1)'))
    expect(snapshot['boost:b']).not.toHaveProperty('js')
  })

  it('keeps the local script when a boost arrives from another device', () => {
    const remote = createDeviceFile(
      'other',
      'Other',
      {
        'boost:b': {
          updatedAt: 5,
          deleted: false,
          value: { ...withBoost(createInitialData('x'), 'evil()').boosts.b, js: 'evil()' },
        },
      },
      5,
    )
    const local = withBoost(createInitialData('s'), 'mine()')
    const result = syncCycle({
      data: local,
      deviceId: 'me',
      baseline: {},
      remotes: [remote],
      now: 10,
    })
    expect(result.data.boosts.b?.js).toBe('mine()')
  })

  it('rejects non-web feed urls from other devices', () => {
    const remote = createDeviceFile(
      'other',
      'Other',
      {
        'item:f': {
          updatedAt: 5,
          deleted: false,
          value: {
            kind: 'folder',
            id: 'f',
            name: 'F',
            children: [],
            feedUrl: 'file:///etc/passwd',
          },
        },
      },
      5,
    )
    const result = syncCycle({
      data: createInitialData('s'),
      deviceId: 'me',
      baseline: {},
      remotes: [remote],
      now: 10,
    })
    expect(result.data.items.f).toBeUndefined()
  })

  it('drops regex routes that could hang the app', () => {
    const route = (value: string): Route => ({
      id: 'r',
      match: { kind: 'regex', value },
      spaceId: 's',
    })
    expect(isSafeSyncedRoute(route('^https://.*\\.figma\\.com'))).toBe(true)
    expect(isSafeSyncedRoute(route('(a+)+$'))).toBe(false)
    expect(isSafeSyncedRoute(route('a'.repeat(300)))).toBe(false)
  })
})

describe('touchesSyncedData', () => {
  it('ignores title and favicon churn but notices real edits', () => {
    expect(touchesSyncedData(['data', 'items', 't', 'title'])).toBe(false)
    expect(touchesSyncedData(['data', 'items', 't', 'favicon'])).toBe(false)
    expect(touchesSyncedData(['data', 'spaces', 's', 'today', 0])).toBe(false)
    expect(touchesSyncedData(['data', 'windows', 'w'])).toBe(false)
    expect(touchesSyncedData(['data', 'items', 't', 'savedUrl'])).toBe(true)
    expect(touchesSyncedData(['data', 'spaces', 's', 'pinned', 0])).toBe(true)
    expect(touchesSyncedData(['runtime', 'tabs', 't'])).toBe(false)
  })
})
