import { z } from 'zod'
import {
  MAX_ARCHIVE,
  type ArchivedTab,
  type Id,
  type Item,
  type Profile,
  type Route,
  type RouteMatch,
  type Settings,
  type Space,
} from '../schema'
import { DEFAULT_PROFILE_ID, spaceColors } from '../state/initial'
import type { ImportBundle } from './bundle'

export const ARC_MAX_SPLIT = 4
const MAX_DEPTH = 32
const MAX_ICON_LENGTH = 16

export type ArcProfileRef = { kind: 'default' } | { kind: 'custom'; name: string }

export interface ArcTab {
  kind: 'tab'
  url: string
  title: string
  customTitle: string | null
}

export interface ArcFolder {
  kind: 'folder'
  name: string
  children: ArcNode[]
}

export interface ArcSplit {
  kind: 'split'
  tabs: ArcTab[]
}

export type ArcNode = ArcTab | ArcFolder | ArcSplit

export interface ArcSpace {
  arcId: string
  name: string
  icon: string | null
  color: string | null
  profile: ArcProfileRef
  pinned: ArcNode[]
  today: ArcNode[]
}

export interface ArcFavorites {
  profile: ArcProfileRef
  tabs: ArcTab[]
}

export interface ArcArchivedTab {
  url: string
  title: string
  arcSpaceId: string | null
  archivedAt: number
}

export type ArcRouteDestination =
  { kind: 'space'; arcSpaceId: string } | { kind: 'current' } | { kind: 'little' }

export interface ArcRoute {
  match: RouteMatch
  destination: ArcRouteDestination
}

export interface ArcRouting {
  routes: ArcRoute[]
  externalLinks: Settings['externalLinks'] | null
}

export interface ArcImport {
  spaces: ArcSpace[]
  favorites: ArcFavorites[]
  archive?: ArcArchivedTab[]
  routing?: ArcRouting
  profileNames?: Record<string, string>
}

export const APPLE_EPOCH_OFFSET_MS = 978_307_200_000

const rootSchema = z.object({
  sidebar: z.object({ containers: z.array(z.unknown()) }),
})

const containerSchema = z.object({
  spaces: z.array(z.unknown()),
  items: z.array(z.unknown()).catch([]),
  topAppsContainerIDs: z.array(z.unknown()).catch([]),
})

const colorSchema = z.object({ red: z.number(), green: z.number(), blue: z.number() })

const profileRefSchema = z
  .union([
    z
      .object({
        custom: z.object({ _0: z.object({ directoryBasename: z.string().trim().min(1) }) }),
      })
      .transform((value): ArcProfileRef => ({
        kind: 'custom',
        name: value.custom._0.directoryBasename,
      })),
    z.object({ default: z.literal(true) }).transform((): ArcProfileRef => ({ kind: 'default' })),
  ])
  .catch({ kind: 'default' })

const codePointSchema = z.number().int().min(0).max(0x10ffff)

const iconSchema = z
  .union([
    z.object({ emoji_v2: z.string() }).transform((value) => value.emoji_v2),
    z.object({ emoji: z.string() }).transform((value) => value.emoji),
    z.object({ emoji: codePointSchema }).transform((value) => String.fromCodePoint(value.emoji)),
  ])
  .transform((value) => {
    const icon = value.trim()
    return icon.length > 0 && icon.length <= MAX_ICON_LENGTH ? icon : null
  })
  .catch(null)

const spaceSchema = z.object({
  id: z.string(),
  title: z.string().nullish().catch(null),
  profile: profileRefSchema,
  containerIDs: z.array(z.unknown()).catch([]),
  newContainerIDs: z.array(z.unknown()).catch([]),
  customInfo: z
    .object({
      iconType: iconSchema,
      windowTheme: z
        .object({ primaryColorPalette: z.object({ midTone: colorSchema }) })
        .nullish()
        .catch(null),
    })
    .nullish()
    .catch(null),
})

const itemSchema = z.object({
  id: z.string(),
  parentID: z.string().nullish().catch(null),
  childrenIds: z.array(z.string()).catch([]),
  title: z.string().nullish().catch(null),
  data: z.record(z.string(), z.unknown()).catch({}),
})
type ArcItem = z.infer<typeof itemSchema>

const tabDataSchema = z.object({
  savedURL: z.string().trim().min(1),
  savedTitle: z.string().catch(''),
})

