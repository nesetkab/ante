import { z } from 'zod'
import type { Id, Item, Profile, Space } from '../schema'
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

export interface ArcImport {
  spaces: ArcSpace[]
  favorites: ArcFavorites[]
}

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
      .object({ custom: z.object({ _0: z.object({ directoryBasename: z.string().trim().min(1) }) }) })
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
        : { id: newId(), name: ref.name }
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
          items[id] = { kind: 'folder', id, name: node.name || 'Folder', children, open: true }
          return [id]
        }
        case 'split': {
          const fits = node.tabs.length >= 2 && node.tabs.length <= ARC_MAX_SPLIT
          if (section === 'favorites' || !fits)
            return node.tabs.map((tab) => addTab(tab, section))
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

  return { profiles: [...profiles.values()], spaces, items, favorites }
}
