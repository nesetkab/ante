import { z } from 'zod'
import { isInternalPage } from './pages'
import { isWebUrl } from './url'
import { noteIdOf } from './notes'
import {
  boostSchema,
  deviceIdSchema,
  folderSchema,
  idSchema,
  noteSchema,
  profileSchema,
  routeSchema,
  settingsSchema,
  spaceSchema,
  splitSchema,
  tabSchema,
  type Boost,
  type Data,
  type Id,
  type Item,
  type Note,
  type Profile,
  type Route,
} from './schema'
import { isPrivateProfile, isPrivateSpace } from './state/private'
import { repairLive } from './state/sanitize'
import { descendantIds, sameIds } from './state/tree'

export const SYNC_SCHEMA_VERSION = 1
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const entityKeyPattern =
  /^(?:(?:profile|space|item|favorites|note|boost):.{1,200}|routes|settings|spaceOrder)$/s

export const syncEntitySchema = z.object({
  updatedAt: z.number().nonnegative(),
  deleted: z.boolean(),
  value: z.unknown(),
})
export type SyncEntity = z.infer<typeof syncEntitySchema>
export type SyncEntities = Record<string, SyncEntity>

export const deviceFileSchema = z.object({
  schemaVersion: z.literal(SYNC_SCHEMA_VERSION),
  deviceId: deviceIdSchema.min(1),
  deviceName: z.string().max(200),
  writtenAt: z.number(),
  entities: z.record(z.string().regex(entityKeyPattern), syncEntitySchema),
})
export type DeviceFile = z.infer<typeof deviceFileSchema>

const syncedSettingsSchema = settingsSchema.pick({
  searchEngine: true,
  archiveAfter: true,
  theme: true,
  sidebarSide: true,
  adblock: true,
  peekExternalLinks: true,
  externalLinks: true,
})
type SyncedSettings = z.infer<typeof syncedSettingsSchema>
const syncedSettingKeys = Object.keys(syncedSettingsSchema.shape) as (keyof SyncedSettings)[]

const syncedSpaceSchema = spaceSchema.omit({ today: true })
type SyncedSpace = z.infer<typeof syncedSpaceSchema>

const safeSavedUrl = z
  .string()
  .nullable()
  .refine((url) => url === null || isWebUrl(url) || isInternalPage(url))

const safeFeedUrl = z
  .string()
  .nullable()
  .refine((url) => url === null || /^https?:\/\//i.test(url))

const syncedItemSchema = z.discriminatedUnion('kind', [
  tabSchema
    .pick({
      kind: true,
      id: true,
      savedTitle: true,
      customTitle: true,
      createdAt: true,
    })
    .extend({ savedUrl: safeSavedUrl }),
  folderSchema.omit({ open: true }).extend({ feedUrl: safeFeedUrl }),
  splitSchema,
])
type SyncedItem = z.infer<typeof syncedItemSchema>

const idListSchema = z.array(idSchema).max(100_000)
const MAX_SYNCED_REGEX = 200
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)[+*{]/

export function isSafeSyncedRoute(route: Route): boolean {
  if (route.match.kind !== 'regex') return true
  const { value } = route.match
  return value.length <= MAX_SYNCED_REGEX && !NESTED_QUANTIFIER.test(value)
}

const routesSchema = z
  .array(routeSchema)
  .max(500)
  .transform((routes) => routes.filter(isSafeSyncedRoute))

const unsafeIds = new Set(['__proto__', 'constructor', 'prototype'])

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry: unknown) => stableStringify(entry ?? null)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

const sameValue = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b)

const fingerprints = new WeakMap<SyncEntity, string>()

function fingerprint(entity: SyncEntity): string {
  const cached = fingerprints.get(entity)
  if (cached !== undefined) return cached
  const computed = stableStringify(entity.value)
  fingerprints.set(entity, computed)
  return computed
}

function syncedItemValue(item: Item): SyncedItem {
  switch (item.kind) {
    case 'tab':
      return {
        kind: 'tab',
        id: item.id,
        savedUrl: item.savedUrl,
        savedTitle: item.savedTitle,
        customTitle: item.customTitle,
        createdAt: item.createdAt,
      }
    case 'folder':
      return {
        kind: 'folder',
        id: item.id,
        name: item.name,
        children: item.feedUrl ? [] : [...item.children],
        feedUrl: item.feedUrl,
      }
    case 'split':
      return { ...item, children: [...item.children], sizes: [...item.sizes] }
  }
}

