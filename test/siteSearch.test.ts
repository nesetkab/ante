import { describe, expect, it } from 'vitest'
import { matchSiteSearch, siteSearches, siteSearchUrl } from '@shared/siteSearch'

describe('matchSiteSearch', () => {
  it.each([
    ['youtube', 'youtube'],
    ['YT', 'youtube'],
    ['you', 'youtube'],
    ['  wiki ', 'wikipedia'],
    ['gh', 'github'],
    ['stack', 'stackoverflow'],
    ['so', 'stackoverflow'],
  ])('matches %j to %s', (input, id) => {
    expect(matchSiteSearch(input)?.id).toBe(id)
  })

  it.each(['', 'y', 'yo', 'youtube cats', 'example.com', 'zzz'])('ignores %j', (input) => {
    expect(matchSiteSearch(input)).toBeNull()
  })

  it('only uses https search pages and unique ids', () => {
    for (const site of siteSearches) expect(site.url.startsWith('https://')).toBe(true)
    expect(new Set(siteSearches.map((site) => site.id)).size).toBe(siteSearches.length)
  })
})

describe('siteSearchUrl', () => {
  it('encodes the query', () => {
    const youtube = matchSiteSearch('youtube')
    expect(youtube && siteSearchUrl(youtube, ' lo-fi & chill ')).toBe(
      'https://www.youtube.com/results?search_query=lo-fi%20%26%20chill',
    )
  })
})