const topAppsDataSchema = z.object({
  containerType: z.object({ topApps: z.object({ _0: profileRefSchema }) }),
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseEntries<T>(list: readonly unknown[], schema: z.ZodType<T>): T[] {
  return list.flatMap((entry) => {
    if (!isObject(entry)) return []
    const parsed = schema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

function hexFromColor(color: z.infer<typeof colorSchema>): string {
  const channel = (value: number) =>
    Math.round(Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`
}

function containerLabel(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (isObject(value)) return Object.keys(value)[0] ?? null
  return null
}

function spaceContainers(lists: readonly (readonly unknown[])[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const list of lists) {
    for (let index = 0; index + 1 < list.length; index += 2) {
      const label = containerLabel(list[index])
      const id = list[index + 1]
      if (label && typeof id === 'string' && !result.has(label)) result.set(label, id)
    }
  }
  return result
}

function isImportableUrl(url: string): boolean {
  return !/^arc:/i.test(url)
}

function createTree(items: readonly ArcItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const byParent = new Map<string, ArcItem[]>()
  for (const item of items) {
    if (!item.parentID) continue
    const siblings = byParent.get(item.parentID) ?? []
    siblings.push(item)
    byParent.set(item.parentID, siblings)
  }

  const childrenOf = (item: ArcItem): ArcItem[] => {
    const listed = item.childrenIds.flatMap((id) => {
      const child = byId.get(id)
      return child ? [child] : []
    })
    const listedIds = new Set(listed.map((child) => child.id))
    const extra = (byParent.get(item.id) ?? []).filter((child) => !listedIds.has(child.id))
    return [...listed, ...extra]
  }

  const toNode = (item: ArcItem, path: ReadonlySet<string>): ArcNode | null => {
    if (path.has(item.id) || path.size > MAX_DEPTH) return null
    const nextPath = new Set(path).add(item.id)
    const nodes = () => nodesOf(item, nextPath)
    const { data } = item
    if ('tab' in data) {
      const tab = tabDataSchema.safeParse(data.tab)
      if (!tab.success || !isImportableUrl(tab.data.savedURL)) return null
      const customTitle = item.title?.trim()
      return {
        kind: 'tab',
        url: tab.data.savedURL,
        title: tab.data.savedTitle,
        customTitle: customTitle && customTitle !== tab.data.savedTitle ? customTitle : null,
      }
    }
    if ('list' in data) {
      return { kind: 'folder', name: item.title?.trim() ?? '', children: nodes() }
    }
    if ('splitView' in data) {
      return { kind: 'split', tabs: flattenArcTabs(nodes()) }
    }
    return null
  }

  const nodesOf = (item: ArcItem, path: ReadonlySet<string>): ArcNode[] =>
    childrenOf(item).flatMap((child) => {
      const node = toNode(child, path)
      return node ? [node] : []
    })

  return {
    get: (id: string) => byId.get(id),
    nodesOf: (item: ArcItem) => nodesOf(item, new Set([item.id])),
  }
}

export function flattenArcTabs(nodes: readonly ArcNode[]): ArcTab[] {
  return nodes.flatMap((node) => {
    switch (node.kind) {
      case 'tab':
        return [node]
      case 'folder':
        return flattenArcTabs(node.children)
      case 'split':
        return node.tabs
    }
  })
}

function findContainer(containers: readonly unknown[]) {
  for (const container of containers) {
    const parsed = containerSchema.safeParse(container)
    if (parsed.success) return parsed.data
  }
  return null
}

export function parseArcSidebar(json: unknown): ArcImport {
  const root = rootSchema.safeParse(json)
  if (!root.success) throw new Error('This does not look like an Arc sidebar file')
  const container = findContainer(root.data.sidebar.containers)
  if (!container) throw new Error('No Arc spaces found')

  const items = parseEntries(container.items, itemSchema)
  const tree = createTree(items)
  const nodesIn = (id: string | undefined) => {
    const item = id ? tree.get(id) : undefined
    return item ? tree.nodesOf(item) : []
  }

  const spaces = parseEntries(container.spaces, spaceSchema).map((space): ArcSpace => {
    const containers = spaceContainers([space.containerIDs, space.newContainerIDs])
    const midTone = space.customInfo?.windowTheme?.primaryColorPalette.midTone
    return {
      arcId: space.id,
      name: space.title?.trim() ?? '',
      icon: space.customInfo?.iconType ?? null,
      color: midTone ? hexFromColor(midTone) : null,
      profile: space.profile,
      pinned: nodesIn(containers.get('pinned')),
      today: nodesIn(containers.get('unpinned')),
    }
  })

  const favorites: ArcFavorites[] = []
  const seenContainers = new Set<string>()
  const addFavorites = (id: string, profile: ArcProfileRef) => {
    if (seenContainers.has(id)) return
    seenContainers.add(id)
    favorites.push({ profile, tabs: flattenArcTabs(nodesIn(id)) })
  }
  const topApps = container.topAppsContainerIDs
  for (let index = 0; index + 1 < topApps.length; index += 2) {
    const id = topApps[index + 1]
    if (typeof id === 'string' && tree.get(id))
      addFavorites(id, profileRefSchema.parse(topApps[index]))
  }
  for (const item of items) {
    const parsed = topAppsDataSchema.safeParse(item.data.itemContainer)
    if (parsed.success) addFavorites(item.id, parsed.data.containerType.topApps._0)
  }

  return { spaces, favorites }
}

const archivedSchema = z.object({
  archivedAt: z.number(),
  source: z.unknown(),
  sidebarItem: z.object({
    title: z.string().nullish().catch(null),
    data: z.object({ tab: tabDataSchema }),
  }),
})

const archiveRootSchema = z.object({ items: z.array(z.unknown()) })

const appleTime = (seconds: number) => Math.round(seconds * 1000 + APPLE_EPOCH_OFFSET_MS)

function archivedSpaceId(source: unknown): string | null {
  if (!isObject(source) || !isObject(source.space)) return null
  const id = source.space._0
  return typeof id === 'string' ? id : null
}

export function parseArcArchive(json: unknown): ArcArchivedTab[] {
  const root = archiveRootSchema.safeParse(json)
  if (!root.success) return []
  return parseEntries(root.data.items, archivedSchema)
    .filter((entry) => isImportableUrl(entry.sidebarItem.data.tab.savedURL))
    .map((entry) => {
      const { tab } = entry.sidebarItem.data
      return {
        url: tab.savedURL,
        title: entry.sidebarItem.title?.trim() ? entry.sidebarItem.title.trim() : tab.savedTitle,
        arcSpaceId: archivedSpaceId(entry.source),
        archivedAt: appleTime(entry.archivedAt),
      }
    })
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, MAX_ARCHIVE)
}

const routingSchema = z.object({
  defaultDestination: z.unknown(),
  rules: z.array(z.unknown()).catch([]),
})

const ruleSchema = z.object({
  sourceComponents: z.array(z.unknown()),
  destination: z.unknown(),
})

const urlMatchSchema = z.object({
  componentType: z.object({
    urlMatch: z.object({ _0: z.record(z.string(), z.unknown()), _1: z.string().trim().min(1) }),
  }),
})

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function routeMatchOf(kind: string, value: string): RouteMatch | null {
  switch (kind) {
    case 'contains':
      return { kind: 'contains', value }
    case 'domain':
    case 'host':
    case 'hostname':
      return { kind: 'domain', value }
    case 'startsWith':
      return { kind: 'regex', value: `^${escapeRegex(value)}` }
    case 'endsWith':
      return { kind: 'regex', value: `${escapeRegex(value)}$` }
    case 'is':
    case 'equals':
    case 'exactly':
      return { kind: 'regex', value: `^${escapeRegex(value)}$` }
    case 'regex':
    case 'matches':
      return { kind: 'regex', value }
    default:
      return null
  }
}

function firstString(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return value
  if (depth > 4 || !isObject(value)) return null
  for (const entry of Object.values(value)) {
    const found = firstString(entry, depth + 1)
    if (found) return found
  }
  return null
}

function destinationOf(value: unknown): ArcRouteDestination | null {
  if (!isObject(value)) return null
  if ('littleArc' in value) return { kind: 'little' }
  if (!isObject(value.space)) return null
  const target = value.space._0
  if (isObject(target) && 'mostRecent' in target) return { kind: 'current' }
  const arcSpaceId = firstString(target)
  return arcSpaceId ? { kind: 'space', arcSpaceId } : null
}

function routeOf(rule: z.infer<typeof ruleSchema>): ArcRoute | null {
  const [component, ...rest] = rule.sourceComponents
  if (rest.length > 0) return null
  const parsed = urlMatchSchema.safeParse(component)
  const destination = destinationOf(rule.destination)
  if (!parsed.success || !destination) return null
  const { _0: kind, _1: value } = parsed.data.componentType.urlMatch
  const name = Object.keys(kind)[0]
  const match = name ? routeMatchOf(name, value) : null
  return match ? { match, destination } : null
}

export function parseArcRouting(json: unknown): ArcRouting {
  const root = routingSchema.safeParse(json)
  if (!root.success) return { routes: [], externalLinks: null }
  const fallback = destinationOf(root.data.defaultDestination)
  return {
    routes: parseEntries(root.data.rules, ruleSchema).flatMap((rule) => routeOf(rule) ?? []),
    externalLinks: fallback ? (fallback.kind === 'little' ? 'little' : 'space') : null,
  }
}

const localStateSchema = z.object({
  profile: z.object({
    info_cache: z.record(
      z.string(),
      z.object({ name: z.string().trim().min(1) }).catch({ name: '' }),
    ),
  }),
})

export function parseArcProfileNames(json: unknown): Record<string, string> {
  const parsed = localStateSchema.safeParse(json)
  if (!parsed.success) return {}
  return Object.fromEntries(
    Object.entries(parsed.data.profile.info_cache).flatMap(([dir, info]) =>
      dir !== 'Default' && info.name ? [[dir, info.name]] : [],
    ),
  )
}

export interface ArcConvertOptions {
  newId: () => Id
  now: number
}

type Section = 'pinned' | 'today' | 'favorites'

export function arcImportToBundle(arc: ArcImport, options: ArcConvertOptions): ImportBundle {
  const { newId, now } = options
  const items: Record<Id, Item> = {}
  const profiles = new Map<string, Profile>()

  const profileId = (ref: ArcProfileRef): Id => {
    const key = ref.kind === 'default' ? DEFAULT_PROFILE_ID : `custom:${ref.name}`
    const existing = profiles.get(key)
    if (existing) return existing.id
    const profile =
      ref.kind === 'default'
        ? { id: DEFAULT_PROFILE_ID, name: 'Default' }
        : { id: newId(), name: arc.profileNames?.[ref.name] ?? ref.name }
    profiles.set(key, profile)
    return profile.id
  }

  const addTab = (tab: ArcTab, section: Section): Id => {
    const id = newId()
    const persistent = section !== 'today'
    items[id] = {
      kind: 'tab',
      id,
      url: tab.url,
      title: tab.title,
      favicon: null,
      savedUrl: persistent ? tab.url : null,
      savedTitle: persistent ? tab.title : null,
      customTitle: tab.customTitle,
      createdAt: now,
      lastActiveAt: now,
    }
    return id
  }

  const addNodes = (nodes: readonly ArcNode[], section: Section): Id[] =>
    nodes.flatMap((node): Id[] => {
      switch (node.kind) {
        case 'tab':
          return [addTab(node, section)]
        case 'folder': {
          if (section !== 'pinned') return addNodes(node.children, section)
          const id = newId()
          const children = addNodes(node.children, section)
          items[id] = {
            kind: 'folder',
            id,
            name: node.name || 'Folder',
            children,
            open: true,
            feedUrl: null,
          }
          return [id]
        }
        case 'split': {
          const fits = node.tabs.length >= 2 && node.tabs.length <= ARC_MAX_SPLIT
          if (section === 'favorites' || !fits) return node.tabs.map((tab) => addTab(tab, section))
          const id = newId()
          const children = node.tabs.map((tab) => addTab(tab, section))
          items[id] = {
            kind: 'split',
            id,
            children,
            direction: 'horizontal',
            sizes: children.map(() => 1 / children.length),
          }
          return [id]
        }
      }
    })

  const favorites: Record<Id, Id[]> = {}
  for (const entry of arc.favorites) {
    const id = profileId(entry.profile)
    const list = (favorites[id] ??= [])
    list.push(...addNodes(entry.tabs, 'favorites'))
  }

  const spaces = arc.spaces.map((space, index): Space => {
    const id = newId()
    return {
      id,
      name: space.name || `Arc Space ${index + 1}`,
      icon: space.icon,
      color: space.color ?? spaceColors[index % spaceColors.length] ?? spaceColors[0],
      profileId: profileId(space.profile),
      pinned: addNodes(space.pinned, 'pinned'),
      today: addNodes(space.today, 'today'),
    }
  })

  const spaceIdFor = new Map(arc.spaces.map((space, index) => [space.arcId, spaces[index]?.id]))
  const fallbackSpace = spaces[0]?.id
  const archive = (arc.archive ?? []).flatMap((entry): ArchivedTab[] => {
    const spaceId = (entry.arcSpaceId ? spaceIdFor.get(entry.arcSpaceId) : null) ?? fallbackSpace
    if (!spaceId) return []
    return [
      {
        id: newId(),
        url: entry.url,
        title: entry.title,
        favicon: null,
        spaceId,
        archivedAt: entry.archivedAt,
      },
    ]
  })
  const routes = (arc.routing?.routes ?? []).flatMap((route): Route[] => {
    const { destination } = route
    const spaceId =
      destination.kind === 'space' ? spaceIdFor.get(destination.arcSpaceId) : fallbackSpace
    if (!spaceId) return []
    return [
      {
        id: newId(),
        match: { ...route.match },
        target: destination.kind,
        spaceId,
      },
    ]
  })

  return {
    profiles: [...profiles.values()],
    spaces,
    items,
    favorites,
    archive,
    routes,
    externalLinks: arc.routing?.externalLinks ?? null,
  }
}