export interface SnapshotOptions {
  skipSpaces?: ReadonlySet<Id>
}

export function syncSnapshot(data: Data, options: SnapshotOptions = {}): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const profile of Object.values(data.profiles)) {
    if (!isPrivateProfile(profile.id)) {
      snapshot[`profile:${profile.id}`] = { id: profile.id, name: profile.name }
    }
  }
  const spaces = Object.values(data.spaces).filter(
    (space) => !isPrivateProfile(space.profileId) && !options.skipSpaces?.has(space.id),
  )
  const roots: Id[] = []
  for (const space of spaces) {
    const value: SyncedSpace = {
      id: space.id,
      name: space.name,
      icon: space.icon,
      color: space.color,
      profileId: space.profileId,
      pinned: [...space.pinned],
    }
    snapshot[`space:${space.id}`] = value
    roots.push(...space.pinned)
  }
  const spaceIds = new Set(spaces.map((space) => space.id))
  snapshot.spaceOrder = data.spaceOrder.filter((id) => spaceIds.has(id))
  for (const [profileId, list] of Object.entries(data.favorites)) {
    if (isPrivateProfile(profileId) || !data.profiles[profileId]) continue
    snapshot[`favorites:${profileId}`] = [...list]
    roots.push(...list)
  }
  const noteIds = new Set<Id>()
  const visit = (id: Id, depth: number): void => {
    const item = data.items[id]
    const key = `item:${id}`
    if (!item || depth > 32 || key in snapshot) return
    snapshot[key] = syncedItemValue(item)
    if (item.kind === 'tab') {
      for (const url of [item.url, item.savedUrl]) {
        const noteId = url ? noteIdOf(url) : null
        if (noteId) noteIds.add(noteId)
      }
      return
    }
    if (item.kind === 'folder' && item.feedUrl) return
    for (const child of item.children) visit(child, depth + 1)
  }
  for (const id of roots) visit(id, 0)
  for (const id of noteIds) {
    const note = data.notes[id]
    if (note) snapshot[`note:${id}`] = { ...note }
  }
  for (const boost of Object.values(data.boosts)) {
    const { js: _script, ...shared } = boost
    snapshot[`boost:${boost.id}`] = { ...shared, zaps: [...boost.zaps] }
  }
  snapshot.routes = data.routes
    .filter((route) => !isPrivateSpace(data, route.spaceId))
    .map((route) => ({ ...route, match: { ...route.match } }))
  const settings: SyncedSettings = {
    searchEngine: data.settings.searchEngine,
    archiveAfter: data.settings.archiveAfter,
    theme: data.settings.theme,
    sidebarSide: data.settings.sidebarSide,
    adblock: data.settings.adblock,
    peekExternalLinks: data.settings.peekExternalLinks,
    externalLinks: data.settings.externalLinks,
  }
  snapshot.settings = settings
  return snapshot
}

const nextTimestamp = (previous: SyncEntity | undefined, now: number): number =>
  Math.max(now, (previous?.updatedAt ?? -1) + 1)

export function pruneTombstones(entities: SyncEntities, now: number): SyncEntities {
  const kept: SyncEntities = {}
  for (const [key, entity] of Object.entries(entities)) {
    if (entity.deleted && now - entity.updatedAt > TOMBSTONE_TTL_MS) continue
    kept[key] = entity
  }
  return kept
}

export function diffEntities(
  snapshot: Record<string, unknown>,
  baseline: SyncEntities,
  now: number,
): SyncEntities {
  const entities: SyncEntities = {}
  for (const [key, value] of Object.entries(snapshot)) {
    const previous = baseline[key]
    if (previous && !previous.deleted && fingerprint(previous) === stableStringify(value)) {
      entities[key] = previous
    } else {
      entities[key] = { updatedAt: nextTimestamp(previous, now), deleted: false, value }
    }
  }
  for (const [key, previous] of Object.entries(baseline)) {
    if (key in snapshot) continue
    entities[key] = previous.deleted
      ? previous
      : { updatedAt: nextTimestamp(previous, now), deleted: true, value: null }
  }
  return pruneTombstones(entities, now)
}

