export interface FuzzyMatch {
  score: number
  indices: number[]
}

const WORD_BOUNDARY = /[\s/._:-]/

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return { score: 0, indices: [] }
  const haystack = text.toLowerCase()

  const direct = haystack.indexOf(needle)
  if (direct >= 0) {
    const boundary = direct === 0 || WORD_BOUNDARY.test(haystack[direct - 1] ?? '')
    const indices = Array.from({ length: needle.length }, (_, offset) => direct + offset)
    return { score: 1000 - direct + (boundary ? 200 : 0) + needle.length * 10, indices }
  }

  const indices: number[] = []
  let score = 0
  let previous = -2
  let from = 0
  for (const char of needle) {
    if (char === ' ') continue
    const index = haystack.indexOf(char, from)
    if (index < 0) return null
    score += index === previous + 1 ? 15 : 1
    if (index === 0 || WORD_BOUNDARY.test(haystack[index - 1] ?? '')) score += 10
    indices.push(index)
    previous = index
    from = index + 1
  }
  return {
    score: score - (indices[0] ?? 0) * 0.5 - (haystack.length - needle.length) * 0.05,
    indices,
  }
}

export function rank<T>(query: string, items: readonly T[], fields: (item: T) => string[]): T[] {
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    let best: number | null = null
    for (const [index, field] of fields(item).entries()) {
      const match = fuzzyMatch(query, field)
      if (!match) continue
      const weighted = match.score - index * 50
      if (best === null || weighted > best) best = weighted
    }
    if (best !== null) scored.push({ item, score: best })
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.item)
}
