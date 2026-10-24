import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { discoverFeedUrl, MAX_FEED_ENTRIES, parseFeed } from '@shared/feeds'
import type { AppState } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { reduce } from '@shared/state/reducer'
import { buildState } from './helpers'

const apply = (state: AppState, ...actions: Action[]) =>
  actions.reduce((current, action) => produce(current, (draft) => reduce(draft, action)), state)

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Ante Blog &amp; News</title>
<item><title>First post</title><link>https://blog.example/1</link></item>
<item><title>Second post</title><link>/2</link></item>
<item><title>Duplicate</title><link>https://blog.example/1</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`

const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">Atom Feed</title>
<entry><title>One</title><link rel="self" href="https://atom.example/self"/><link rel="alternate" href="https://atom.example/one"/></entry>
<entry><title>Two</title><link href="https://atom.example/two"/></entry></feed>`

describe('parseFeed', () => {
  it('reads rss items, resolves relative links and drops duplicates and unsafe links', () => {
    expect(parseFeed(rss, 'https://blog.example/feed.xml')).toEqual({
      title: 'Ante Blog & News',
      entries: [
        { url: 'https://blog.example/1', title: 'First post' },
        { url: 'https://blog.example/2', title: 'Second post' },
      ],
    })
  })

  it('reads atom entries and prefers alternate links', () => {
    expect(parseFeed(atom)?.entries).toEqual([
      { url: 'https://atom.example/one', title: 'One' },
      { url: 'https://atom.example/two', title: 'Two' },
    ])
  })

  it('caps the number of entries', () => {
    const items = Array.from(
      { length: 40 },
      (_, i) => `<item><title>${i}</title><link>https://x.example/${i}</link></item>`,
    )
    const xml = `<rss><channel><title>Big</title>${items.join('')}</channel></rss>`
    expect(parseFeed(xml)?.entries).toHaveLength(MAX_FEED_ENTRIES)
  })

  it('rejects documents that are not feeds', () => {
    expect(parseFeed('<html><body>hi</body></html>')).toBeNull()
  })
})

describe('discoverFeedUrl', () => {
  it('finds the alternate feed link in a page', () => {
    const html = `<head><link rel="stylesheet" href="/a.css"><link rel='alternate' type='application/rss+xml' href='/feed.xml'></head>`
    expect(discoverFeedUrl(html, 'https://site.example/post')).toBe('https://site.example/feed.xml')
  })

  it('returns null when a page has no feed', () => {
    expect(
      discoverFeedUrl('<head><link rel="icon" href="/i.png"></head>', 'https://site.example'),
    ).toBeNull()
  })
})

describe('live folders', () => {
  const entries = (...urls: string[]) => urls.map((url) => ({ id: `id-${url}`, url, title: url }))

  it('fills a new live folder with unread tabs', () => {
    const state = apply(
      buildState({ spaces: { s1: {} } }),
      {
        type: 'feed/create',
        id: 'f',
        spaceId: 's1',
        name: 'Blog',
        feedUrl: 'https://b.example/feed',
      },
      {
        type: 'feed/sync',
        id: 'f',
        entries: entries('https://b.example/1', 'https://b.example/2'),
        now: 10,
      },
    )
    expect(state.data.spaces.s1?.pinned).toEqual(['f'])
    expect(state.data.items.f).toMatchObject({
      children: ['id-https://b.example/1', 'id-https://b.example/2'],
    })
    expect(state.data.items['id-https://b.example/1']).toMatchObject({
      lastActiveAt: 0,
      savedUrl: 'https://b.example/1',
    })
  })

  it('keeps tabs for items still in the feed and drops the rest', () => {
    const state = apply(
      buildState({ spaces: { s1: {} } }),
      {
        type: 'feed/create',
        id: 'f',
        spaceId: 's1',
        name: 'Blog',
        feedUrl: 'https://b.example/feed',
      },
      {
        type: 'feed/sync',
        id: 'f',
        entries: entries('https://b.example/1', 'https://b.example/2'),
        now: 10,
      },
      {
        type: 'feed/sync',
        id: 'f',
        entries: [
          { id: 'new', url: 'https://b.example/3', title: '3' },
          ...entries('https://b.example/1'),
        ],
        now: 20,
      },
    )
    expect(state.data.items.f).toMatchObject({ children: ['new', 'id-https://b.example/1'] })
    expect(state.data.items['id-https://b.example/2']).toBeUndefined()
  })

  it('ignores syncs for ordinary folders and deletes folders with their tabs', () => {
    const state = apply(
      buildState({ spaces: { s1: {} } }),
      {
        type: 'feed/create',
        id: 'f',
        spaceId: 's1',
        name: 'Blog',
        feedUrl: 'https://b.example/feed',
      },
      { type: 'feed/sync', id: 'f', entries: entries('https://b.example/1'), now: 10 },
      { type: 'folder/delete', id: 'f' },
    )
    expect(state.data.items.f).toBeUndefined()
    expect(state.data.items['id-https://b.example/1']).toBeUndefined()
    expect(state.data.spaces.s1?.pinned).toEqual([])
  })
})
