import { app, session, type Session } from 'electron'
import type { Id } from '@shared/schema'
import { isPrivateProfile } from '@shared/state/private'

export const PROMPTLESS_PERMISSIONS: ReadonlySet<string> = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
  'keyboardLock',
  'window-management',
])

export function chromeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s?Electron\/\S+/i, '')
    .replace(new RegExp(`\\s?${app.getName()}/\\S+`, 'i'), '')
    .trim()
}

export function partitionFor(profileId: Id): string {
  return isPrivateProfile(profileId) ? profileId : `persist:profile-${profileId}`
}

export type SessionSetup = (session: Session, profileId: Id) => void

export class Sessions {
  readonly #configured = new Map<Id, Session>()
  readonly #setups: SessionSetup[] = []

  onCreate(setup: SessionSetup): void {
    this.#setups.push(setup)
    for (const [profileId, configured] of this.#configured) setup(configured, profileId)
  }

  forProfile(profileId: Id): Session {
    const existing = this.#configured.get(profileId)
    if (existing) return existing
    const created = session.fromPartition(partitionFor(profileId))
    created.setUserAgent(chromeUserAgent(created.getUserAgent()))
    created.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(PROMPTLESS_PERMISSIONS.has(permission))
    })
    created.setPermissionCheckHandler((_contents, permission) =>
      PROMPTLESS_PERMISSIONS.has(permission),
    )
    this.#configured.set(profileId, created)
    for (const setup of this.#setups) setup(created, profileId)
    return created
  }
}
