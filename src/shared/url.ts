import type { SearchEngine } from './schema'

export const searchUrls: Record<SearchEngine, string> = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
  kagi: 'https://kagi.com/search?q=',
  ecosia: 'https://www.ecosia.org/search?q=',
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:', 'data:', 'view-source:'])
const LOCAL_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)(:\d+)?(\/.*)?$/i
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/
const DOMAIN = /^([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}\.?(:\d+)?([/?#].*)?$/i

export function searchUrl(query: string, engine: SearchEngine): string {
  return searchUrls[engine] + encodeURIComponent(query)
}

export function isNavigable(url: string): boolean {
  try {
    return ALLOWED_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export function resolveInput(input: string, engine: SearchEngine): string {
  const text = input.trim()
  if (!text) return 'about:blank'
  if (/\s/.test(text)) return searchUrl(text, engine)
  if (LOCAL_HOST.test(text) || IPV4.test(text)) return `http://${text}`
  if (DOMAIN.test(text)) return `https://${text}`
  if (SCHEME.test(text) && isNavigable(text)) return text
  return searchUrl(text, engine)
}

export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url
    const host = parsed.host.replace(/^www\./, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return host + path + parsed.search + parsed.hash
  } catch {
    return url
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
