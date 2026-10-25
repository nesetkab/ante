import {
  MAX_ARCHIVE,
  type ArchivedTab,
  type Data,
  type Id,
  type Item,
  type Profile,
  type Route,
  type Settings,
  type Space,
} from '../schema'
import { DEFAULT_PROFILE_ID } from '../state/initial'
import { flattenTabs } from '../state/tree'

export interface ImportBundle {
  profiles: Profile[]
  spaces: Space[]
  items: Record<Id, Item>
  favorites: Record<Id, Id[]>
  archive?: ArchivedTab[]
  routes?: Route[]
  externalLinks?: Settings['externalLinks'] | null
  shortcuts?: Settings['shortcuts'] | null
}

const MAX_ROUTES = 500

const routeKey = (route: Route) => `${route.match.kind}:${route.match.value.toLowerCase()}`

function importArchive(data: Data, archive: readonly ArchivedTab[]): void {
  const seen = new Set(data.archive.map((entry) => `${entry.url} ${entry.archivedAt}`))
  const fresh = archive.filter(
    (entry) => data.spaces[entry.spaceId] && !seen.has(`${entry.url} ${entry.archivedAt}`),
  )
  if (fresh.length === 0) return
  data.archive = [...data.archive, ...fresh.map((entry) => ({ ...entry }))]
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, MAX_ARCHIVE)
}

function importRoutes(data: Data, routes: readonly Route[]): void {
  const seen = new Set(data.routes.map(routeKey))
  for (const route of routes) {
    if (data.routes.length >= MAX_ROUTES) return
    if (!data.spaces[route.spaceId] || seen.has(routeKey(route))) continue
    seen.add(routeKey(route))
    data.routes.push({ ...route, match: { ...route.match } })
  }
}

export interface ImportSummary {
  spaceIds: Id[]
  tabCount: number
}

function isPristine(data: Data): boolean {
  const spaces = Object.values(data.spaces)
  return (
    Object.keys(data.items).length === 0 &&
    spaces.length === 1 &&
    spaces.every((space) => space.pinned.length === 0 && space.today.length === 0)
  )
}

function resolveProfiles(data: Data, profiles: readonly Profile[]): Map<Id, Id> {
  const mapping = new Map<Id, Id>()
  for (const profile of profiles) {
    if (data.profiles[profile.id]) {
      mapping.set(profile.id, profile.id)
      continue
    }
    const name = profile.name.trim().toLowerCase()
    const existing = Object.values(data.profiles).find(
      (candidate) => candidate.name.trim().toLowerCase() === name,
    )
    if (existing) {
      mapping.set(profile.id, existing.id)
      continue
    }
    data.profiles[profile.id] = { id: profile.id, name: profile.name }
    mapping.set(profile.id, profile.id)
  }
  for (const id of mapping.values()) data.favorites[id] ??= []
  return mapping
}

function droppedFavorites(data: Data, bundle: ImportBundle, profileFor: (id: Id) => Id): Set<Id> {
  const dropped = new Set<Id>()
  const seen = new Map<Id, Set<string>>()
  for (const [bundleProfileId, ids] of Object.entries(bundle.favorites)) {
    const profileId = profileFor(bundleProfileId)
    let urls = seen.get(profileId)
    if (!urls) {
      urls = new Set(
        flattenTabs(data, data.favorites[profileId] ?? []).flatMap((id) => {
          const item = data.items[id]
          return item?.kind === 'tab' ? [item.savedUrl ?? item.url] : []
        }),
      )
      seen.set(profileId, urls)
    }
    for (const id of ids) {
      const item = bundle.items[id]
      if (item?.kind !== 'tab') {
        dropped.add(id)
        continue
      }
      const url = item.savedUrl ?? item.url
      if (urls.has(url)) dropped.add(id)
      else urls.add(url)
    }
  }
  return dropped
}

export function applyImport(data: Data, bundle: ImportBundle): ImportSummary {
  const pristine = isPristine(data)
  const mapping = resolveProfiles(data, bundle.profiles)
  const profileFor = (id: Id): Id =>
    mapping.get(id) ?? (data.profiles[id] ? id : DEFAULT_PROFILE_ID)
  const dropped = droppedFavorites(data, bundle, profileFor)

  let tabCount = 0
  for (const [id, item] of Object.entries(bundle.items)) {
    if (dropped.has(id) || data.items[id]) continue
    data.items[id] = structuredClone(item)
    if (item.kind === 'tab') tabCount += 1
  }

  for (const [bundleProfileId, ids] of Object.entries(bundle.favorites)) {
    const profileId = profileFor(bundleProfileId)
    const list = (data.favorites[profileId] ??= [])
    list.push(...ids.filter((id) => !dropped.has(id)))
  }

  const spaceIds: Id[] = []
  for (const space of bundle.spaces) {
    if (data.spaces[space.id]) continue
    data.spaces[space.id] = {
      ...space,
      profileId: profileFor(space.profileId),
      pinned: [...space.pinned],
      today: [...space.today],
    }
    data.spaceOrder.push(space.id)
    spaceIds.push(space.id)
  }

  const first = spaceIds[0]
  if (pristine && first) {
    const stale = data.spaceOrder.filter((id) => !spaceIds.includes(id))
    for (const id of stale) Reflect.deleteProperty(data.spaces, id)
    data.spaceOrder = data.spaceOrder.filter((id) => spaceIds.includes(id))
    for (const window of Object.values(data.windows)) {
      for (const id of stale) Reflect.deleteProperty(window.activeBySpace, id)
      if (!data.spaces[window.spaceId]) window.spaceId = first
    }
  }

  importArchive(data, bundle.archive ?? [])
  importRoutes(data, bundle.routes ?? [])
  if (bundle.externalLinks) data.settings.externalLinks = bundle.externalLinks
  if (bundle.shortcuts) data.settings.shortcuts = { ...bundle.shortcuts }

  return { spaceIds, tabCount }
}

export function mergeImport(data: Data, bundle: ImportBundle): { data: Data } & ImportSummary {
  const next = structuredClone(data)
  const summary = applyImport(next, bundle)
  return { data: next, ...summary }
}
