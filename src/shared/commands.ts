import { z } from 'zod'
import { idSchema, librarySectionSchema } from './schema'

const optionalTab = z.object({ tabId: idSchema.optional() })

export const dispositionSchema = z.enum([
  'current',
  'newTab',
  'background',
  'peek',
  'little',
  'window',
])
export type Disposition = z.infer<typeof dispositionSchema>

export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('open'),
    input: z.string().max(8192),
    disposition: dispositionSchema,
  }),
  z.object({ type: z.literal('tab/activate'), tabId: idSchema }),
  z.object({ type: z.literal('tab/close'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/reopenClosed') }),
  z.object({ type: z.literal('tab/duplicate'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/back'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/forward'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/reload'), ...optionalTab.shape, hard: z.boolean().optional() }),
  z.object({ type: z.literal('tab/stop'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/resetToSaved'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/toggleMute'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/unload'), ...optionalTab.shape }),
  z.object({
    type: z.literal('tab/copyUrl'),
    ...optionalTab.shape,
    markdown: z.boolean().optional(),
  }),
  z.object({ type: z.literal('tab/togglePin'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/next') }),
  z.object({ type: z.literal('tab/recent') }),
  z.object({ type: z.literal('tab/previous') }),
  z.object({ type: z.literal('tab/nth'), index: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal('tab/last') }),
  z.object({
    type: z.literal('tab/zoom'),
    ...optionalTab.shape,
    delta: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  }),
  z.object({ type: z.literal('tab/devtools'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/contextMenu'), tabId: idSchema }),
  z.object({
    type: z.literal('split/add'),
    ...optionalTab.shape,
    direction: z.enum(['horizontal', 'vertical']).optional(),
  }),
  z.object({ type: z.literal('space/select'), spaceId: idSchema }),
  z.object({ type: z.literal('space/next') }),
  z.object({ type: z.literal('space/previous') }),
  z.object({ type: z.literal('space/nth'), index: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal('space/clearToday') }),
  z.object({ type: z.literal('space/new') }),
  z.object({ type: z.literal('window/toggleSidebar') }),
  z.object({ type: z.literal('window/new') }),
  z.object({ type: z.literal('window/little'), input: z.string().max(8192).optional() }),
  z.object({ type: z.literal('window/close') }),
  z.object({ type: z.literal('window/sidebarHover'), hovering: z.boolean() }),
  z.object({ type: z.literal('commandBar/open'), mode: z.enum(['new', 'edit']) }),
  z.object({ type: z.literal('overlay/close') }),
  z.object({ type: z.literal('peek/expand') }),
  z.object({ type: z.literal('peek/close') }),
  z.object({ type: z.literal('little/moveToSpace'), spaceId: idSchema.optional() }),
  z.object({ type: z.literal('archive/restore'), id: idSchema }),
  z.object({ type: z.literal('settings/open') }),
  z.object({ type: z.literal('import/arc') }),
  z.object({ type: z.literal('space/delete'), spaceId: idSchema }),
  z.object({ type: z.literal('space/contextMenu'), spaceId: idSchema }),
  z.object({ type: z.literal('library/open'), section: librarySectionSchema.optional() }),
  z.object({ type: z.literal('boost/open'), ...optionalTab.shape }),
  z.object({ type: z.literal('boost/zap'), boostId: idSchema, ...optionalTab.shape }),
  z.object({ type: z.literal('boost/zapStop') }),
  z.object({ type: z.literal('boost/reloadTabs'), boostId: idSchema }),
  z.object({ type: z.literal('routes/open') }),
  z.object({ type: z.literal('browser/setDefault') }),
  z.object({ type: z.literal('browser/checkDefault') }),
  z.object({ type: z.literal('find/open') }),
  z.object({ type: z.literal('find/query'), tabId: idSchema, query: z.string().max(1000) }),
  z.object({ type: z.literal('find/step'), ...optionalTab.shape, forward: z.boolean() }),
  z.object({ type: z.literal('find/close'), ...optionalTab.shape }),
  z.object({
    type: z.literal('permission/respond'),
    tabId: idSchema,
    promptId: idSchema,
    allow: z.boolean(),
    remember: z.boolean(),
    sourceId: z.string().max(500).optional(),
  }),
  z.object({ type: z.literal('privacy/siteMenu'), ...optionalTab.shape }),
  z.object({
    type: z.literal('privacy/clearData'),
    profileId: idSchema,
    cookies: z.boolean(),
    cache: z.boolean(),
    storage: z.boolean(),
  }),
  z.object({ type: z.literal('window/newPrivate') }),
  z.object({
    type: z.literal('capture/start'),
    easelId: idSchema.optional(),
    view: z
      .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .optional(),
  }),
  z.object({ type: z.literal('easel/new') }),
  z.object({ type: z.literal('note/new') }),
  z.object({ type: z.literal('feed/follow'), ...optionalTab.shape }),
  z.object({ type: z.literal('feed/refresh'), folderId: idSchema }),
  z.object({
    type: z.literal('capture/region'),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.object({ type: z.literal('media/toggle'), tabId: idSchema }),
  z.object({ type: z.literal('media/pip'), tabId: idSchema }),
  z.object({
    type: z.literal('tab/devtoolsMode'),
    ...optionalTab.shape,
    mode: z.enum(['docked', 'window']),
  }),
  z.object({
    type: z.literal('tab/inspect'),
    ...optionalTab.shape,
    x: z.number().int(),
    y: z.number().int(),
  }),
  z.object({ type: z.literal('sync/useICloud') }),
  z.object({ type: z.literal('sync/chooseFolder') }),
  z.object({ type: z.literal('sync/stop') }),
  z.object({ type: z.literal('sync/now') }),
  z.object({ type: z.literal('update/check') }),
  z.object({ type: z.literal('update/open') }),
  z.object({
    type: z.literal('extensions/menu'),
    profileId: idSchema,
    extensionId: z.string().regex(/^[a-p]{32}$/),
  }),
])
export type Command = z.infer<typeof commandSchema>
export type CommandType = Command['type']

export const privacyCommandTypes = [
  'find/open',
  'find/query',
  'find/step',
  'find/close',
  'permission/respond',
  'privacy/siteMenu',
  'privacy/clearData',
  'window/newPrivate',
] as const
export type PrivacyCommand = Extract<Command, { type: (typeof privacyCommandTypes)[number] }>

export const syncCommandTypes = [
  'sync/useICloud',
  'sync/chooseFolder',
  'sync/stop',
  'sync/now',
] as const
export type SyncCommand = Extract<Command, { type: (typeof syncCommandTypes)[number] }>
