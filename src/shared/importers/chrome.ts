import { z } from 'zod'
import { isWebUrl } from '../url'
import type { ArcImport, ArcNode } from './arc'

export const browserIds = ['chrome', 'brave', 'edge', 'chromium'] as const
export type BrowserId = (typeof browserIds)[number]

export const browserNames: Record<BrowserId, string> = {
  chrome: 'Chrome',
  brave: 'Brave',
  edge: 'Edge',
  chromium: 'Chromium',
}

const MAX_DEPTH = 32
const MAX_BOOKMARKS = 5000
export const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000

const urlNodeSchema = z.object({
  type: z.literal('url'),
  name: z.string().max(2000).catch(''),
  url: z.string().max(8192),
})
const folderNodeSchema = z.object({
  type: z.literal('folder'),
  name: z.string().max(2000).catch(''),
  children: z.array(z.unknown()).catch([]),
})
const rootsSchema = z.object({
  roots: z.object({
    bookmark_bar: folderNodeSchema.optional().catch(undefined),
    other: folderNodeSchema.optional().catch(undefined),
  }),
})

export interface ChromeBookmarks {
  bar: ArcNode[]
  other: ArcNode[]
}

export function parseChromeBookmarks(raw: unknown): ChromeBookmarks {
  const parsed = rootsSchema.safeParse(raw)
  if (!parsed.success) return { bar: [], other: [] }
  let budget = MAX_BOOKMARKS
  const convert = (nodes: readonly unknown[], depth: number): ArcNode[] =>
    nodes.flatMap((node): ArcNode[] => {
      if (budget <= 0 || depth > MAX_DEPTH) return []
      const link = urlNodeSchema.safeParse(node)
      if (link.success) {
        if (!isWebUrl(link.data.url)) return []
        budget -= 1
        return [{ kind: 'tab', url: link.data.url, title: link.data.name, customTitle: null }]
      }
      const folder = folderNodeSchema.safeParse(node)
      if (!folder.success) return []
      const children = convert(folder.data.children, depth + 1)
      return children.length > 0 ? [{ kind: 'folder', name: folder.data.name, children }] : []
    })
  const { bookmark_bar: bar, other } = parsed.data.roots
  return { bar: convert(bar?.children ?? [], 0), other: convert(other?.children ?? [], 0) }
}

export function bookmarksToImport(bookmarks: ChromeBookmarks, browser: BrowserId): ArcImport {
  const pinned: ArcNode[] = [...bookmarks.bar]
  if (bookmarks.other.length > 0)
    pinned.push({ kind: 'folder', name: 'Other Bookmarks', children: bookmarks.other })
  if (pinned.length === 0) return { spaces: [], favorites: [] }
  return {
    spaces: [
      {
        arcId: browser,
        name: browserNames[browser],
        icon: null,
        color: null,
        profile: { kind: 'default' },
        pinned,
        today: [],
      },
    ],
    favorites: [],
  }
}
