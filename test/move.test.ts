import { describe, expect, it } from 'vitest'
import type { AppState, Folder } from '@shared/schema'
import { defaultTabRuntime } from '@shared/state/reducer'
import { locate } from '@shared/state/tree'
import {
  addTab,
  apply,
  favorites,
  folder,
  makeState,
  OTHER_SPACE,
  pinned,
  PROFILE,
  SPACE,
  today,
} from './dnd-helpers'

const space = (state: AppState, id = SPACE) => state.data.spaces[id]
const folderItem = (state: AppState, id: string): Folder => {
  const item = state.data.items[id]
  if (item?.kind !== 'folder') throw new Error(`${id} is not a folder`)
  return item
}
const tab = (state: AppState, id: string) => {
  const item = state.data.items[id]
  if (item?.kind !== 'tab') throw new Error(`${id} is not a tab`)
  return item
}

function withTabs(...ids: string[]) {
  const state = makeState()
  for (const id of ids) addTab(state, id, today())
  return state
}

function withFolder() {
  const state = withTabs('a', 'b', 'c')
  apply(
    state,
    { type: 'tab/pin', id: 'a', spaceId: SPACE },
    { type: 'tab/pin', id: 'b', spaceId: SPACE },
    { type: 'folder/create', id: 'f', name: 'Folder', spaceId: SPACE, children: ['a'] },
  )
  return state
}

