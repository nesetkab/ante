import type { AppState, Container, Data, Id } from '../schema'
import { referencedEaselIds } from '../easels'
import { referencedNoteIds } from '../notes'
import { descendantIds } from './tree'

export const PRIVATE_PREFIX = 'private-'
export const PRIVATE_COLOR = '#6e6e73'

export function isPrivateProfile(profileId: Id | null | undefined): boolean {
  return profileId?.startsWith(PRIVATE_PREFIX) ?? false
}

export function isPrivateSpace(data: Data, spaceId: Id | null | undefined): boolean {
  if (!spaceId) return false
  const space = data.spaces[spaceId]
  return space ? isPrivateProfile(space.profileId) : false
}

export function samePrivacy(data: Data, a: Id, b: Id): boolean {
  return isPrivateSpace(data, a) === isPrivateSpace(data, b)
}

export function hasPrivateData(data: Data): boolean {
  return (
    Object.keys(data.profiles).some(isPrivateProfile) ||
    Object.keys(data.sitePermissions).some(isPrivateProfile) ||
    Object.keys(data.favorites).some(isPrivateProfile) ||
    Object.values(data.spaces).some((space) => isPrivateProfile(space.profileId))
  )
}

export function createPrivateSpace(data: Data, profileId: Id, spaceId: Id): void {
  if (!isPrivateProfile(profileId) || data.profiles[profileId] || data.spaces[spaceId]) return
  data.profiles[profileId] = { id: profileId, name: 'Private' }
  data.favorites[profileId] = []
  data.spaces[spaceId] = {
    id: spaceId,
    name: 'Private',
    icon: null,
    color: PRIVATE_COLOR,
    profileId,
    pinned: [],
    today: [],
  }
}

function privateScope(data: Data, profileId: Id) {
  const spaceIds = new Set(
    Object.values(data.spaces)
      .filter((space) => space.profileId === profileId)
      .map((space) => space.id),
  )
  const roots = [
    ...[...spaceIds].flatMap((id) => [
      ...(data.spaces[id]?.pinned ?? []),
      ...(data.spaces[id]?.today ?? []),
    ]),
    ...(data.favorites[profileId] ?? []),
  ]
  const itemIds = new Set(roots.flatMap((id) => descendantIds(data, id)))
  const windowIds = new Set<Id>()
  for (const window of Object.values(data.windows)) {
    if (!spaceIds.has(window.spaceId)) continue
    windowIds.add(window.id)
    for (const loose of [window.peekTabId, window.littleTabId]) if (loose) itemIds.add(loose)
  }
  return { spaceIds, itemIds, windowIds }
}

function isPrivateContainer(
  container: Container,
  profileId: Id,
  spaceIds: Set<Id>,
  itemIds: Set<Id>,
): boolean {
  switch (container.type) {
    case 'pinned':
    case 'today':
      return spaceIds.has(container.spaceId)
    case 'favorites':
      return container.profileId === profileId
    case 'folder':
    case 'split':
      return itemIds.has(container.id)
  }
}

export function removePrivateProfile(
  state: AppState,
  profileId: Id,
  options: { closeWindows: boolean },
): boolean {
  const { data, runtime } = state
  if (!isPrivateProfile(profileId)) return false
  const { spaceIds, itemIds, windowIds } = privateScope(data, profileId)
  if (windowIds.size > 0 && !options.closeWindows) return false
  for (const id of windowIds) {
    Reflect.deleteProperty(data.windows, id)
    Reflect.deleteProperty(runtime.windows, id)
  }
  data.closed = data.closed.filter(
    (entry) =>
      !itemIds.has(entry.tab.id) &&
      !isPrivateContainer(entry.location.container, profileId, spaceIds, itemIds),
  )
  data.archive = data.archive.filter(
    (entry) => !spaceIds.has(entry.spaceId) && !itemIds.has(entry.id),
  )
  for (const id of itemIds) {
    Reflect.deleteProperty(data.items, id)
    Reflect.deleteProperty(runtime.tabs, id)
  }
  for (const id of spaceIds) Reflect.deleteProperty(data.spaces, id)
  data.spaceOrder = data.spaceOrder.filter((id) => !spaceIds.has(id))
  for (const window of Object.values(data.windows)) {
    for (const id of spaceIds) Reflect.deleteProperty(window.activeBySpace, id)
  }
  Reflect.deleteProperty(data.profiles, profileId)
  Reflect.deleteProperty(data.favorites, profileId)
  Reflect.deleteProperty(data.sitePermissions, profileId)
  const notes = referencedNoteIds(data)
  for (const id of Object.keys(data.notes))
    if (!notes.has(id)) Reflect.deleteProperty(data.notes, id)
  const easels = referencedEaselIds(data)
  for (const id of Object.keys(data.easels)) {
    if (!easels.has(id)) Reflect.deleteProperty(data.easels, id)
  }
  return true
}

export function stripPrivate(data: Data): Data {
  if (!hasPrivateData(data)) return data
  const state: AppState = {
    data: structuredClone(data),
    runtime: { tabs: {}, windows: {}, downloads: {} },
  }
  const profileIds = new Set([
    ...Object.keys(data.profiles),
    ...Object.keys(data.sitePermissions),
    ...Object.keys(data.favorites),
    ...Object.values(data.spaces).map((space) => space.profileId),
  ])
  for (const profileId of profileIds) {
    if (isPrivateProfile(profileId)) removePrivateProfile(state, profileId, { closeWindows: true })
  }
  return state.data
}
