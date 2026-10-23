import { z } from 'zod'
import { fuzzyMatch } from './fuzzy'
import { displayUrl, hostOf } from './url'

export const MAX_HISTORY_URL = 8192
const DAY = 24 * 60 * 60 * 1000
const RECORDABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:'])

export interface HistoryEntry {
  id: number
  url: string
  title: string
  favicon: string | null
  visitCount: number
  lastVisit: number
}

export interface HistoryResult {
  entries: HistoryEntry[]
  completion: string | null
}

export const historyQuerySchema = z.object({
  query: z.string().max(2048),
  limit: z.number().int().min(1).max(500),
  order: z.enum(['relevance', 'recent']).default('relevance'),
  before: z.number().optional(),
})
export type HistoryQuery = z.input<typeof historyQuerySchema>

export const historyDeleteSchema = z.array(z.number().int()).max(1000)

export function isRecordable(url: string): boolean {
  if (url.length > MAX_HISTORY_URL) return false
  try {
    return RECORDABLE_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

const RECENCY_BUCKETS: readonly (readonly [number, number])[] = [
  [4 * DAY, 100],
  [14 * DAY, 70],
  [31 * DAY, 50],
  [90 * DAY, 30],
]

export function recencyWeight(age: number): number {
  for (const [limit, weight] of RECENCY_BUCKETS) if (age <= limit) return weight
  return 10
}

export function frecency(
  entry: Pick<HistoryEntry, 'visitCount' | 'lastVisit'>,
  now: number,
): number {
  return recencyWeight(now - entry.lastVisit) * Math.log2(entry.visitCount + 1)
}

const FRECENCY_WEIGHT = 3
const HOST_PREFIX_BONUS = 400

export function rankHistory(
  query: string,
  entries: readonly HistoryEntry[],
  now: number,
): HistoryEntry[] {
  const needle = query.trim().toLowerCase()
  const scored: { entry: HistoryEntry; score: number }[] = []
  for (const entry of entries) {
    const boost = frecency(entry, now) * FRECENCY_WEIGHT
    if (!needle) {
      scored.push({ entry, score: boost })
      continue
    }
    const title = fuzzyMatch(needle, entry.title)
    const address = fuzzyMatch(needle, displayUrl(entry.url))
    if (!title && !address) continue
    const match = Math.max(title?.score ?? -Infinity, address?.score ?? -Infinity)
    const hostBonus = hostOf(entry.url).startsWith(needle) ? HOST_PREFIX_BONUS : 0
    scored.push({ entry, score: match + boost + hostBonus })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.entry.lastVisit - a.entry.lastVisit)
    .map(({ entry }) => entry)
}

export interface HostStat {
  host: string
  visitCount: number
  lastVisit: number
}

function bestBy<T>(items: readonly T[], score: (item: T) => number): T | null {
  let best: T | null = null
  let bestScore = -Infinity
  for (const item of items) {
    const value = score(item)
    if (value > bestScore) {
      best = item
      bestScore = value
    }
  }
  return best
}

function completionInput(query: string): string | null {
  const typed = query.trimStart()
  if (!typed || /\s/.test(typed) || typed.includes('://')) return null
  return typed
}

export function hostCompletion(query: string, hosts: readonly HostStat[], now: number) {
  const typed = completionInput(query)
  if (!typed || typed.includes('/')) return null
  const lower = typed.toLowerCase()
  const candidates = hosts.flatMap((stat) => {
    const bare = stat.host.toLowerCase().replace(/^www\./, '')
    const host = lower.startsWith('www.') ? `www.${bare}` : bare
    return host.startsWith(lower) && host.length > lower.length ? [{ ...stat, host }] : []
  })
  const best = bestBy(candidates, (stat) => frecency(stat, now))
  return best ? typed + best.host.slice(typed.length) : null
}

export function urlCompletion(query: string, entries: readonly HistoryEntry[], now: number) {
  const typed = completionInput(query)
  if (!typed?.includes('/')) return null
  const lower = typed.toLowerCase()
  const candidates = entries.flatMap((entry) => {
    const address = displayUrl(entry.url)
    return address.toLowerCase().startsWith(lower) && address.length > lower.length
      ? [{ entry, address }]
      : []
  })
  const best = bestBy(candidates, ({ entry }) => frecency(entry, now))
  return best ? typed + best.address.slice(typed.length) : null
}

export function aggregateHosts(entries: readonly HistoryEntry[]): HostStat[] {
  const byHost = new Map<string, HostStat>()
  for (const entry of entries) {
    const host = hostOf(entry.url)
    if (!host || !/^https?:/.test(entry.url)) continue
    const existing = byHost.get(host)
    if (existing) {
      existing.visitCount += entry.visitCount
      existing.lastVisit = Math.max(existing.lastVisit, entry.lastVisit)
    } else {
      byHost.set(host, { host, visitCount: entry.visitCount, lastVisit: entry.lastVisit })
    }
  }
  return [...byHost.values()]
}

export function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function groupByDay<T>(items: readonly T[], timeOf: (item: T) => number) {
  const groups: { day: number; items: T[] }[] = []
  for (const item of items) {
    const day = startOfDay(timeOf(item))
    const last = groups.at(-1)
    if (last?.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}
