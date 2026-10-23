import { z } from 'zod'
import type { Data } from './schema'

export const sitePermissions = [
  'camera',
  'microphone',
  'location',
  'notifications',
  'midi',
  'clipboard',
  'idle',
  'files',
  'externalApp',
] as const
export const sitePermissionSchema = z.enum(sitePermissions)
export type SitePermission = z.infer<typeof sitePermissionSchema>

export const permissionDecisionSchema = z.enum(['allow', 'block'])
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>

export const originSchema = z.string().min(1).max(2048)

export const siteDecisionsSchema = z.partialRecord(sitePermissionSchema, permissionDecisionSchema)
export type SiteDecisions = z.infer<typeof siteDecisionsSchema>

export const sitePermissionsSchema = z.record(
  z.string().min(1).max(200),
  z.record(originSchema, siteDecisionsSchema),
)
export type SitePermissionsData = z.infer<typeof sitePermissionsSchema>

export const permissionLabels: Record<SitePermission, string> = {
  camera: 'Camera',
  microphone: 'Microphone',
  location: 'Location',
  notifications: 'Notifications',
  midi: 'MIDI devices',
  clipboard: 'Clipboard',
  idle: 'Idle detection',
  files: 'Edit files',
  externalApp: 'Open apps',
}

const requestVerbs: Record<SitePermission, string> = {
  camera: 'use your camera',
  microphone: 'use your microphone',
  location: 'know your location',
  notifications: 'show notifications',
  midi: 'use your MIDI devices',
  clipboard: 'see text and images copied to the clipboard',
  idle: 'know when you are actively using this device',
  files: 'edit files on your device',
  externalApp: 'open an external application',
}

export function describeRequest(permissions: readonly SitePermission[]): string {
  const verbs = permissions.map((permission) => requestVerbs[permission])
  if (verbs.length <= 1) return verbs[0] ?? ''
  return `${verbs.slice(0, -1).join(', ')} and ${verbs.at(-1) ?? ''}`
}

export function permissionsForRequest(
  permission: string,
  mediaTypes: readonly string[] = [],
): SitePermission[] | null {
  switch (permission) {
    case 'media': {
      const kinds: SitePermission[] = []
      if (mediaTypes.includes('video')) kinds.push('camera')
      if (mediaTypes.includes('audio')) kinds.push('microphone')
      return kinds.length > 0 ? kinds : null
    }
    case 'geolocation':
      return ['location']
    case 'notifications':
      return ['notifications']
    case 'midi':
    case 'midiSysex':
      return ['midi']
    case 'clipboard-read':
      return ['clipboard']
    case 'idle-detection':
      return ['idle']
    case 'fileSystem':
      return ['files']
    case 'openExternal':
      return ['externalApp']
    default:
      return null
  }
}

export function permissionsForCheck(permission: string, mediaType?: string): SitePermission[] {
  if (permission === 'media') {
    if (mediaType === 'video') return ['camera']
    if (mediaType === 'audio') return ['microphone']
    return []
  }
  return permissionsForRequest(permission) ?? []
}

export function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const { origin } = new URL(url)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

export type Evaluation =
  | { result: 'allow' }
  | { result: 'block' }
  | { result: 'ask'; pending: SitePermission[] }

export function evaluate(
  stored: SiteDecisions | undefined,
  permissions: readonly SitePermission[],
): Evaluation {
  if (permissions.some((permission) => stored?.[permission] === 'block')) return { result: 'block' }
  const pending = permissions.filter((permission) => stored?.[permission] !== 'allow')
  return pending.length === 0 ? { result: 'allow' } : { result: 'ask', pending }
}

export function decisionsFor(data: Data, profileId: string, origin: string): SiteDecisions {
  return data.sitePermissions[profileId]?.[origin] ?? {}
}

export function setSitePermissions(
  data: Data,
  profileId: string,
  origin: string,
  permissions: readonly SitePermission[],
  decision: PermissionDecision,
): void {
  if (!data.profiles[profileId] || permissions.length === 0) return
  const byOrigin = (data.sitePermissions[profileId] ??= {})
  const decisions = (byOrigin[origin] ??= {})
  for (const permission of permissions) decisions[permission] = decision
}

export function clearSitePermission(
  data: Data,
  profileId: string,
  origin: string,
  permission?: SitePermission,
): void {
  const byOrigin = data.sitePermissions[profileId]
  const decisions = byOrigin?.[origin]
  if (!byOrigin || !decisions) return
  if (permission) Reflect.deleteProperty(decisions, permission)
  if (!permission || Object.keys(decisions).length === 0) Reflect.deleteProperty(byOrigin, origin)
  if (Object.keys(byOrigin).length === 0) Reflect.deleteProperty(data.sitePermissions, profileId)
}

export interface ScreenSource {
  id: string
  name: string
  thumbnail: string
  type: 'screen' | 'window'
}

export type Prompt =
  | {
      id: string
      kind: 'permission'
      origin: string
      permissions: SitePermission[]
      detail: string | null
    }
  | { id: string; kind: 'screen'; origin: string; sources: ScreenSource[] }

export interface FindState {
  query: string
  matches: number
  active: number
  focus: number
}