describe('item/move within a list', () => {
  it('reorders today using pre-removal indices', () => {
    const state = withTabs('a', 'b', 'c')
    apply(state, { type: 'item/move', id: 'a', to: today(), index: 0 })
    expect(space(state)?.today).toEqual(['a', 'b', 'c'])
    apply(state, { type: 'item/move', id: 'a', to: today(), index: 3 })
    expect(space(state)?.today).toEqual(['b', 'c', 'a'])
    apply(state, { type: 'item/move', id: 'a', to: today(), index: 1 })
    expect(space(state)?.today).toEqual(['b', 'a', 'c'])
  })

  it('reorders favorites', () => {
    const state = withTabs('a', 'b', 'c')
    for (const id of ['a', 'b', 'c']) apply(state, { type: 'tab/favorite', id, profileId: PROFILE })
    apply(state, { type: 'item/move', id: 'c', to: favorites(), index: 0 })
    expect(state.data.favorites[PROFILE]).toEqual(['c', 'a', 'b'])
  })

  it('reorders tabs inside a full split', () => {
    const state = withTabs('a', 'b', 'c', 'd')
    apply(state, {
      type: 'split/create',
      id: 's',
      tabIds: ['a', 'b', 'c', 'd'],
      direction: 'horizontal',
    })
    apply(state, { type: 'item/move', id: 'd', to: { type: 'split', id: 's' }, index: 0 })
    const split = state.data.items.s
    expect(split?.kind === 'split' && split.children).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('item/move between sections', () => {
  it('saves the url when a tab is pinned by dragging', () => {
    const state = withTabs('a')
    apply(state, { type: 'item/move', id: 'a', to: pinned(), index: 0 })
    expect(space(state)?.pinned).toEqual(['a'])
    expect(space(state)?.today).toEqual([])
    expect(tab(state, 'a').savedUrl).toBe('https://a.test/')
  })

  it('forgets the saved url when dragged back to today', () => {
    const state = withTabs('a')
    apply(
      state,
      { type: 'item/move', id: 'a', to: pinned(), index: 0 },
      { type: 'tab/update', id: 'a', patch: { url: 'https://elsewhere.test/' } },
      { type: 'item/move', id: 'a', to: today(), index: 0 },
    )
    expect(tab(state, 'a').savedUrl).toBeNull()
    expect(tab(state, 'a').url).toBe('https://elsewhere.test/')
  })

  it('keeps the original saved url when moving between persistent sections', () => {
    const state = withTabs('a')
    apply(
      state,
      { type: 'item/move', id: 'a', to: pinned(), index: 0 },
      { type: 'tab/update', id: 'a', patch: { url: 'https://elsewhere.test/' } },
      { type: 'item/move', id: 'a', to: favorites(), index: 0 },
    )
    expect(state.data.favorites[PROFILE]).toEqual(['a'])
    expect(tab(state, 'a').savedUrl).toBe('https://a.test/')
  })

  it('creates the favorites list for a profile that has none', () => {
    const state = withTabs('a')
    Reflect.deleteProperty(state.data.favorites, PROFILE)
    apply(state, { type: 'item/move', id: 'a', to: favorites(), index: 0 })
    expect(state.data.favorites[PROFILE]).toEqual(['a'])
  })

  it('rejects favorites for unknown profiles and folders in favorites or today', () => {
    const state = withFolder()
    apply(
      state,
      { type: 'item/move', id: 'c', to: favorites('missing'), index: 0 },
      { type: 'item/move', id: 'f', to: favorites(), index: 0 },
      { type: 'item/move', id: 'f', to: today(), index: 0 },
    )
    expect(space(state)?.today).toEqual(['c'])
    expect(space(state)?.pinned).toEqual(['f', 'b'])
    expect(state.data.favorites.missing).toBeUndefined()
  })
})

describe('item/move with folders', () => {
  it('moves a today tab into a folder and pins it', () => {
    const state = withFolder()
    apply(state, { type: 'item/move', id: 'c', to: folder('f'), index: 0 })
    expect(folderItem(state, 'f').children).toEqual(['c', 'a'])
    expect(space(state)?.today).toEqual([])
    expect(tab(state, 'c').savedUrl).toBe('https://c.test/')
  })

  it('moves a tab out of a folder into pinned', () => {
    const state = withFolder()
    apply(state, { type: 'item/move', id: 'a', to: pinned(), index: 0 })
    expect(folderItem(state, 'f').children).toEqual([])
    expect(space(state)?.pinned).toEqual(['a', 'f', 'b'])
    expect(tab(state, 'a').savedUrl).toBe('https://a.test/')
  })

  it('moves a tab out of a folder into today', () => {
    const state = withFolder()
    apply(state, { type: 'item/move', id: 'a', to: today(), index: 1 })
    expect(space(state)?.today).toEqual(['c', 'a'])
    expect(tab(state, 'a').savedUrl).toBeNull()
  })

  it('nests folders but never into themselves or their descendants', () => {
    const state = withFolder()
    apply(
      state,
      { type: 'folder/create', id: 'g', name: 'Inner', spaceId: SPACE, children: [] },
      { type: 'item/move', id: 'g', to: folder('f'), index: 1 },
    )
    expect(folderItem(state, 'f').children).toEqual(['a', 'g'])
    apply(
      state,
      { type: 'item/move', id: 'f', to: folder('g'), index: 0 },
      { type: 'item/move', id: 'f', to: folder('f'), index: 0 },
    )
    expect(folderItem(state, 'g').children).toEqual([])
    expect(space(state)?.pinned).toEqual(['f', 'b'])
    expect(locate(state.data, 'f')?.container).toEqual(pinned())
  })

  it('pulls a tab out of a split and dissolves the leftover split', () => {
    const state = withTabs('a', 'b', 'c')
    apply(state, { type: 'split/create', id: 's', tabIds: ['a', 'b'], direction: 'horizontal' })
    apply(state, { type: 'item/move', id: 'a', to: today(), index: 0 })
    expect(state.data.items.s).toBeUndefined()
    expect(space(state)?.today).toEqual(['a', 'b', 'c'])
  })
})

describe('item/move across spaces', () => {
  it('moves a tab to another space and picks a new active tab', () => {
    const state = withTabs('a', 'b')
    apply(
      state,
      {
        type: 'window/create',
        window: {
          id: 'w',
          kind: 'main',
          spaceId: SPACE,
          activeBySpace: {},
          sidebarHidden: false,
          bounds: null,
          peekTabId: null,
          littleTabId: null,
        },
      },
      { type: 'window/activate', id: 'w', tabId: 'b', now: 1 },
      { type: 'item/move', id: 'b', to: today(OTHER_SPACE), index: 0 },
    )
    expect(space(state, OTHER_SPACE)?.today).toEqual(['b'])
    expect(state.data.windows.w?.activeBySpace[SPACE]).toBe('a')
  })

  it('unloads tabs that land in a space with a different profile', () => {
    const state = withTabs('a')
    apply(
      state,
      { type: 'profile/create', id: 'work', name: 'Work' },
      { type: 'space/update', id: OTHER_SPACE, patch: { profileId: 'work' } },
      { type: 'runtime/tab', id: 'a', patch: { loading: false } },
    )
    expect(state.runtime.tabs.a).toEqual(defaultTabRuntime)
    apply(state, { type: 'item/move', id: 'a', to: today(OTHER_SPACE), index: 0 })
    expect(state.runtime.tabs.a).toBeUndefined()
  })

  it('keeps tabs loaded when the profile stays the same', () => {
    const state = withTabs('a')
    apply(
      state,
      { type: 'runtime/tab', id: 'a', patch: { loading: false } },
      { type: 'item/move', id: 'a', to: pinned(OTHER_SPACE), index: 0 },
    )
    expect(state.runtime.tabs.a).toBeDefined()
  })
})

describe('space/move', () => {
  it('moves a space to its final index', () => {
    const state = makeState()
    apply(state, { type: 'space/move', id: OTHER_SPACE, index: 0 })
    expect(state.data.spaceOrder).toEqual([OTHER_SPACE, SPACE])
    apply(state, { type: 'space/move', id: OTHER_SPACE, index: 9 })
    expect(state.data.spaceOrder).toEqual([SPACE, OTHER_SPACE])
  })
})

describe('profiles', () => {
  it('creates a profile with an empty favorites list', () => {
    const state = makeState()
    apply(state, { type: 'profile/create', id: 'work', name: '  Work  ' })
    expect(state.data.profiles.work).toEqual({ id: 'work', name: 'Work' })
    expect(state.data.favorites.work).toEqual([])
  })

  it('does not overwrite an existing profile', () => {
    const state = makeState()
    apply(state, { type: 'profile/create', id: PROFILE, name: 'Other' })
    expect(state.data.profiles[PROFILE]?.name).toBe('Default')
  })

  it('unloads the tabs of a space whose profile changes', () => {
    const state = withTabs('a')
    apply(
      state,
      { type: 'runtime/tab', id: 'a', patch: {} },
      { type: 'profile/create', id: 'work', name: 'Work' },
      { type: 'space/update', id: SPACE, patch: { profileId: 'work' } },
    )
    expect(space(state)?.profileId).toBe('work')
    expect(state.runtime.tabs.a).toBeUndefined()
  })
})
