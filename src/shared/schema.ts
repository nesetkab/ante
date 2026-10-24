import { z } from 'zod'
import type { BrowserId } from './importers/chrome'
import { isAccelerator } from './keys'
import type { LoadError } from './loadErrors'
import { sitePermissionsSchema, type FindState, type Prompt } from './permissions'

type DefaultedShape = Record<string, z.ZodDefault>
type UnwrappedShape<Shape extends DefaultedShape> = {
  [Key in keyof Shape]: ReturnType<Shape[Key]['unwrap']>
}

export function withoutDefaults<Shape extends DefaultedShape>(
  schema: z.ZodObject<Shape>,
): z.ZodObject<UnwrappedShape<Shape>> {
  const entries = Object.entries(schema.shape).map(([key, field]) => [key, field.unwrap()])
  return z.object(Object.fromEntries(entries) as UnwrappedShape<Shape>)
}

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype'])

export const idSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((id) => !RESERVED_IDS.has(id))
export type Id = z.infer<typeof idSchema>

export const tabSchema = z.object({
  kind: z.literal('tab'),
  id: idSchema,
  url: z.string(),
  title: z.string(),
  favicon: z.string().nullable().default(null),
  savedUrl: z.string().nullable().default(null),
  savedTitle: z.string().nullable().default(null),
  customTitle: z.string().nullable().default(null),
  createdAt: z.number(),
  lastActiveAt: z.number(),
})
export type Tab = z.infer<typeof tabSchema>

export const folderSchema = z.object({
  kind: z.literal('folder'),
  id: idSchema,
  name: z.string(),
  children: z.array(idSchema),
  open: z.boolean().default(true),
  feedUrl: z.string().max(4096).nullable().default(null),
})
export type Folder = z.infer<typeof folderSchema>

export const splitDirectionSchema = z.enum(['horizontal', 'vertical'])
export type SplitDirection = z.infer<typeof splitDirectionSchema>

export const splitSchema = z.object({
  kind: z.literal('split'),
  id: idSchema,
  children: z.array(idSchema),
  direction: splitDirectionSchema.default('horizontal'),
  sizes: z.array(z.number().positive()),
})
export type Split = z.infer<typeof splitSchema>

export const itemSchema = z.discriminatedUnion('kind', [tabSchema, folderSchema, splitSchema])
export type Item = z.infer<typeof itemSchema>

export const profileSchema = z.object({
  id: idSchema,
  name: z.string(),
})
export type Profile = z.infer<typeof profileSchema>

export const spaceSchema = z.object({
  id: idSchema,
  name: z.string(),
  icon: z.string().nullable().default(null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  profileId: idSchema,
  pinned: z.array(idSchema).default([]),
  today: z.array(idSchema).default([]),
})
export type Space = z.infer<typeof spaceSchema>

export const containerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pinned'), spaceId: idSchema }),
  z.object({ type: z.literal('today'), spaceId: idSchema }),
  z.object({ type: z.literal('favorites'), profileId: idSchema }),
  z.object({ type: z.literal('folder'), id: idSchema }),
  z.object({ type: z.literal('split'), id: idSchema }),
])
export type Container = z.infer<typeof containerSchema>

export const locationSchema = z.object({
  container: containerSchema,
  index: z.number().int().nonnegative(),
})
export type Location = z.infer<typeof locationSchema>

export const archivedTabSchema = z.object({
  id: idSchema,
  url: z.string(),
  title: z.string(),
  favicon: z.string().nullable(),
  spaceId: idSchema,
  archivedAt: z.number(),
})
export type ArchivedTab = z.infer<typeof archivedTabSchema>

export const closedTabSchema = z.object({
  tab: tabSchema,
  location: locationSchema,
  closedAt: z.number(),
})
export type ClosedTab = z.infer<typeof closedTabSchema>

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type Rect = z.infer<typeof rectSchema>

export const windowKindSchema = z.enum(['main', 'little'])
export type WindowKind = z.infer<typeof windowKindSchema>

export const windowSchema = z.object({
  id: idSchema,
  kind: windowKindSchema.default('main'),
  spaceId: idSchema,
  activeBySpace: z.record(idSchema, idSchema.nullable()).default({}),
  sidebarHidden: z.boolean().default(false),
  bounds: rectSchema.nullable().default(null),
  peekTabId: idSchema.nullable().default(null),
  littleTabId: idSchema.nullable().default(null),
})
export type WindowData = z.infer<typeof windowSchema>

