import { domainMatches, hostnameOf } from './boosts'
import type { Route, RouteMatch } from './schema'

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i')
    return true
  } catch {
    return false
  }
}

export function routeMatches(match: RouteMatch, url: string): boolean {
  const value = match.value.trim()
  if (!value) return false
  switch (match.kind) {
    case 'domain': {
      const host = hostnameOf(url)
      return host !== null && domainMatches(host, value)
    }
    case 'contains':
      return url.toLowerCase().includes(value.toLowerCase())
    case 'regex':
      return isValidRegex(value) && new RegExp(value, 'i').test(url)
  }
}

export function findRoute(
  routes: readonly Route[],
  url: string,
  spaceExists: (spaceId: string) => boolean,
): Route | null {
  return routes.find((route) => spaceExists(route.spaceId) && routeMatches(route.match, url)) ?? null
}

export function isExternalUrl(input: string): boolean {
  try {
    const { protocol } = new URL(input)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
