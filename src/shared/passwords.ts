import type { Id } from './schema'

export interface LoginSummary {
  id: Id
  profileId: Id
  origin: string
  username: string
  updatedAt: number
}

export interface LoginChoice {
  id: Id
  username: string
}

export const MAX_USERNAME = 1_000
export const MAX_PASSWORD = 4_096

export function loginOrigin(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null
  } catch {
    return null
  }
}

const withoutWww = (origin: string) => origin.replace(/^(https?:\/\/)www\./, '$1')

export function sameLoginSite(a: string, b: string): boolean {
  return a === b || withoutWww(a) === withoutWww(b)
}

export function siteName(origin: string): string {
  try {
    return new URL(origin).host.replace(/^www\./, '')
  } catch {
    return origin
  }
}