export const searchEngines = [
  'google',
  'duckduckgo',
  'bing',
  'brave',
  'kagi',
  'ecosia',
  'custom',
] as const
export const searchEngineSchema = z.enum(searchEngines)
export type SearchEngine = z.infer<typeof searchEngineSchema>
export type BuiltInEngine = Exclude<SearchEngine, 'custom'>

export function isSearchTemplate(url: string): boolean {
  if (!url.includes('%s')) return false
  try {
    const { protocol } = new URL(url.replaceAll('%s', 'ante'))
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export const customSearchSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().max(2000).refine(isSearchTemplate),
})
export type CustomSearch = z.infer<typeof customSearchSchema>

export const sleepOptions = ['15m', '1h', '4h', 'never'] as const
export type SleepAfter = (typeof sleepOptions)[number]

export const archiveAfterSchema = z.enum(['12h', '24h', '7d', '30d', 'never'])
export type ArchiveAfter = z.infer<typeof archiveAfterSchema>

export const themeModeSchema = z.enum(['system', 'light', 'dark'])
export type ThemeMode = z.infer<typeof themeModeSchema>

export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9-]{0,64}$/)

export const syncSettingsSchema = z.object({
  folder: z.string().min(1).max(4096).nullable().default(null),
  deviceId: deviceIdSchema.default(''),
  deviceName: z.string().max(200).default(''),
})
export type SyncSettings = z.infer<typeof syncSettingsSchema>

export const settingsSchema = z.object({
  searchEngine: searchEngineSchema.default('google'),
  customSearch: customSearchSchema.nullable().default(null),
  archiveAfter: archiveAfterSchema.default('12h'),
  sidebarWidth: z.number().min(180).max(480).default(260),
  sidebarSide: z.enum(['left', 'right']).default('left'),
  theme: themeModeSchema.default('system'),
  adblock: z.boolean().default(true),
  globalPrivacyControl: z.boolean().default(true),
  downloadFolder: z.string().min(1).max(4096).nullable().default(null),
  askWhereToSave: z.boolean().default(false),
  clearHistoryOnQuit: z.boolean().default(false),
  peekExternalLinks: z.boolean().default(true),
  externalLinks: z.enum(['little', 'space']).default('little'),
  adblockAllowlist: z.array(z.string().min(1).max(253)).max(10000).default([]),
  autoPip: z.boolean().default(true),
  checkUpdates: z.boolean().default(true),
  sleepAfter: z.enum(sleepOptions).default('1h'),
  shortcuts: z
    .record(
      z.string().regex(/^[a-z0-9-]{1,60}$/),
      z.string().max(80).refine(isAccelerator).nullable(),
    )
    .refine((overrides) => Object.keys(overrides).length <= 300)
    .default({}),
  devtoolsWidth: z.number().min(280).max(1600).default(480),
  sync: syncSettingsSchema.prefault({}),
})
export type Settings = z.infer<typeof settingsSchema>
export const settingsPatchSchema = withoutDefaults(
  settingsSchema.omit({ sync: true, downloadFolder: true }),
).partial()

export const fontFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N} ._-]+$/u)

export const zapSelectorSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((selector) => !/[{}<]|\/\*/.test(selector))

export const boostSchema = z.object({
  id: idSchema,
  name: z.string().max(200).default(''),
  domain: z.string().max(253).default(''),
  enabled: z.boolean().default(true),
  css: z.string().max(200_000).default(''),
  js: z.string().max(200_000).default(''),
  zaps: z.array(zapSelectorSchema).max(500).default([]),
  fontFamily: fontFamilySchema.nullable().default(null),
  tintHue: z.number().min(0).max(360).nullable().default(null),
  invert: z.boolean().default(false),
})
export type Boost = z.infer<typeof boostSchema>
export const boostPatchSchema = withoutDefaults(boostSchema.omit({ id: true })).partial()
export type BoostPatch = z.infer<typeof boostPatchSchema>

export const routeMatchSchema = z.object({
  kind: z.enum(['domain', 'contains', 'regex']).default('domain'),
  value: z.string().max(2000).default(''),
})
export type RouteMatch = z.infer<typeof routeMatchSchema>

