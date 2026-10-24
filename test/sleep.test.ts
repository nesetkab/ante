import { describe, expect, it } from 'vitest'
import type { AppState, TabRuntime } from '@shared/schema'
import { sleepThresholds, sleepyTabs } from '@shared/sleep'
import { defaultTabRuntime } from '@shared/state/reducer'
import { buildState } from './helpers'

const HOUR = sleepThresholds['1h']
const NOW = 10 * HOUR

function stateWith(runtime: Record<string, Partial<TabRuntime>>): AppState {
  const base = buildState({
    spaces: { s1: { pinned: ['kept'], today: ['old', 'fresh', 'active', 'peek', 'busy'] } },
    favorites: { default: ['fav'] },
    windows: { w: { spaceId: 's1', active: 'active', peekTabId: 'peek' } },
    tabs: {
      old: { lastActiveAt: NOW - 2 * HOUR },
      kept: { lastActiveAt: 0 },
      fav: { lastActiveAt: 0 },
      fresh: { lastActiveAt: NOW - HOUR / 2 },
      active: { lastActiveAt: 0 },
      peek: { lastActiveAt: 0 },
      busy: { lastActiveAt: 0 },
    },
  })
  const tabs = Object.fromEntries(
    Object.entries(runtime).map(([id, patch]) => [id, { ...defaultTabRuntime, ...patch }]),
  )
  return { ...base, runtime: { ...base.runtime, tabs } }
}

describe('sleepyTabs', () => {
  it('picks loaded tabs that have been idle past the threshold', () => {
    const state = stateWith({ old: {}, fresh: {}, active: {}, peek: {} })
    expect(sleepyTabs(state, NOW, HOUR)).toEqual(['old'])
  })

  it('keeps pinned tabs and favorites awake', () => {
    expect(sleepyTabs(stateWith({ kept: {}, fav: {} }), NOW, HOUR)).toEqual([])
  })

  it('never sleeps when turned off', () => {
    expect(sleepyTabs(stateWith({ old: {} }), NOW, sleepThresholds.never)).toEqual([])
  })

  it.each<Partial<TabRuntime>>([
    { audible: true },
    { loading: true },
    { devtools: 'docked' },
    { capturing: true },
    {
      media: {
        playing: false,
        controllable: true,
        video: true,
        pip: true,
        title: null,
        artist: null,
        artwork: null,
        startedAt: 0,
      },
    },
  ])('keeps busy tabs awake: %j', (patch) => {
    expect(sleepyTabs(stateWith({ busy: patch }), NOW, HOUR)).toEqual([])
  })

  it('ignores runtime for tabs that no longer exist', () => {
    expect(sleepyTabs(stateWith({ ghost: {} }), NOW, HOUR)).toEqual([])
  })
})