export interface EntitySource {
  deviceId: string
  entities: SyncEntities
}

export function mergeEntities(sources: readonly EntitySource[], now: number): SyncEntities {
  const merged: SyncEntities = {}
  const owners = new Map<string, string>()
  for (const source of sources) {
    for (const [key, entity] of Object.entries(source.entities)) {
      const current = merged[key]
      const owner = owners.get(key) ?? ''
      const wins =
        !current ||
        entity.updatedAt > current.updatedAt ||
        (entity.updatedAt === current.updatedAt && source.deviceId > owner)
      if (!wins) continue
      merged[key] = entity
      owners.set(key, source.deviceId)
    }
  }
  return pruneTombstones(merged, now)
}

const isIdListKey = (key: string): boolean => key === 'spaceOrder' || key.startsWith('favorites:')

function unionEntity(key: string, mine: unknown, theirs: SyncEntity, now: number): SyncEntity {
  if (key === 'routes') {
    const base = theirs.deleted ? [] : (routesSchema.safeParse(theirs.value).data ?? [])
    const ids = new Set(base.map((route) => route.id))
    const extra = (routesSchema.safeParse(mine).data ?? []).filter((route) => !ids.has(route.id))
    if (extra.length === 0 && !theirs.deleted) return theirs
    return { updatedAt: nextTimestamp(theirs, now), deleted: false, value: [...base, ...extra] }
  }
  const base = theirs.deleted ? [] : (idListSchema.safeParse(theirs.value).data ?? [])
  const extra = (idListSchema.safeParse(mine).data ?? []).filter((id) => !base.includes(id))
  if (extra.length === 0 && !theirs.deleted) return theirs
  return { updatedAt: nextTimestamp(theirs, now), deleted: false, value: [...base, ...extra] }
}

export function joinEntities(
  snapshot: Record<string, unknown>,
  remote: SyncEntities,
  now: number,
): SyncEntities {
  const entities: SyncEntities = {}
  for (const [key, value] of Object.entries(snapshot)) {
    const theirs = remote[key]
    if (!theirs) entities[key] = { updatedAt: now, deleted: false, value }
    else if (isIdListKey(key) || key === 'routes') {
      entities[key] = unionEntity(key, value, theirs, now)
    } else entities[key] = theirs
  }
  return entities
}

export function adoptableSpaces(data: Data, remote: SyncEntities): Id[] {
  const remoteHasSpace = Object.entries(remote).some(
    ([key, entity]) => key.startsWith('space:') && !entity.deleted,
  )
  const spaces = Object.values(data.spaces).filter((space) => !isPrivateProfile(space.profileId))
  const [space] = spaces
  if (!remoteHasSpace || !space || spaces.length !== 1) return []
  if (space.pinned.length > 0 || remote[`space:${space.id}`]) return []
  const hasFavorites = Object.entries(data.favorites).some(
    ([profileId, list]) => !isPrivateProfile(profileId) && list.length > 0,
  )
  return hasFavorites ? [] : [space.id]
}

interface Incoming {
  profiles: Map<Id, Profile | null>
  spaces: Map<Id, SyncedSpace | null>
  items: Map<Id, SyncedItem | null>
  favorites: Map<Id, Id[] | null>
  notes: Map<Id, Note | null>
  boosts: Map<Id, Boost | null>
  routes: Route[] | null
  settings: SyncedSettings | null
  spaceOrder: Id[] | null
}

function withId<T extends { id: Id }>(schema: z.ZodType<T>, id: Id, value: unknown): T | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success && parsed.data.id === id ? parsed.data : undefined
}

