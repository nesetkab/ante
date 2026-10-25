import { describe, expect, it } from 'vitest'
import {
  boostsForUrl,
  composeBoostCss,
  domainMatches,
  findBoostForHost,
  normalizeDomain,
  scriptsForUrl,
} from '@shared/boosts'
import { findRoute, isExternalUrl, routeMatches } from '@shared/routing'
import { boostSchema, dataSchema, zapSelectorSchema, type Boost, type Route } from '@shared/schema'
import { cssEscape, selectorCandidates, type ZapNode } from '@shared/zap'

const boost = (id: string, domain: string, extra: Partial<Boost> = {}): Boost => ({
  ...boostSchema.parse({ id, domain }),
  ...extra,
})

describe('domains', () => {
  it('normalizes pasted addresses', () => {
    expect(normalizeDomain(' https://www.GitHub.com:443/path?q#x ')).toBe('github.com')
    expect(normalizeDomain('user@example.com.')).toBe('example.com')
  })

  it('matches subdomains but not lookalikes', () => {
    expect(domainMatches('gist.github.com', 'github.com')).toBe(true)
    expect(domainMatches('notgithub.com', 'github.com')).toBe(false)
    expect(domainMatches('github.com', '')).toBe(false)
  })
})

describe('boosts', () => {
  const boosts = {
    broad: boost('broad', 'github.com', { css: 'body { color: red }', js: 'console.log(1)' }),
    narrow: boost('narrow', 'gist.github.com', { css: 'h1 { color: blue }' }),
    off: boost('off', 'github.com', { enabled: false, css: 'nope' }),
  }

  it('applies enabled boosts from broadest to most specific', () => {
    expect(boostsForUrl(boosts, 'https://gist.github.com/a').map((item) => item.id)).toEqual([
      'broad',
      'narrow',
    ])
    expect(boostsForUrl(boosts, 'file:///tmp/a.html')).toEqual([])
  })

  it('finds the most specific boost for a host', () => {
    expect(findBoostForHost(boosts, 'gist.github.com')?.id).toBe('narrow')
    expect(findBoostForHost(boosts, 'api.github.com')?.id).toBe('broad')
  })

  it('collects scripts only for matching sites', () => {
    expect(scriptsForUrl(boosts, 'https://github.com')).toEqual(['console.log(1)'])
    expect(scriptsForUrl(boosts, 'https://example.com')).toEqual([])
  })

  it('composes fonts, colors, zaps and custom css', () => {
    const css = composeBoostCss(
      boost('all', 'example.com', {
        fontFamily: 'Inter',
        invert: true,
        tintHue: 200,
        zaps: ['div.ad'],
        css: 'p { margin: 0 }',
      }),
    )
    expect(css).toContain('"Inter"')
    expect(css).toContain('invert(1)')
    expect(css).toContain('hsl(200')
    expect(css).toContain('div.ad { display: none !important; }')
    expect(css.endsWith('p { margin: 0 }')).toBe(true)
  })
})

describe('zap selectors', () => {
  it('rejects selectors that could break out of a rule', () => {
    expect(zapSelectorSchema.safeParse('div.ad').success).toBe(true)
    expect(zapSelectorSchema.safeParse('div { } body').success).toBe(false)
    expect(zapSelectorSchema.safeParse('div /* hide rest').success).toBe(false)
  })

  it('escapes identifiers safely', () => {
    expect(cssEscape('1abc')).toBe('\\31 abc')
    expect(cssEscape('a.b')).toBe('a\\2e b')
  })

  const node = (tag: string, extra: Partial<ZapNode> = {}): ZapNode => ({
    tag,
    id: null,
    classes: [],
    attributes: [],
    nth: 1,
    ofType: 1,
    ...extra,
  })

  it('prefers stable ids and attributes over generated class names', () => {
    const candidates = selectorCandidates([
      node('div', {
        classes: ['css-1x9z8qk', 'promo'],
        attributes: [{ name: 'data-testid', value: 'banner' }],
      }),
      node('main', { id: 'content' }),
      node('body'),
    ])
    expect(candidates[0]).toBe('div[data-testid="banner"]')
    expect(candidates).toContain('div.promo')
    expect(candidates.some((selector) => selector.includes('css-1x9z8qk'))).toBe(false)
  })

  it('falls back to a structural path', () => {
    const candidates = selectorCandidates([node('span', { nth: 2, ofType: 3 }), node('body')])
    expect(candidates.at(-1)).toBe('body > span:nth-of-type(2)')
  })
})

describe('air traffic control', () => {
  const routes: Route[] = [
    { id: 'a', match: { kind: 'domain', value: 'figma.com' }, target: 'space', spaceId: 'work' },
    {
      id: 'b',
      match: { kind: 'contains', value: 'meet.google' },
      target: 'space',
      spaceId: 'work',
    },
    {
      id: 'c',
      match: { kind: 'regex', value: '^https://.*\\.youtube\\.com' },
      target: 'space',
      spaceId: 'fun',
    },
    { id: 'd', match: { kind: 'domain', value: 'gone.com' }, target: 'space', spaceId: 'deleted' },
    { id: 'e', match: { kind: 'domain', value: 'zoom.us' }, target: 'little', spaceId: 'deleted' },
  ]
  const exists = (spaceId: string) => spaceId !== 'deleted'

  it('routes links by domain, substring and regex', () => {
    expect(findRoute(routes, 'https://www.figma.com/file/1', exists)?.spaceId).toBe('work')
    expect(findRoute(routes, 'https://meet.google.com/abc', exists)?.spaceId).toBe('work')
    expect(findRoute(routes, 'https://music.youtube.com', exists)?.spaceId).toBe('fun')
    expect(findRoute(routes, 'https://example.com', exists)).toBeNull()
  })

  it('keeps little window and current space rules whatever their space is', () => {
    expect(findRoute(routes, 'https://zoom.us/j/1', exists)?.target).toBe('little')
  })

  it('skips rules for deleted spaces and invalid patterns', () => {
    expect(findRoute(routes, 'https://gone.com', exists)).toBeNull()
    expect(routeMatches({ kind: 'regex', value: '([' }, 'https://x.com')).toBe(false)
  })

  it('only accepts web links from outside', () => {
    expect(isExternalUrl('https://example.com')).toBe(true)
    expect(isExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('schema defaults', () => {
  it('loads state saved before boosts and routes existed', () => {
    const parsed = dataSchema.parse({
      version: 1,
      profiles: { default: { id: 'default', name: 'Default' } },
      spaces: {},
      spaceOrder: [],
      items: {},
    })
    expect(parsed.boosts).toEqual({})
    expect(parsed.routes).toEqual([])
    expect(parsed.settings.externalLinks).toBe('little')
  })
})
