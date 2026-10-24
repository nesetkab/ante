import type { BuiltInEngine, Settings } from './schema'

export const searchTemplates: Record<BuiltInEngine, string> = {
  google: 'https://www.google.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
  bing: 'https://www.bing.com/search?q=%s',
  brave: 'https://search.brave.com/search?q=%s',
  kagi: 'https://kagi.com/search?q=%s',
  ecosia: 'https://www.ecosia.org/search?q=%s',
}

export const engineNames: Record<BuiltInEngine, string> = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
  brave: 'Brave Search',
  kagi: 'Kagi',
  ecosia: 'Ecosia',
}

type SearchSettings = Pick<Settings, 'searchEngine' | 'customSearch'>

export function searchTemplate(settings: SearchSettings): string {
  if (settings.searchEngine !== 'custom') return searchTemplates[settings.searchEngine]
  return settings.customSearch?.url ?? searchTemplates.google
}

export function searchName(settings: SearchSettings): string {
  if (settings.searchEngine !== 'custom') return engineNames[settings.searchEngine]
  return settings.customSearch?.name ?? engineNames.google
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:', 'data:', 'view-source:'])
const LOCAL_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)(:\d+)?(\/.*)?$/i
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/
const DOMAIN = /^([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}\.?(:\d+)?([/?#].*)?$/i

const FRAGMENT_WORDS = 4
const MAX_EXACT_LENGTH = 80

const fragmentPart = (text: string) =>
  encodeURIComponent(text).replace(/-/g, '%2D').replace(/,/g, '%2C').replace(/&/g, '%26')

export function highlightLink(pageUrl: string, selection: string): string | null {
  const text = selection.replace(/\s+/g, ' ').trim()
  if (!text || !isWebUrl(pageUrl)) return null
  const base = pageUrl.split('#')[0] ?? pageUrl
  const words = text.split(' ')
  const directive =
    text.length <= MAX_EXACT_LENGTH || words.length <= FRAGMENT_WORDS * 2
      ? fragmentPart(text)
      : `${fragmentPart(words.slice(0, FRAGMENT_WORDS).join(' '))},${fragmentPart(words.slice(-FRAGMENT_WORDS).join(' '))}`
  return `${base}#:~:text=${directive}`
}

export function markdownLink(title: string, url: string): string {
  const text =
    title
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[[\]\\]/g, '\\$&') || url
  const target = url.replace(
    /[()\s]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  )
  return `[${text}](${target})`
}

export function searchUrl(query: string, template: string): string {
  return template.split('%s').join(encodeURIComponent(query))
}

export function isNavigable(url: string): boolean {
  try {
    return ALLOWED_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export function isWebUrl(url: string): boolean {
  try {
    const { protocol, href } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' || href === 'about:blank'
  } catch {
    return false
  }
}

export function resolveInput(input: string, template: string): string {
  const text = input.trim()
  if (!text) return 'about:blank'
  if (SCHEME.test(text) && isNavigable(text) && !/^[a-z]+:\s/i.test(text)) return text
  if (/\s/.test(text)) return searchUrl(text, template)
  if (LOCAL_HOST.test(text) || IPV4.test(text)) return `http://${text}`
  if (DOMAIN.test(text)) return `https://${text}`
  return searchUrl(text, template)
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

export function siteFaviconUrl(url: string): string | null {
  try {
    const { protocol, origin } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? `${origin}/favicon.ico` : null
  } catch {
    return null
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
