import { describe, expect, it } from 'vitest'
import { settingsPatchSchema } from '@shared/schema'
import {
  displayUrl,
  highlightLink,
  markdownLink,
  resolveInput,
  searchName,
  searchTemplate,
  searchTemplates,
  searchUrl,
  siteFaviconUrl,
} from '@shared/url'

describe('resolveInput', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['news.ycombinator.com/item?id=1', 'https://news.ycombinator.com/item?id=1'],
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1:8080/path', 'http://127.0.0.1:8080/path'],
    ['https://arc.net', 'https://arc.net'],
    ['about:blank', 'about:blank'],
    ['data:text/html,hello world', 'data:text/html,hello world'],
  ])('treats %s as an address', (input, expected) => {
    expect(resolveInput(input, searchTemplates.google)).toBe(expected)
  })

  it.each(['how to cook rice', 'typescript', 'javascript:alert(1)', 'file name.txt'])(
    'searches for %s',
    (input) => {
      expect(resolveInput(input, searchTemplates.duckduckgo)).toBe(
        `https://duckduckgo.com/?q=${encodeURIComponent(input)}`,
      )
    },
  )

  it('opens a blank page for empty input', () => {
    expect(resolveInput('   ', searchTemplates.google)).toBe('about:blank')
  })
})

describe('displayUrl', () => {
  it('drops the scheme, www and trailing slash', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com')
    expect(displayUrl('https://example.com/a?b=1#c')).toBe('example.com/a?b=1#c')
  })

  it('leaves non-web urls untouched', () => {
    expect(displayUrl('about:blank')).toBe('about:blank')
  })
})

describe('siteFaviconUrl', () => {
  it('points at the site root favicon for web pages only', () => {
    expect(siteFaviconUrl('https://news.ycombinator.com/item?id=1')).toBe(
      'https://news.ycombinator.com/favicon.ico',
    )
    expect(siteFaviconUrl('about:blank')).toBeNull()
    expect(siteFaviconUrl('not a url')).toBeNull()
  })
})

describe('markdownLink', () => {
  it.each([
    ['Docs', 'https://a.test/', '[Docs](https://a.test/)'],
    ['  Two\n lines ', 'https://a.test/', '[Two lines](https://a.test/)'],
    ['[x] \\ y', 'https://a.test/', '[\\[x\\] \\\\ y](https://a.test/)'],
    ['', 'https://a.test/', '[https://a.test/](https://a.test/)'],
    ['Wiki', 'https://w.test/A_(b) c', '[Wiki](https://w.test/A_%28b%29%20c)'],
  ])('formats %j', (title, url, expected) => {
    expect(markdownLink(title, url)).toBe(expected)
  })
})

describe('search templates', () => {
  const custom = { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' }

  it('uses the built in engine or the custom template', () => {
    expect(searchTemplate({ searchEngine: 'kagi', customSearch: custom })).toBe(
      searchTemplates.kagi,
    )
    expect(searchTemplate({ searchEngine: 'custom', customSearch: custom })).toBe(custom.url)
    expect(searchName({ searchEngine: 'custom', customSearch: custom })).toBe('Startpage')
  })

  it('falls back to Google when the custom engine is missing', () => {
    expect(searchTemplate({ searchEngine: 'custom', customSearch: null })).toBe(
      searchTemplates.google,
    )
    expect(searchName({ searchEngine: 'custom', customSearch: null })).toBe('Google')
  })

  it('fills every placeholder and keeps dollar signs literal', () => {
    expect(searchUrl('a $& b', 'https://s.test/?q=%s&again=%s')).toBe(
      'https://s.test/?q=a%20%24%26%20b&again=a%20%24%26%20b',
    )
  })
})

describe('custom search settings', () => {
  it.each([
    ['https://s.test/?q=%s', true],
    ['http://intranet.test/find/%s', true],
    ['https://s.test/?q=', false],
    ['javascript:alert(%s)', false],
    ['not a url %s', false],
  ])('accepts %s: %s', (url, valid) => {
    const parsed = settingsPatchSchema.safeParse({ customSearch: { name: 'S', url } })
    expect(parsed.success).toBe(valid)
  })
})

describe('download folder', () => {
  it('cannot be set from the ui', () => {
    const parsed = settingsPatchSchema.safeParse({ downloadFolder: '/tmp' })
    expect(parsed.success && 'downloadFolder' in parsed.data).toBe(false)
  })
})

describe('highlightLink', () => {
  it('links short selections exactly and drops the old fragment', () => {
    expect(highlightLink('https://a.test/page#top', '  Hello,  world-wide ')).toBe(
      'https://a.test/page#:~:text=Hello%2C%20world%2Dwide',
    )
  })

  it('uses a start and end for long selections', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen'
    expect(highlightLink('https://a.test/', text)).toBe(
      'https://a.test/#:~:text=one%20two%20three%20four,twelve%20thirteen%20fourteen%20fifteen',
    )
  })

  it('skips pages that are not on the web', () => {
    expect(highlightLink('ante:note/1', 'hello')).toBeNull()
    expect(highlightLink('https://a.test/', '   ')).toBeNull()
  })
})
