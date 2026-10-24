import { describe, expect, it } from 'vitest'
import { bookmarksToImport, fromChromeTime, parseChromeBookmarks } from '@shared/importers/chrome'

const bookmarks = {
  roots: {
    bookmark_bar: {
      type: 'folder',
      name: 'Bookmarks bar',
      children: [
        { type: 'url', name: 'Docs', url: 'https://docs.test/' },
        { type: 'url', name: 'Script', url: 'javascript:alert(1)' },
        {
          type: 'folder',
          name: 'Work',
          children: [
            { type: 'url', name: 'Mail', url: 'https://mail.test/' },
            { type: 'folder', name: 'Empty', children: [] },
          ],
        },
        { type: 'mystery' },
      ],
    },
    other: {
      type: 'folder',
      name: 'Other',
      children: [{ type: 'url', name: 'Later', url: 'http://later.test/' }],
    },
  },
}

describe('parseChromeBookmarks', () => {
  it('keeps web links and non empty folders in order', () => {
    expect(parseChromeBookmarks(bookmarks)).toEqual({
      bar: [
        { kind: 'tab', url: 'https://docs.test/', title: 'Docs', customTitle: null },
        {
          kind: 'folder',
          name: 'Work',
          children: [{ kind: 'tab', url: 'https://mail.test/', title: 'Mail', customTitle: null }],
        },
      ],
      other: [{ kind: 'tab', url: 'http://later.test/', title: 'Later', customTitle: null }],
    })
  })

  it('returns nothing for files it does not understand', () => {
    expect(parseChromeBookmarks(null)).toEqual({ bar: [], other: [] })
    expect(parseChromeBookmarks({ roots: 'nope' })).toEqual({ bar: [], other: [] })
  })

  it('stops at absurd nesting', () => {
    let node: unknown = { type: 'url', name: 'Deep', url: 'https://deep.test/' }
    for (let depth = 0; depth < 50; depth += 1)
      node = { type: 'folder', name: 'f', children: [node] }
    const parsed = parseChromeBookmarks({
      roots: { bookmark_bar: { type: 'folder', name: 'bar', children: [node] } },
    })
    expect(parsed.bar).toEqual([])
  })
})

describe('bookmarksToImport', () => {
  it('makes one space named after the browser with other bookmarks in a folder', () => {
    const result = bookmarksToImport(parseChromeBookmarks(bookmarks), 'brave')
    expect(result.spaces).toHaveLength(1)
    expect(result.spaces[0]?.name).toBe('Brave')
    expect(result.spaces[0]?.pinned.at(-1)).toMatchObject({
      kind: 'folder',
      name: 'Other Bookmarks',
    })
  })

  it('makes nothing when there are no bookmarks', () => {
    expect(bookmarksToImport({ bar: [], other: [] }, 'chrome')).toEqual({
      spaces: [],
      favorites: [],
    })
  })
})

describe('fromChromeTime', () => {
  it('converts microseconds since 1601 to unix milliseconds', () => {
    expect(fromChromeTime(13_350_000_000_000_000)).toBe(Date.UTC(2024, 0, 17, 21, 20))
    expect(fromChromeTime(0)).toBe(0)
  })
})
