import { z } from 'zod'

export const RELEASES_URL = 'https://api.github.com/repos/nesetkab/ante/releases/latest'
export const RELEASE_PAGE_PREFIX = 'https://github.com/nesetkab/ante/releases/'

export interface Release {
  version: string
  url: string
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function parseVersion(text: string): [number, number, number, string | null] | null {
  const match = VERSION.exec(text.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? null]
}

export function isNewer(candidate: string, current: string): boolean {
  const next = parseVersion(candidate)
  const now = parseVersion(current)
  if (!next || !now) return false
  for (let index = 0; index < 3; index++) {
    const a = next[index] as number
    const b = now[index] as number
    if (a !== b) return a > b
  }
  return now[3] !== null && next[3] === null
}

const releaseSchema = z.object({
  tag_name: z.string().max(100),
  html_url: z.string().max(2000),
  draft: z.boolean().default(false),
  prerelease: z.boolean().default(false),
})

export function parseRelease(raw: unknown): Release | null {
  const parsed = releaseSchema.safeParse(raw)
  if (!parsed.success || parsed.data.draft || parsed.data.prerelease) return null
  const { tag_name: tag, html_url: url } = parsed.data
  const version = parseVersion(tag)
  if (!version || !url.startsWith(RELEASE_PAGE_PREFIX)) return null
  return { version: version.slice(0, 3).join('.'), url }
}
