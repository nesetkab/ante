import { describe, expect, it } from 'vitest'
import { fuzzyMatch, rank } from '@shared/fuzzy'

describe('fuzzyMatch', () => {
  it('matches everything with an empty query', () => {
    expect(fuzzyMatch('   ', 'anything')).toEqual({ score: 0, indices: [] })
  })

  it('returns the indices of a direct match', () => {
    expect(fuzzyMatch('Hub', 'GitHub')?.indices).toEqual([3, 4, 5])
  })

  it('ranks a prefix above a later substring', () => {
    const prefix = fuzzyMatch('git', 'github.com')?.score ?? 0
    const later = fuzzyMatch('git', 'legit.com')?.score ?? 0
    expect(prefix).toBeGreaterThan(later)
  })

  it('rewards substrings that start a word', () => {
    const boundary = fuzzyMatch('news', 'hacker news')?.score ?? 0
    const inside = fuzzyMatch('news', 'hackernews')?.score ?? 0
    expect(boundary).toBeGreaterThan(inside)
  })

  it('ranks direct matches above scattered ones', () => {
    const direct = fuzzyMatch('mail', 'gmail')?.score ?? 0
    const scattered = fuzzyMatch('mail', 'my archive in london')?.score ?? 0
    expect(direct).toBeGreaterThan(scattered)
  })

  it('matches characters in order and skips spaces in the query', () => {
    expect(fuzzyMatch('g d', 'google docs')).toMatchObject({ indices: [0, 7] })
    expect(fuzzyMatch('gdc', 'google docs')?.indices).toEqual([0, 7, 9])
  })

  it('prefers consecutive and word start characters', () => {
    const tight = fuzzyMatch('gdo', 'google docs')?.score ?? 0
    const loose = fuzzyMatch('gdo', 'gxxxdxxxo')?.score ?? 0
    expect(tight).toBeGreaterThan(loose)
  })

  it('returns null when characters are missing or out of order', () => {
    expect(fuzzyMatch('xyz', 'google')).toBeNull()
    expect(fuzzyMatch('elg', 'google')).toBeNull()
  })

  it('ignores case', () => {
    expect(fuzzyMatch('GOOGLE', 'google')).not.toBeNull()
  })
})

describe('rank', () => {
  interface Entry {
    title: string
    url: string
  }
  const entries: Entry[] = [
    { title: 'Inbox', url: 'mail.google.com' },
    { title: 'Google Docs', url: 'docs.google.com' },
    { title: 'Weather', url: 'weather.com' },
    { title: 'Docs', url: 'example.com' },
  ]
  const fields = (entry: Entry) => [entry.title, entry.url]

  it('drops entries that do not match any field', () => {
    expect(rank('zzz', entries, fields)).toEqual([])
  })

  it('orders by best score', () => {
    expect(rank('docs', entries, fields).map((entry) => entry.title)).toEqual([
      'Docs',
      'Google Docs',
    ])
  })

  it('weights earlier fields higher', () => {
    const items = [
      { title: 'other', url: 'mail' },
      { title: 'mail', url: 'other' },
    ]
    expect(rank('mail', items, (item) => [item.title, item.url])[0]?.title).toBe('mail')
  })

  it('keeps the original order for an empty query', () => {
    expect(rank('', entries, fields)).toEqual(entries)
  })
})
