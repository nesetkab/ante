import { z } from 'zod'
import { idSchema, type Id } from './schema'

export const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/'

const PARTITION_PREFIX = 'persist:profile-'

export function profilePartition(profileId: Id): string {
  return `${PARTITION_PREFIX}${profileId}`
}

export function profileFromPartition(partition: string): Id | null {
  if (!partition.startsWith(PARTITION_PREFIX)) return null
  const parsed = idSchema.safeParse(partition.slice(PARTITION_PREFIX.length))
  return parsed.success ? parsed.data : null
}

const actionDetailsSchema = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  color: z.union([z.string(), z.array(z.number()).length(4)]).optional(),
  popup: z.string().optional(),
  iconModified: z.number().optional(),
})

export const browserActionSchema = actionDetailsSchema.extend({
  id: z.string().regex(/^[a-p]{32}$/),
  tabs: z.record(z.string(), actionDetailsSchema).default({}),
})
export type BrowserAction = z.infer<typeof browserActionSchema>

export const browserActionStateSchema = z.object({
  activeTabId: z.number().int().optional(),
  actions: z.array(browserActionSchema),
})
export type BrowserActionState = z.infer<typeof browserActionStateSchema>

export interface ActionView {
  id: string
  title: string
  badge: string | null
  badgeColor: string | null
  iconModified: number | null
}

function badgeColor(color: string | number[] | undefined): string | null {
  if (typeof color === 'string') return color
  if (!color) return null
  const [r = 0, g = 0, b = 0, a = 255] = color
  return `rgb(${r} ${g} ${b} / ${a / 255})`
}

export function actionView(action: BrowserAction, tabId: number | undefined): ActionView {
  const tab = tabId === undefined ? undefined : action.tabs[String(tabId)]
  const merged = { ...action, ...tab }
  return {
    id: action.id,
    title: merged.title ?? action.id,
    badge: merged.text ? merged.text : null,
    badgeColor: badgeColor(merged.color),
    iconModified: merged.iconModified ?? null,
  }
}

export function actionIconUrl(view: ActionView, partition: string, tabId: number | undefined) {
  const params = new URLSearchParams({ tabId: String(tabId ?? -1), partition })
  if (view.iconModified !== null) params.set('t', String(view.iconModified))
  return `crx://extension-icon/${view.id}/32/2?${params.toString()}`
}
