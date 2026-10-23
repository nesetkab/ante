import { z } from 'zod'
import { idSchema } from './schema'

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
  z.object({ type: z.literal('tab/copyUrl'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/togglePin'), ...optionalTab.shape }),
  z.object({ type: z.literal('tab/next') }),
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
  z.object({ type: z.literal('boost/open'), ...optionalTab.shape }),
  z.object({ type: z.literal('boost/zap'), boostId: idSchema, ...optionalTab.shape }),
  z.object({ type: z.literal('boost/zapStop') }),
  z.object({ type: z.literal('boost/reloadTabs'), boostId: idSchema }),
  z.object({ type: z.literal('routes/open') }),
  z.object({ type: z.literal('browser/setDefault') }),
  z.object({ type: z.literal('browser/checkDefault') }),
])
export type Command = z.infer<typeof commandSchema>
export type CommandType = Command['type']
