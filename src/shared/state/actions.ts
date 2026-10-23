import { z } from 'zod'
import {
  originSchema,
  sitePermissionSchema,
  type PermissionDecision,
  type SitePermission,
} from '../permissions'
import {
  boostPatchSchema,
  containerSchema,
  idSchema,
  routeMatchSchema,
  withoutDefaults,
  zapSelectorSchema,
  settingsPatchSchema,
  spaceSchema,
  splitDirectionSchema,
  type Container,
  type Data,
  type DownloadRuntime,
  type Id,
  type Tab,
  type TabRuntime,
  type WindowData,
  type WindowRuntime,
} from '../schema'
import type { ImportBundle } from '../importers/bundle'

const indexSchema = z.number().int().nonnegative()

export const uiActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('space/create'),
    id: idSchema,
    name: z.string().max(100),
    color: spaceSchema.shape.color,
    icon: z.string().max(16).nullable(),
    profileId: idSchema,
  }),
  z.object({
    type: z.literal('space/update'),
    id: idSchema,
    patch: spaceSchema.pick({ name: true, icon: true, color: true, profileId: true }).partial(),
  }),
  z.object({ type: z.literal('space/delete'), id: idSchema }),
  z.object({ type: z.literal('space/move'), id: idSchema, index: indexSchema }),
  z.object({ type: z.literal('item/move'), id: idSchema, to: containerSchema, index: indexSchema }),
  z.object({ type: z.literal('tab/rename'), id: idSchema, title: z.string().max(500).nullable() }),
  z.object({ type: z.literal('tab/pin'), id: idSchema, spaceId: idSchema }),
  z.object({ type: z.literal('tab/unpin'), id: idSchema, spaceId: idSchema }),
  z.object({ type: z.literal('tab/favorite'), id: idSchema, profileId: idSchema }),
  z.object({ type: z.literal('tab/unfavorite'), id: idSchema, spaceId: idSchema }),
  z.object({ type: z.literal('tab/setSavedUrl'), id: idSchema }),
  z.object({
    type: z.literal('folder/create'),
    id: idSchema,
    name: z.string().max(200),
    spaceId: idSchema,
    children: z.array(idSchema),
  }),
  z.object({ type: z.literal('folder/rename'), id: idSchema, name: z.string().max(200) }),
  z.object({ type: z.literal('folder/toggle'), id: idSchema, open: z.boolean().optional() }),
  z.object({ type: z.literal('folder/ungroup'), id: idSchema }),
  z.object({
    type: z.literal('split/resize'),
    id: idSchema,
    sizes: z.array(z.number().positive()),
  }),
  z.object({ type: z.literal('split/direction'), id: idSchema, direction: splitDirectionSchema }),
  z.object({ type: z.literal('split/dissolve'), id: idSchema }),
  z.object({ type: z.literal('archive/remove'), id: idSchema }),
  z.object({ type: z.literal('archive/clear') }),
  z.object({ type: z.literal('settings/update'), patch: settingsPatchSchema }),
  z.object({ type: z.literal('profile/create'), id: idSchema, name: z.string().max(100) }),
  z.object({
    type: z.literal('boost/create'),
    id: idSchema,
    name: z.string().max(200),
    domain: z.string().max(253),
  }),
  z.object({ type: z.literal('boost/update'), id: idSchema, patch: boostPatchSchema }),
  z.object({ type: z.literal('boost/delete'), id: idSchema }),
  z.object({ type: z.literal('boost/addZap'), id: idSchema, selector: zapSelectorSchema }),
  z.object({ type: z.literal('boost/removeZap'), id: idSchema, selector: z.string().max(2000) }),
  z.object({
    type: z.literal('route/add'),
    id: idSchema,
    match: routeMatchSchema,
    spaceId: idSchema,
  }),
  z.object({
    type: z.literal('route/update'),
    id: idSchema,
    patch: z.object({
      match: withoutDefaults(routeMatchSchema).optional(),
      spaceId: idSchema.optional(),
    }),
  }),
  z.object({ type: z.literal('route/delete'), id: idSchema }),
  z.object({
    type: z.literal('sitePermission/clear'),
    profileId: idSchema,
    origin: originSchema,
    permission: sitePermissionSchema.optional(),
  }),
  z.object({ type: z.literal('profile/rename'), id: idSchema, name: z.string().max(100) }),
])
export type UiAction = z.infer<typeof uiActionSchema>

export type InternalAction =
  | { type: 'data/replace'; data: Data }
  | { type: 'tab/create'; tab: Tab; to: Container | null; index: number }
  | { type: 'tab/update'; id: Id; patch: Partial<Pick<Tab, 'url' | 'title' | 'favicon'>> }
  | { type: 'tab/reset'; id: Id }
  | { type: 'tab/remove'; id: Id; now: number }
  | { type: 'tab/restoreClosed'; fallbackSpaceId: Id }
  | { type: 'split/create'; id: Id; tabIds: Id[]; direction: 'horizontal' | 'vertical' }
  | { type: 'today/clear'; spaceId: Id; now: number }
  | { type: 'archive/sweep'; now: number; thresholdMs: number; keep: Id[] }
  | { type: 'archive/restore'; id: Id; tabId: Id; spaceId: Id; now: number }
  | { type: 'window/create'; window: WindowData }
  | { type: 'window/remove'; id: Id }
  | {
      type: 'window/update'
      id: Id
      patch: Partial<Pick<WindowData, 'sidebarHidden' | 'bounds' | 'peekTabId' | 'littleTabId'>>
    }
  | { type: 'window/selectSpace'; id: Id; spaceId: Id }
  | { type: 'window/activate'; id: Id; tabId: Id; now: number }
  | { type: 'window/deactivate'; id: Id }
  | { type: 'runtime/tab'; id: Id; patch: Partial<TabRuntime> }
  | { type: 'runtime/unload'; id: Id }
  | { type: 'runtime/window'; id: Id; patch: Partial<WindowRuntime> }
  | { type: 'data/import'; bundle: ImportBundle }
  | { type: 'runtime/arcImport'; available: boolean }
  | { type: 'download/add'; download: DownloadRuntime }
  | { type: 'download/update'; id: Id; patch: Partial<Omit<DownloadRuntime, 'id'>> }
  | { type: 'download/remove'; ids: Id[] }
  | {
      type: 'sitePermission/set'
      profileId: Id
      origin: string
      permissions: SitePermission[]
      decision: PermissionDecision
    }
  | { type: 'private/create'; profileId: Id; spaceId: Id }
  | { type: 'private/remove'; profileId: Id }

export type Action = UiAction | InternalAction
