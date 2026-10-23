import { produce } from 'immer'
import {
  DATA_VERSION,
  type AppState,
  type Container,
  type Data,
  type Folder,
  type Id,
  type Item,
  type Space,
  type Split,
  type SplitDirection,
  type Tab,
  type WindowData,
  settingsSchema,
} from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { createAppState, DEFAULT_PROFILE_ID, spaceColors } from '@shared/state/initial'
import { reduce } from '@shared/state/reducer'
import { getList } from '@shared/state/tree'

export interface FolderNode {
  kind: 'folder'
  id: Id
  children: Node[]
  name?: string
  open?: boolean
}

export interface SplitNode {
  kind: 'split'
  id: Id
  children: Node[]
  direction?: SplitDirection
  sizes?: number[]
}

export type Node = Id | FolderNode | SplitNode

export const folder = (id: Id, children: Node[], extra: Partial<FolderNode> = {}): FolderNode => ({
  kind: 'folder',
  id,
  children,
  ...extra,
})

export const split = (id: Id, children: Node[], extra: Partial<SplitNode> = {}): SplitNode => ({
  kind: 'split',
  id,
  children,
  ...extra,
})

export interface SpaceSpec {
  name?: string
  profileId?: Id
  pinned?: Node[]
  today?: Node[]
}

export interface WindowSpec extends Partial<Omit<WindowData, 'id'>> {
  active?: Id | null
}

export interface Fixture {
  spaces?: Record<Id, SpaceSpec>
  profiles?: Id[]
  favorites?: Record<Id, Node[]>
  windows?: Record<Id, WindowSpec>
  tabs?: Record<Id, Partial<Tab>>
  loose?: Id[]
}

export function makeTab(id: Id, extra: Partial<Tab> = {}): Tab {
  return {
    kind: 'tab',
    id,
    url: `https://${id}.test/`,
    title: id,
    favicon: null,
    savedUrl: null,
    savedTitle: null,
    customTitle: null,
    createdAt: 0,
    lastActiveAt: 0,
    ...extra,
  }
}

export function makeWindow(id: Id, spaceId: Id, extra: Partial<WindowData> = {}): WindowData {
  return {
    id,
    kind: 'main',
    spaceId,
    activeBySpace: {},
    sidebarHidden: false,
    bounds: null,
    peekTabId: null,
    littleTabId: null,
    ...extra,
  }
}

export function buildData(fixture: Fixture = {}): Data {
  const spaceSpecs = fixture.spaces ?? { s1: {} }
  const items: Record<Id, Item> = {}
  const persistent = new Set<Id>()

  const addNode = (node: Node, saved: boolean): Id => {
    if (typeof node === 'string') {
      const base = makeTab(
        node,
        saved ? { savedUrl: `https://${node}.test/`, savedTitle: node } : {},
      )
      items[node] = { ...base, ...fixture.tabs?.[node] }
      if (saved) persistent.add(node)
      return node
    }
    const children = node.children.map((child) => addNode(child, saved))
    if (node.kind === 'folder') {
      const item: Folder = {
        kind: 'folder',
        id: node.id,
        name: node.name ?? node.id,
        children,
        open: node.open ?? true,
      }
      items[node.id] = item
    } else {
      const item: Split = {
        kind: 'split',
        id: node.id,
        children,
        direction: node.direction ?? 'horizontal',
        sizes: node.sizes ?? children.map(() => 1 / children.length),
      }
      items[node.id] = item
    }
    return node.id
  }

  const profiles: Data['profiles'] = {
    [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Default' },
  }
  for (const id of fixture.profiles ?? []) profiles[id] = { id, name: id }

  const favorites: Data['favorites'] = {}
  for (const id of Object.keys(profiles)) favorites[id] = []
  for (const [profileId, nodes] of Object.entries(fixture.favorites ?? {})) {
    favorites[profileId] = nodes.map((node) => addNode(node, true))
  }

  const spaces: Record<Id, Space> = {}
  Object.entries(spaceSpecs).forEach(([id, spec], index) => {
    spaces[id] = {
      id,
      name: spec.name ?? id,
      icon: null,
      color: spaceColors[index % spaceColors.length] ?? '#3d6be0',
      profileId: spec.profileId ?? DEFAULT_PROFILE_ID,
      pinned: (spec.pinned ?? []).map((node) => addNode(node, true)),
      today: (spec.today ?? []).map((node) => addNode(node, false)),
    }
  })

  for (const id of fixture.loose ?? []) addNode(id, false)

  const firstSpace = Object.keys(spaces)[0] ?? 's1'
  const windows: Record<Id, WindowData> = {}
  for (const [id, spec] of Object.entries(fixture.windows ?? {})) {
    const { active, ...rest } = spec
    const spaceId = rest.spaceId ?? firstSpace
    windows[id] = makeWindow(id, spaceId, {
      ...rest,
      activeBySpace: {
        ...(active === undefined ? {} : { [spaceId]: active }),
        ...rest.activeBySpace,
      },
    })
  }

  return {
    version: DATA_VERSION,
    profiles,
    spaces,
    spaceOrder: Object.keys(spaces),
    favorites,
    items,
    windows,
    archive: [],
    closed: [],
    settings: settingsSchema.parse({}),
    boosts: {},
    routes: [],
    sitePermissions: {},
  }
}

export function buildState(fixture: Fixture = {}): AppState {
  return createAppState(buildData(fixture))
}

export function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(
    (current, action) =>
      produce(current, (draft) => {
        reduce(draft, action)
      }),
    state,
  )
}

export function list(state: AppState, container: Container): Id[] {
  return getList(state.data, container) ?? []
}

export const pinned = (spaceId: Id): Container => ({ type: 'pinned', spaceId })
export const today = (spaceId: Id): Container => ({ type: 'today', spaceId })
export const favorites = (profileId: Id = DEFAULT_PROFILE_ID): Container => ({
  type: 'favorites',
  profileId,
})
export const inFolder = (id: Id): Container => ({ type: 'folder', id })
export const inSplit = (id: Id): Container => ({ type: 'split', id })

export function itemOf(state: AppState, id: Id): Item | undefined {
  return state.data.items[id]
}

export function tabOf(state: AppState, id: Id): Tab {
  const item = state.data.items[id]
  if (item?.kind !== 'tab') throw new Error(`expected tab ${id}`)
  return item
}

export function splitOf(state: AppState, id: Id): Split {
  const item = state.data.items[id]
  if (item?.kind !== 'split') throw new Error(`expected split ${id}`)
  return item
}

export function windowOf(state: AppState, id: Id): WindowData {
  const window = state.data.windows[id]
  if (!window) throw new Error(`expected window ${id}`)
  return window
}
