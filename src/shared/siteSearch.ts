export interface SiteSearch {
  id: string
  name: string
  keywords: readonly string[]
  url: string
}

export const siteSearches: readonly SiteSearch[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    keywords: ['youtube', 'yt'],
    url: 'https://www.youtube.com/results?search_query=',
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    keywords: ['wikipedia', 'wiki'],
    url: 'https://en.wikipedia.org/w/index.php?search=',
  },
  { id: 'github', name: 'GitHub', keywords: ['github', 'gh'], url: 'https://github.com/search?q=' },
  {
    id: 'reddit',
    name: 'Reddit',
    keywords: ['reddit'],
    url: 'https://www.reddit.com/search/?q=',
  },
  { id: 'amazon', name: 'Amazon', keywords: ['amazon'], url: 'https://www.amazon.com/s?k=' },
  {
    id: 'maps',
    name: 'Google Maps',
    keywords: ['maps', 'google maps'],
    url: 'https://www.google.com/maps/search/',
  },
  { id: 'x', name: 'X', keywords: ['twitter', 'x.com'], url: 'https://x.com/search?q=' },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    keywords: ['stackoverflow', 'stack overflow', 'so'],
    url: 'https://stackoverflow.com/search?q=',
  },
  {
    id: 'mdn',
    name: 'MDN',
    keywords: ['mdn'],
    url: 'https://developer.mozilla.org/search?q=',
  },
  { id: 'npm', name: 'npm', keywords: ['npm'], url: 'https://www.npmjs.com/search?q=' },
  {
    id: 'spotify',
    name: 'Spotify',
    keywords: ['spotify'],
    url: 'https://open.spotify.com/search/',
  },
  { id: 'imdb', name: 'IMDb', keywords: ['imdb'], url: 'https://www.imdb.com/find/?q=' },
]

const MIN_PREFIX = 2

export function matchSiteSearch(input: string): SiteSearch | null {
  const typed = input.trim().toLowerCase()
  if (typed.length < MIN_PREFIX) return null
  const exact = siteSearches.find((site) => site.keywords.includes(typed))
  if (exact) return exact
  if (typed.length < 3) return null
  return siteSearches.find((site) => site.keywords.some((word) => word.startsWith(typed))) ?? null
}

export function siteSearchUrl(site: SiteSearch, query: string): string {
  return site.url + encodeURIComponent(query.trim())
}
