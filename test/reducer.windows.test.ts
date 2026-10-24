import { describe, expect, it } from 'vitest'
import { defaultTabRuntime, defaultWindowRuntime } from '@shared/state/reducer'
import { apply, buildData, buildState, itemOf, makeWindow, tabOf, windowOf } from './helpers'

describe('windows', () => {
  const start = buildState({
    spaces: { s1: { today: ['a', 'b'] }, s2: { today: ['x'] } },
    favorites: { default: ['fav'] },
    loose: ['peek', 'little'],
    windows: {
      w1: { spaceId: 's1', active: 'a', peekTabId: 'peek' },
      w2: { kind: 'little', spaceId: 's1', littleTabId: 'little' },
    },
  })

  it('creates a window with default runtime', () => {
    const next = apply(start, { type: 'window/create', window: makeWindow('w3', 's2') })
    expect(windowOf(next, 'w3').spaceId).toBe('s2')
    expect(next.runtime.windows.w3).toEqual(defaultWindowRuntime)
  })

  it('removes a window and its loose tabs', () => {
    const peekClosed = apply(start, { type: 'window/remove', id: 'w1' })
    expect(peekClosed.data.windows.w1).toBeUndefined()
    expect(itemOf(peekClosed, 'peek')).toBeUndefined()
    expect(itemOf(peekClosed, 'a')).toBeDefined()

    const littleClosed = apply(start, { type: 'window/remove', id: 'w2' })
    expect(itemOf(littleClosed, 'little')).toBeUndefined()
    expect(apply(start, { type: 'window/remove', id: 'missing' })).toBe(start)
  })

  it('keeps a little window tab that was moved into a space', () => {
    const moved = apply(start, {
      type: 'item/move',
      id: 'little',
      to: { type: 'today', spaceId: 's1' },
      index: 0,
    })
    const next = apply(moved, { type: 'window/remove', id: 'w2' })
    expect(itemOf(next, 'little')).toBeDefined()
  })

  it('patches a window', () => {
    const next = apply(start, {
      type: 'window/update',
      id: 'w1',
      patch: { sidebarHidden: true, bounds: { x: 1, y: 2, width: 3, height: 4 } },
    })
    expect(windowOf(next, 'w1')).toMatchObject({
      sidebarHidden: true,
      bounds: { x: 1, y: 2, width: 3, height: 4 },
    })
    expect(apply(start, { type: 'window/update', id: 'missing', patch: {} })).toBe(start)
  })

  it('selects an existing space only', () => {
    const next = apply(start, { type: 'window/selectSpace', id: 'w1', spaceId: 's2' })
    expect(windowOf(next, 'w1').spaceId).toBe('s2')
    expect(apply(start, { type: 'window/selectSpace', id: 'w1', spaceId: 'missing' })).toBe(start)
    expect(apply(start, { type: 'window/selectSpace', id: 'missing', spaceId: 's2' })).toBe(start)
  })

  it('activates a tab and stamps it', () => {
    const next = apply(start, { type: 'window/activate', id: 'w1', tabId: 'b', now: 9 })
    expect(windowOf(next, 'w1').activeBySpace.s1).toBe('b')
    expect(tabOf(next, 'b').lastActiveAt).toBe(9)
  })

  it('switches to the space of a tab in another space', () => {
    const next = apply(start, { type: 'window/activate', id: 'w1', tabId: 'x', now: 9 })
    expect(windowOf(next, 'w1').spaceId).toBe('s2')
    expect(windowOf(next, 'w1').activeBySpace).toEqual({ s1: 'a', s2: 'x' })
  })

  it('keeps the space when activating a favorite', () => {
    const inS2 = apply(start, { type: 'window/selectSpace', id: 'w1', spaceId: 's2' })
    const next = apply(inS2, { type: 'window/activate', id: 'w1', tabId: 'fav', now: 9 })
    expect(windowOf(next, 'w1').spaceId).toBe('s2')
    expect(windowOf(next, 'w1').activeBySpace.s2).toBe('fav')
  })

  it('ignores activation of missing tabs or windows', () => {
    expect(apply(start, { type: 'window/activate', id: 'w1', tabId: 'nope', now: 9 })).toBe(start)
    expect(apply(start, { type: 'window/activate', id: 'nope', tabId: 'a', now: 9 })).toBe(start)
  })

  it('deactivates the current space', () => {
    const next = apply(start, { type: 'window/deactivate', id: 'w1' })
    expect(windowOf(next, 'w1').activeBySpace.s1).toBeNull()
    expect(apply(start, { type: 'window/deactivate', id: 'missing' })).toBe(start)
  })
})

describe('runtime', () => {
  const start = buildState({ spaces: { s1: { today: ['a'] } }, windows: { w1: {} } })

  it('creates tab runtime from defaults and merges later patches', () => {
    const created = apply(start, { type: 'runtime/tab', id: 'a', patch: { loading: true } })
    expect(created.runtime.tabs.a).toEqual({ ...defaultTabRuntime, loading: true })
    const merged = apply(created, { type: 'runtime/tab', id: 'a', patch: { zoom: 2 } })
    expect(merged.runtime.tabs.a).toEqual({ ...defaultTabRuntime, loading: true, zoom: 2 })
    expect(apply(start, { type: 'runtime/tab', id: 'missing', patch: {} })).toBe(start)
  })

  it('unloads tab runtime', () => {
    const created = apply(start, { type: 'runtime/tab', id: 'a', patch: {} })
    expect(apply(created, { type: 'runtime/unload', id: 'a' }).runtime.tabs.a).toBeUndefined()
  })

  it('creates and merges window runtime', () => {
    const created = apply(start, { type: 'runtime/window', id: 'w1', patch: { focused: true } })
    expect(created.runtime.windows.w1).toEqual({ ...defaultWindowRuntime, focused: true })
    const merged = apply(created, {
      type: 'runtime/window',
      id: 'w1',
      patch: { overlay: { kind: 'sidebar' } },
    })
    expect(merged.runtime.windows.w1).toEqual({
      overlay: { kind: 'sidebar' },
      focused: true,
      fullscreen: false,
    })
    expect(apply(start, { type: 'runtime/window', id: 'missing', patch: {} })).toBe(start)
  })

  it('replaces data and drops runtime for tabs that no longer exist', () => {
    const loaded = apply(
      start,
      { type: 'runtime/tab', id: 'a', patch: {} },
      { type: 'runtime/window', id: 'w1', patch: {} },
    )
    const data = buildData({ spaces: { s9: { today: ['z'] } } })
    const next = apply(loaded, { type: 'data/replace', data })
    expect(next.data).toEqual(data)
    expect(next.runtime.tabs).toEqual({})
    expect(next.runtime.windows.w1).toBeDefined()
  })
})

describe('leaving a tab', () => {
  it('stamps the tabs that were on screen so they count as recently used', () => {
    const state = buildState({
      spaces: { s1: { today: ['a', 'b'] } },
      windows: { w: { spaceId: 's1', active: 'a' } },
    })
    const next = apply(state, { type: 'window/activate', id: 'w', tabId: 'b', now: 500 })
    expect(tabOf(next, 'a').lastActiveAt).toBe(500)
    expect(tabOf(next, 'b').lastActiveAt).toBe(500)
  })
})
