import { XMLParser } from 'fast-xml-parser'

export const MAX_FEED_ENTRIES = 15

export interface FeedEntry {
  url: string
  title: string
}

export interface Feed {
  title: string
  entries: FeedEntry[]
}

type Node = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  htmlEntities: true,
})

const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (isNode(value)) return text(value['#text'])
  return ''
}

function webUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function atomLink(value: unknown): string {
  const links = asArray(value).filter(isNode)
  const preferred =
    links.find((link) => link['@_rel'] === undefined || link['@_rel'] === 'alternate') ?? links[0]
  if (preferred) return text(preferred['@_href'])
  return text(value)
}

function collect(items: unknown[], link: (item: Node) => string, base?: string): FeedEntry[] {
  const seen = new Set<string>()
  const entries: FeedEntry[] = []
  for (const item of items) {
    if (!isNode(item)) continue
    const url = webUrl(link(item), base)
    if (!url || seen.has(url)) continue
    seen.add(url)
    entries.push({ url, title: text(item.title) || url })
    if (entries.length >= MAX_FEED_ENTRIES) break
  }
  return entries
}

export function parseFeed(xml: string, base?: string): Feed | null {
  let document: unknown
  try {
    document = parser.parse(xml)
  } catch {
    return null
  }
  if (!isNode(document)) return null

  const rss = document.rss
  if (isNode(rss) && isNode(rss.channel)) {
    const channel = rss.channel
    return {
      title: text(channel.title),
      entries: collect(asArray(channel.item), (item) => text(item.link) || text(item.guid), base),
    }
  }

  const atom = document.feed
  if (isNode(atom)) {
    return {
      title: text(atom.title),
      entries: collect(asArray(atom.entry), (item) => atomLink(item.link), base),
    }
  }

  const rdf = document['rdf:RDF']
  if (isNode(rdf)) {
    const channel = isNode(rdf.channel) ? rdf.channel : {}
    return {
      title: text(channel.title),
      entries: collect(asArray(rdf.item), (item) => text(item.link), base),
    }
  }

  return null
}

const LINK_TAG = /<link\b[^>]*>/gi
const ATTRIBUTE = /([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi
const FEED_TYPES = new Set(['application/rss+xml', 'application/atom+xml'])

export function discoverFeedUrl(html: string, pageUrl: string): string | null {
  for (const tag of html.match(LINK_TAG) ?? []) {
    const attributes = new Map<string, string>()
    for (const match of tag.matchAll(ATTRIBUTE)) {
      const name = match[1]?.toLowerCase()
      const value = match[3] ?? match[4] ?? match[5] ?? ''
      if (name) attributes.set(name, value)
    }
    const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? []
    const type = attributes.get('type')?.toLowerCase() ?? ''
    const href = attributes.get('href')
    if (rel.includes('alternate') && FEED_TYPES.has(type) && href) {
      const url = webUrl(href, pageUrl)
      if (url) return url
    }
  }
  return null
}
