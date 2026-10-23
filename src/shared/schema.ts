import { z } from 'zod'

export const idSchema = z.string().min(1).max(200)
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

export const searchEngines = ['google', 'duckduckgo', 'bing', 'brave', 'kagi', 'ecosia'] as const
export const searchEngineSchema = z.enum(searchEngines)
export type SearchEngine = z.infer<typeof searchEngineSchema>

export const archiveAfterSchema = z.enum(['12h', '24h', '7d', '30d', 'never'])
export type ArchiveAfter = z.infer<typeof archiveAfterSchema>

export const themeModeSchema = z.enum(['system', 'light', 'dark'])
export type ThemeMode = z.infer<typeof themeModeSchema>

export const settingsSchema = z.object({
  searchEngine: searchEngineSchema.default('google'),
  archiveAfter: archiveAfterSchema.default('12h'),
  sidebarWidth: z.number().min(180).max(480).default(260),
  sidebarSide: z.enum(['left', 'right']).default('left'),
  theme: themeModeSchema.default('system'),
  adblock: z.boolean().default(true),
  peekExternalLinks: z.boolean().default(true),
})
export type Settings = z.infer<typeof settingsSchema>
export const settingsPatchSchema = settingsSchema.partial()

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
}

export const librarySectionSchema = z.enum(['history', 'archive', 'downloads'])
export type LibrarySection = z.infer<typeof librarySectionSchema>

export type Overlay =
  | { kind: 'commandBar'; mode: 'new' | 'edit' }
  | { kind: 'sidebar' }
  | { kind: 'library'; section: LibrarySection }

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

export interface Runtime {
  tabs: Record<Id, TabRuntime>
  windows: Record<Id, WindowRuntime>
  downloads: Record<Id, DownloadRuntime>
}

export interface AppState {
  data: Data
  runtime: Runtime
}