function readIncoming(entities: SyncEntities): Incoming {
  const incoming: Incoming = {
    profiles: new Map(),
    spaces: new Map(),
    items: new Map(),
    favorites: new Map(),
    notes: new Map(),
    boosts: new Map(),
    routes: null,
    settings: null,
    spaceOrder: null,
  }
  for (const [key, entity] of Object.entries(entities)) {
    const separator = key.indexOf(':')
    const kind = separator < 0 ? key : key.slice(0, separator)
    const id = separator < 0 ? '' : key.slice(separator + 1)
    const { deleted, value } = entity
    if (separator >= 0 && (unsafeIds.has(id) || !idSchema.safeParse(id).success)) continue
    switch (kind) {
      case 'profile': {
        const parsed = deleted ? null : withId(profileSchema, id, value)
        if (parsed !== undefined) incoming.profiles.set(id, parsed)
        break
      }
      case 'space': {
        const parsed = deleted ? null : withId(syncedSpaceSchema, id, value)
        if (parsed !== undefined) incoming.spaces.set(id, parsed)
        break
      }
      case 'item': {
        const parsed = deleted ? null : withId(syncedItemSchema, id, value)
        if (parsed !== undefined) incoming.items.set(id, parsed)
        break
      }
      case 'note': {
        const parsed = deleted ? null : withId(noteSchema, id, value)
        if (parsed !== undefined) incoming.notes.set(id, parsed)
        break
      }
      case 'boost': {
        const parsed = deleted ? null : withId(boostSchema, id, value)
        if (parsed !== undefined) incoming.boosts.set(id, parsed)
        break
      }
      case 'favorites': {
        const parsed = deleted ? null : idListSchema.safeParse(value).data
        if (parsed !== undefined) incoming.favorites.set(id, parsed)
        break
      }
      case 'routes':
        if (!deleted) incoming.routes = routesSchema.safeParse(value).data ?? null
        break
      case 'settings':
        if (!deleted) incoming.settings = syncedSettingsSchema.safeParse(value).data ?? null
        break
      case 'spaceOrder':
        if (!deleted) incoming.spaceOrder = idListSchema.safeParse(value).data ?? null
        break
    }
  }
  return incoming
}

function todayItems(data: Data): Set<Id> {
  const roots = Object.values(data.spaces).flatMap((space) => space.today)
  return new Set(roots.flatMap((id) => descendantIds(data, id)))
}

function localOnlyItems(data: Data): Set<Id> {
  const roots: Id[] = []
  for (const space of Object.values(data.spaces)) {
    if (isPrivateProfile(space.profileId)) roots.push(...space.pinned, ...space.today)
  }
  for (const [profileId, list] of Object.entries(data.favorites)) {
    if (isPrivateProfile(profileId)) roots.push(...list)
  }
  const ids = new Set(roots.flatMap((id) => descendantIds(data, id)))
  for (const window of Object.values(data.windows)) {
    if (window.peekTabId) ids.add(window.peekTabId)
    if (window.littleTabId) ids.add(window.littleTabId)
  }
  return ids
}

function applyItem(data: Data, id: Id, value: SyncedItem): void {
  const local = data.items[id]
  if (value.kind === 'tab') {
    if (local?.kind !== 'tab') {
      data.items[id] = {
        kind: 'tab',
        id,
        url: value.savedUrl ?? 'about:blank',
        title: value.savedTitle ?? '',
        favicon: null,
        savedUrl: value.savedUrl,
        savedTitle: value.savedTitle,
        customTitle: value.customTitle,
        createdAt: value.createdAt,
        lastActiveAt: 0,
      }
      return
    }
    const atSaved = local.url === local.savedUrl
    if (atSaved && value.savedUrl !== null && local.url !== value.savedUrl) {
      local.url = value.savedUrl
      local.title = value.savedTitle ?? local.title
    }
    if (local.savedUrl !== value.savedUrl) local.savedUrl = value.savedUrl
    if (local.savedTitle !== value.savedTitle) local.savedTitle = value.savedTitle
    if (local.customTitle !== value.customTitle) local.customTitle = value.customTitle
    if (local.createdAt !== value.createdAt) local.createdAt = value.createdAt
    return
  }
  if (value.kind === 'folder') {
    if (local?.kind !== 'folder') {
      data.items[id] = { ...value, children: value.feedUrl ? [] : value.children, open: true }
      return
    }
    if (local.name !== value.name) local.name = value.name
    if (local.feedUrl !== value.feedUrl) local.feedUrl = value.feedUrl
    if (!value.feedUrl && !sameIds(local.children, value.children)) local.children = value.children
    return
  }
  if (local?.kind !== 'split') {
    data.items[id] = value
    return
  }
  if (!sameIds(local.children, value.children)) local.children = value.children
  if (local.direction !== value.direction) local.direction = value.direction
  if (!sameValue(local.sizes, value.sizes)) local.sizes = value.sizes
}

