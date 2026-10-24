import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import type { AppState, Tab } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { createAppState, createInitialData } from '@shared/state/initial'
import { reduce } from '@shared/state/reducer'

const apply = (state: AppState, ...actions: Action[]) =>
  actions.reduce((current, action) => produce(current, (draft) => reduce(draft, action)), state)

const tab = (id: string): Tab => ({
  kind: 'tab',
  id,
  url: `https://${id}.example`,
  title: id,
  favicon: null,
  savedUrl: null,
  savedTitle: null,
  customTitle: null,
  createdAt: 0,
  lastActiveAt: 0,
})

function setup(): AppState {
  return apply(
    createAppState(createInitialData('a')),
    {
      type: 'space/create',
      id: 'b',
      name: 'B',
      color: '#1f9e8f',
      icon: null,
      profileId: 'default',
    },
    { type: 'tab/create', tab: tab('one'), to: { type: 'today', spaceId: 'a' }, index: 0 },
    { type: 'tab/create', tab: tab('two'), to: { type: 'today', spaceId: 'a' }, index: 0 },
    {
      type: 'window/create',
      window: {
        id: 'w',
        kind: 'main',
        spaceId: 'a',
        activeBySpace: {},
        sidebarHidden: false,
        bounds: null,
        peekTabId: null,
        littleTabId: null,
      },
    },
    { type: 'window/activate', id: 'w', tabId: 'two', now: 1 },
  )
}

describe('reducer regressions', () => {
  it('reselects a neighbor when the active tab moves to another space', () => {
    const state = apply(setup(), {
      type: 'item/move',
      id: 'two',
      to: { type: 'today', spaceId: 'b' },
      index: 0,
    })
    expect(state.data.spaces.b?.today).toEqual(['two'])
    expect(state.data.windows.w?.activeBySpace.a).toBe('one')
  })

  it('keeps the active tab when it moves within its own space', () => {
    const state = apply(setup(), { type: 'tab/pin', id: 'two', spaceId: 'a' })
    expect(state.data.windows.w?.activeBySpace.a).toBe('two')
  })

  it('unloads every tab once the last main window closes', () => {
    const loaded = apply(setup(), {
      type: 'runtime/tab',
      id: 'two',
      patch: { audible: true },
      create: true,
    })
    expect(loaded.runtime.tabs.two).toBeDefined()
    const closed = apply(loaded, { type: 'window/remove', id: 'w' })
    expect(closed.runtime.tabs).toEqual({})
  })

  it('ungroups folders and dissolves splits through the same path', () => {
    const grouped = apply(
      setup(),
      { type: 'tab/pin', id: 'one', spaceId: 'a' },
      { type: 'folder/create', id: 'f', name: 'F', spaceId: 'a', children: ['one'] },
    )
    expect(grouped.data.spaces.a?.pinned).toEqual(['f'])
    const ungrouped = apply(grouped, { type: 'folder/ungroup', id: 'f' })
    expect(ungrouped.data.spaces.a?.pinned).toEqual(['one'])
    expect(ungrouped.data.items.f).toBeUndefined()
    expect(apply(grouped, { type: 'split/dissolve', id: 'f' }).data.items.f).toBeDefined()
  })
})
