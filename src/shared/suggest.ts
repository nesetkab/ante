import { z } from 'zod'
import type { SearchEngine } from './schema'

export const MAX_SUGGESTIONS = 8

const suggestEndpoints: Record<SearchEngine, string> = {
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&q=',
  duckduckgo: 'https://duckduckgo.com/ac/?q=',
  bing: 'https://api.bing.com/osjson.aspx?query=',
  brave: 'https://search.brave.com/api/suggest?q=',
  kagi: 'https://kagi.com/api/autosuggest?q=',
  ecosia: 'https://ac.ecosia.org/autocomplete?type=list&q=',
}

export const suggestQuerySchema = z.string().trim().min(1).max(512)

export function suggestUrl(engine: SearchEngine, query: string): string {
  return suggestEndpoints[engine] + encodeURIComponent(query)
}

const openSearchSchema = z.tuple([z.string(), z.array(z.unknown())]).rest(z.unknown())
const phraseListSchema = z.array(z.object({ phrase: z.string() }).loose())

function extract(raw: unknown): string[] {
  const openSearch = openSearchSchema.safeParse(raw)
  if (openSearch.success)
    return openSearch.data[1].filter((item): item is string => typeof item === 'string')
  const phrases = phraseListSchema.safeParse(raw)
  if (phrases.success) return phrases.data.map((item) => item.phrase)
  return []
}

export function parseSuggestions(raw: unknown, query = ''): string[] {
  const typed = query.trim().toLowerCase()
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of extract(raw)) {
    const text = value.trim()
    const key = text.toLowerCase()
    if (!text || text.length > 512 || key === typed || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= MAX_SUGGESTIONS) break
  }
  return result
}