function applySpace(data: Data, id: Id, value: SyncedSpace): void {
  const local = data.spaces[id]
  if (!local) {
    data.spaces[id] = { ...value, today: [] }
    return
  }
  if (local.name !== value.name) local.name = value.name
  if (local.icon !== value.icon) local.icon = value.icon
  if (local.color !== value.color) local.color = value.color
  if (local.profileId !== value.profileId) local.profileId = value.profileId
  if (!sameIds(local.pinned, value.pinned)) local.pinned = value.pinned
}

const publicSpaceIds = (data: Data): Id[] =>
  Object.values(data.spaces)
    .filter((space) => !isPrivateProfile(space.profileId))
    .map((space) => space.id)

function removeSpace(data: Data, id: Id): void {
  Reflect.deleteProperty(data.spaces, id)
  if (data.spaceOrder.includes(id))
    data.spaceOrder = data.spaceOrder.filter((other) => other !== id)
}

function dropSpace(data: Data, id: Id): void {
  const space = data.spaces[id]
  if (!space || isPrivateProfile(space.profileId)) return
  const targetId = [...data.spaceOrder, ...publicSpaceIds(data)].find(
    (other) => other !== id && data.spaces[other] && !isPrivateSpace(data, other),
  )
  const target = targetId ? data.spaces[targetId] : undefined
  if (!target) return
  if (space.today.length > 0) target.today = [...space.today, ...target.today]
  for (const window of Object.values(data.windows)) {
    if (!(id in window.activeBySpace)) {
      if (window.spaceId === id) window.spaceId = target.id
      continue
    }
    const active = window.activeBySpace[id] ?? null
    Reflect.deleteProperty(window.activeBySpace, id)
    if (window.spaceId === id) {
      window.spaceId = target.id
      window.activeBySpace[target.id] = active
    }
  }
  removeSpace(data, id)
}

export interface ApplyOptions {
  dropSpaces?: readonly Id[]
}

export function applySyncInPlace(
  data: Data,
  entities: SyncEntities,
  options: ApplyOptions = {},
): void {
  const incoming = readIncoming(entities)
  const localOnly = localOnlyItems(data)
  const today = todayItems(data)

  for (const [id, value] of incoming.profiles) {
    if (isPrivateProfile(id)) continue
    const local = data.profiles[id]
    if (value === null) {
      if (local && Object.keys(data.profiles).length > 1) Reflect.deleteProperty(data.profiles, id)
    } else if (!local) data.profiles[id] = value
    else if (local.name !== value.name) local.name = value.name
  }

  if (incoming.settings) {
    const settings = incoming.settings
    for (const key of syncedSettingKeys) {
      if (data.settings[key] !== settings[key])
        Object.assign(data.settings, { [key]: settings[key] })
    }
  }

  for (const [id, value] of incoming.boosts) {
    if (value === null) {
      if (data.boosts[id]) Reflect.deleteProperty(data.boosts, id)
    } else {
      const merged = { ...value, js: data.boosts[id]?.js ?? '' }
      if (!sameValue(data.boosts[id], merged)) data.boosts[id] = merged
    }
  }

  if (incoming.routes) {
    const routes = [
      ...incoming.routes.filter((route) => !isPrivateSpace(data, route.spaceId)),
      ...data.routes.filter((route) => isPrivateSpace(data, route.spaceId)),
    ]
    if (!sameValue(routes, data.routes)) data.routes = routes
  }

  for (const [id, value] of incoming.notes) {
    if (value === null) continue
    if (!sameValue(data.notes[id], value)) data.notes[id] = value
  }

  for (const [id, value] of incoming.items) {
    if (localOnly.has(id)) continue
    if (value === null) {
      if (data.items[id] && !today.has(id)) Reflect.deleteProperty(data.items, id)
    } else applyItem(data, id, value)
  }

  for (const [profileId, list] of incoming.favorites) {
    if (isPrivateProfile(profileId)) continue
    if (list === null) {
      if (data.favorites[profileId]) Reflect.deleteProperty(data.favorites, profileId)
      continue
    }
    const current = data.favorites[profileId]
    const next = list.filter((id) => !localOnly.has(id))
    if (!current || !sameIds(current, next)) data.favorites[profileId] = next
  }

  for (const [id, value] of incoming.spaces) {
    if (isPrivateSpace(data, id)) continue
    if (value === null) {
      if (data.spaces[id] && publicSpaceIds(data).length > 1) dropSpace(data, id)
      continue
    }
    if (isPrivateProfile(value.profileId)) continue
    applySpace(data, id, { ...value, pinned: value.pinned.filter((item) => !localOnly.has(item)) })
  }

  if (incoming.spaceOrder) {
    const listed = incoming.spaceOrder.filter((id) => data.spaces[id] && !isPrivateSpace(data, id))
    const order = [...new Set([...listed, ...data.spaceOrder])]
    if (!sameIds(order, data.spaceOrder)) data.spaceOrder = order
  }

  for (const id of options.dropSpaces ?? []) dropSpace(data, id)

  repairLive(data)
}

