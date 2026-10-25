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

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function loginOrigin(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return parsed.origin
    if (parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname)) return parsed.origin
    return null
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
