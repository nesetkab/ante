import { z } from 'zod'
import type { SiteDecisions, SitePermission } from '../permissions'

export interface ChromiumSiteSettings {
  permissions: Record<string, SiteDecisions>
  zoom: Record<string, number>
}

const contentTypes: Record<string, SitePermission> = {
  notifications: 'notifications',
  media_stream_mic: 'microphone',
  media_stream_camera: 'camera',
  geolocation: 'location',
  clipboard: 'clipboard',
  midi_sysex: 'midi',
  idle_detection: 'idle',
  file_system_write_guard: 'files',
}

const MAX_SITES = 5000
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

const exceptionSchema = z.object({ setting: z.number() })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const prefsSchema = z.object({
  profile: z
    .object({
      content_settings: z
        .object({ exceptions: z.record(z.string(), z.unknown()).catch({}) })
        .catch({ exceptions: {} }),
    })
    .catch({ content_settings: { exceptions: {} } }),
  partition: z
    .object({
      per_host_zoom_levels: z.record(z.string(), z.unknown()).catch({}),
    })
    .catch({ per_host_zoom_levels: {} }),
  protocol_handler: z
    .object({
      allowed_origin_protocol_pairs: z.record(z.string(), z.unknown()).catch({}),
    })
    .catch({ allowed_origin_protocol_pairs: {} }),
})

export function patternOrigin(pattern: string): string | null {
  const primary = pattern.split(',')[0]?.trim() ?? ''
  if (!primary || primary.includes('*')) return null
  try {
    const url = new URL(primary)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

export const zoomFromLevel = (level: number) =>
  Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, 1.2 ** level)) * 100) / 100

const zoomLevelSchema = z.object({ zoom_level: z.number() })

export function parseChromiumSiteSettings(json: unknown): ChromiumSiteSettings {
  const parsed = prefsSchema.safeParse(json)
  const result: ChromiumSiteSettings = { permissions: {}, zoom: {} }
  if (!parsed.success) return result
  const { permissions, zoom } = result
  const decide = (origin: string, permission: SitePermission, allow: boolean) => {
    if (!permissions[origin] && Object.keys(permissions).length >= MAX_SITES) return
    permissions[origin] = { ...permissions[origin], [permission]: allow ? 'allow' : 'block' }
  }
  for (const [type, exceptions] of Object.entries(
    parsed.data.profile.content_settings.exceptions,
  )) {
    const permission = contentTypes[type]
    if (!permission || !isRecord(exceptions)) continue
    for (const [pattern, value] of Object.entries(exceptions)) {
      const origin = patternOrigin(pattern)
      const exception = exceptionSchema.safeParse(value)
      if (!origin || !exception.success) continue
      if (exception.data.setting === 1) decide(origin, permission, true)
      if (exception.data.setting === 2) decide(origin, permission, false)
    }
  }
  for (const [origin, schemes] of Object.entries(
    parsed.data.protocol_handler.allowed_origin_protocol_pairs,
  )) {
    const allowed = isRecord(schemes) && Object.values(schemes).includes(true)
    const normalized = patternOrigin(origin)
    if (allowed && normalized) decide(normalized, 'externalApp', true)
  }
  for (const hosts of Object.values(parsed.data.partition.per_host_zoom_levels)) {
    if (!isRecord(hosts)) continue
    for (const [host, value] of Object.entries(hosts)) {
      const level = zoomLevelSchema.safeParse(value)
      if (!level.success || !host || host.length > 253 || Object.keys(zoom).length >= MAX_SITES)
        continue
      const factor = zoomFromLevel(level.data.zoom_level)
      if (Math.abs(factor - 1) > 0.001) zoom[host.toLowerCase()] = factor
    }
  }
  return result
}