export function applySync(data: Data, entities: SyncEntities, options: ApplyOptions = {}): Data {
  const next = structuredClone(data)
  applySyncInPlace(next, entities, options)
  return next
}

export interface SyncCycleInput {
  data: Data
  deviceId: string
  baseline: SyncEntities | null
  remotes: readonly DeviceFile[]
  now: number
  apply?: (entities: SyncEntities, options: ApplyOptions) => Data
}

export interface SyncCycleResult {
  data: Data
  entities: SyncEntities
  merged: SyncEntities
}

const SYNCED_ROOTS = new Set([
  'profiles',
  'spaces',
  'spaceOrder',
  'favorites',
  'items',
  'notes',
  'boosts',
  'routes',
  'settings',
])
const LOCAL_ITEM_FIELDS = new Set(['url', 'title', 'favicon', 'lastActiveAt'])

export function touchesSyncedData(path: readonly (string | number)[]): boolean {
  if (path[0] !== 'data') return false
  const root = path[1]
  if (typeof root !== 'string' || !SYNCED_ROOTS.has(root)) return false
  if (root === 'items' && typeof path[3] === 'string' && LOCAL_ITEM_FIELDS.has(path[3]))
    return false
  if (root === 'spaces' && path[3] === 'today') return false
  return true
}

export function isFreshDevice(file: Pick<DeviceFile, 'writtenAt'>, now: number): boolean {
  return now - file.writtenAt <= TOMBSTONE_TTL_MS
}

export function syncCycle(input: SyncCycleInput): SyncCycleResult {
  const { data, deviceId, baseline, now } = input
  const remotes = input.remotes.filter(
    (file) => file.deviceId !== deviceId && isFreshDevice(file, now),
  )
  const remoteMerged = mergeEntities(remotes, now)
  const dropSpaces = baseline === null ? adoptableSpaces(data, remoteMerged) : []
  const snapshot = syncSnapshot(data, { skipSpaces: new Set(dropSpaces) })
  const local =
    baseline === null
      ? joinEntities(snapshot, remoteMerged, now)
      : diffEntities(snapshot, baseline, now)
  const merged = mergeEntities([{ deviceId, entities: local }, ...remotes], now)
  const apply =
    input.apply ??
    ((entities: SyncEntities, options: ApplyOptions) => applySync(data, entities, options))
  const applied = apply(merged, { dropSpaces })
  const entities = diffEntities(syncSnapshot(applied), merged, now)
  return { data: applied, entities, merged }
}

export function sameEntities(a: SyncEntities, b: SyncEntities): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => {
    const left = a[key]
    const right = b[key]
    if (!left || !right) return false
    return (
      left.updatedAt === right.updatedAt &&
      left.deleted === right.deleted &&
      fingerprint(left) === fingerprint(right)
    )
  })
}

export function createDeviceFile(
  deviceId: string,
  deviceName: string,
  entities: SyncEntities,
  now: number,
): DeviceFile {
  return { schemaVersion: SYNC_SCHEMA_VERSION, deviceId, deviceName, writtenAt: now, entities }
}
