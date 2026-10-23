import type { AppState, Container, Id, Tab } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { createAppState, createInitialData, DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { reduce } from '@shared/state/reducer'

export const SPACE = 'space-a'
export const OTHER_SPACE = 'space-b'
export const PROFILE = DEFAULT_PROFILE_ID

export function makeTab(id: Id, url = `https://${id}.test/`): Tab {
  return {
    kind: 'tab',
    id,
    url,
    title: id,
    favicon: null,
    savedUrl: null,
    savedTitle: null,
    customTitle: null,
    createdAt: 0,
    lastActiveAt: 0,
  }
}

export function makeState(): AppState {
  const state = createAppState(createInitialData(SPACE))
  reduce(state, {
    type: 'space/create',
    id: OTHER_SPACE,
    name: 'Work',
    color: '#1f9e8f',
    icon: null,
    profileId: PROFILE,
  })
  return state
}

export function apply(state: AppState, ...actions: Action[]): AppState {
  for (const action of actions) reduce(state, action)
  return state
}

export function addTab(state: AppState, id: Id, to: Container, index = Number.MAX_SAFE_INTEGER) {
  reduce(state, { type: 'tab/create', tab: makeTab(id), to, index })
}

export const pinned = (spaceId: Id = SPACE): Container => ({ type: 'pinned', spaceId })
export const today = (spaceId: Id = SPACE): Container => ({ type: 'today', spaceId })
export const favorites = (profileId: Id = PROFILE): Container => ({ type: 'favorites', profileId })
export const folder = (id: Id): Container => ({ type: 'folder', id })