export const routeSchema = z.object({
  id: idSchema,
  match: routeMatchSchema.prefault({}),
  spaceId: idSchema,
})
export type Route = z.infer<typeof routeSchema>

export const noteSchema = z.object({
  id: idSchema,
  title: z.string().max(500).default(''),
  body: z.string().max(1_000_000).default(''),
  updatedAt: z.number(),
})
export type Note = z.infer<typeof noteSchema>

const boxSchema = {
  id: idSchema,
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
}

export const easelElementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    ...boxSchema,
    text: z.string().max(100_000),
    size: z.number().min(8).max(160),
  }),
  z.object({
    kind: z.literal('image'),
    ...boxSchema,
    asset: z.string().max(200),
    sourceUrl: z.string().max(4096).nullable(),
  }),
  z.object({
    kind: z.literal('stroke'),
    id: idSchema,
    points: z.array(z.number()).max(20_000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    width: z.number().min(1).max(40),
  }),
  z.object({
    kind: z.literal('link'),
    ...boxSchema,
    url: z.string().max(4096),
    title: z.string().max(500),
  }),
])
export type EaselElement = z.infer<typeof easelElementSchema>

export const easelSchema = z.object({
  id: idSchema,
  title: z.string().max(500).default(''),
  elements: z.array(easelElementSchema).max(5000).default([]),
  updatedAt: z.number(),
})
export type Easel = z.infer<typeof easelSchema>

export const DATA_VERSION = 1

export const dataSchema = z.object({
  version: z.literal(DATA_VERSION),
  profiles: z.record(idSchema, profileSchema),
  spaces: z.record(idSchema, spaceSchema),
  spaceOrder: z.array(idSchema),
  favorites: z.record(idSchema, z.array(idSchema)).default({}),
  items: z.record(idSchema, itemSchema),
  windows: z.record(idSchema, windowSchema).default({}),
  archive: z.array(archivedTabSchema).default([]),
  closed: z.array(closedTabSchema).default([]),
  settings: settingsSchema.prefault({}),
  boosts: z.record(idSchema, boostSchema).default({}),
  routes: z.array(routeSchema).max(500).default([]),
  sitePermissions: sitePermissionsSchema.default({}),
  notes: z.record(idSchema, noteSchema).default({}),
  easels: z.record(idSchema, easelSchema).default({}),
})
export type Data = z.infer<typeof dataSchema>

export interface TabRuntime {
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  audible: boolean
  muted: boolean
  zoom: number
  crashed: boolean
  fullscreen: boolean
  blocked: number
  prompt: Prompt | null
  find: FindState | null
  media: TabMedia | null
  devtools: DevtoolsMode | null
  error: LoadError | null
  capturing: boolean
  hoverUrl: string | null
}

export interface TabMedia {
  playing: boolean
  controllable: boolean
  video: boolean
  pip: boolean
  title: string | null
  artist: string | null
  artwork: string | null
  startedAt: number
}

export type DevtoolsMode = 'docked' | 'window'

export const librarySectionSchema = z.enum(['history', 'archive', 'downloads'])
export type LibrarySection = z.infer<typeof librarySectionSchema>

export type Overlay =
  | { kind: 'commandBar'; mode: 'new' | 'edit' }
  | { kind: 'sidebar' }
  | { kind: 'library'; section: LibrarySection }
  | { kind: 'capture'; easelId?: Id; view?: Rect }

export interface WindowRuntime {
  overlay: Overlay | null
  focused: boolean
  fullscreen: boolean
}

export type DownloadState = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadRuntime {
  id: Id
  url: string
  filename: string
  path: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  startedAt: number
  finishedAt: number | null
  profileId: Id
}

export interface SyncStatus {
  state: 'off' | 'syncing' | 'ok' | 'error'
  lastSyncedAt: number | null
  error: string | null
  devices: number
  iCloudFolder: string | null
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'current' | 'available' | 'error'
  current: string
  version: string | null
  url: string | null
  checkedAt: number | null
}

export interface Runtime {
  tabs: Record<Id, TabRuntime>
  windows: Record<Id, WindowRuntime>
  downloads: Record<Id, DownloadRuntime>
  arcImportAvailable?: boolean
  browsers?: BrowserId[]
  sync?: SyncStatus
  update?: UpdateStatus
}

export interface AppState {
  data: Data
  runtime: Runtime
}
