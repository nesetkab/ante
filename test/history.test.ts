import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/main/history'
import {
  aggregateHosts,
  groupByDay,
  hostCompletion,
  isRecordable,
  rankHistory,
  urlCompletion,
  type HistoryEntry,
} from '@shared/history'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 23, 12)

const entry = (id: number, url: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  url,
  title: '',
  favicon: null,
  visitCount: 1,
  lastVisit: NOW,
  ...extra,
})

describe('isRecordable', () => {
  it('records web and file pages only', () => {
    expect(isRecordable('https://example.com')).toBe(true)
    expect(isRecordable('file:///tmp/a.html')).toBe(true)
    expect(isRecordable('about:blank')).toBe(false)
    expect(isRecordable('data:text/html,hi')).toBe(false)
    expect(isRecordable(`https://example.com/${'a'.repeat(9000)}`)).toBe(false)
  })
})

describe('rankHistory', () => {
  it('prefers frequently and recently visited pages', () => {
    const entries = [
      entry(1, 'https://github.com/old', { title: 'GitHub old', lastVisit: NOW - 200 * DAY }),
      entry(2, 'https://github.com/new', { title: 'GitHub new', visitCount: 20 }),
    ]
    expect(rankHistory('git', entries, NOW).map((item) => item.id)).toEqual([2, 1])
  })

  it('drops entries that do not match', () => {
    expect(rankHistory('zzz', [entry(1, 'https://example.com')], NOW)).toEqual([])
  })
})

describe('completions', () => {
  const entries = [
    entry(1, 'https://www.github.com/nesetkab/ante', { visitCount: 5 }),
    entry(2, 'https://gitlab.com/', { visitCount: 1 }),
  ]

  it('completes the most visited host, ignoring www', () => {
    expect(hostCompletion('git', aggregateHosts(entries), NOW)).toBe('github.com')
    expect(hostCompletion('GitL', aggregateHosts(entries), NOW)).toBe('GitLab.com')
  })

  it('does not complete searches or full urls', () => {
    expect(hostCompletion('git hub', aggregateHosts(entries), NOW)).toBeNull()
    expect(hostCompletion('https://git', aggregateHosts(entries), NOW)).toBeNull()
  })

  it('completes paths once a slash is typed', () => {
    expect(urlCompletion('github.com/nes', entries, NOW)).toBe('github.com/nesetkab/ante')
  })
})

describe('groupByDay', () => {
  it('groups consecutive items on the same day', () => {
    const groups = groupByDay([NOW, NOW - 1000, NOW - DAY], (time) => time)
    expect(groups.map((group) => group.items.length)).toEqual([2, 1])
  })
})

describe('HistoryStore', () => {
  let directory: string
  let store: HistoryStore

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ante-history-'))
    store = new HistoryStore(join(directory, 'history.sqlite'))
  })

  afterEach(() => {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('counts visits and keeps titles per profile', () => {
    store.visit('default', 'https://example.com/', NOW)
    store.visit('default', 'https://example.com/', NOW + 1)
    store.setTitle('default', 'https://example.com/', 'Example')
    store.visit('work', 'https://example.com/', NOW)
    const result = store.search('default', { query: 'exam', limit: 10, order: 'relevance' }, NOW)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ title: 'Example', visitCount: 2 })
    expect(result.completion).toBe('example.com')
  })

  it('ignores pages that should not be recorded', () => {
    store.visit('default', 'about:blank', NOW)
    expect(store.search('default', { query: '', limit: 10, order: 'recent' }, NOW).entries).toEqual(
      [],
    )
  })

  it('deletes single entries and clears a profile', () => {
    store.visit('default', 'https://a.example/', NOW)
    store.visit('default', 'https://b.example/', NOW)
    const [first] = store.search('default', { query: '', limit: 10, order: 'recent' }, NOW).entries
    store.delete('default', [first?.id ?? -1])
    expect(
      store.search('default', { query: '', limit: 10, order: 'recent' }, NOW).entries,
    ).toHaveLength(1)
    store.clear('default')
    expect(store.search('default', { query: '', limit: 10, order: 'recent' }, NOW).entries).toEqual(
      [],
    )
  })

  it('escapes like wildcards in queries', () => {
    store.visit('default', 'https://example.com/100%', NOW)
    store.visit('default', 'https://example.com/other', NOW)
    const result = store.search('default', { query: '100%', limit: 10, order: 'relevance' }, NOW)
    expect(result.entries.map((item) => item.url)).toEqual(['https://example.com/100%'])
  })
})

describe('history paging', () => {
  it('does not skip entries that share a timestamp', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ante-paging-'))
    const store = new HistoryStore(join(directory, 'history.sqlite'))
    for (const page of ['a', 'b', 'c', 'd']) store.visit('default', `https://${page}.example/`, NOW)
    const first = store.search('default', { query: '', limit: 2, order: 'recent' }, NOW).entries
    const last = first.at(-1)
    const second = store.search(
      'default',
      { query: '', limit: 2, order: 'recent', before: last?.lastVisit, beforeId: last?.id },
      NOW,
    ).entries
    expect(new Set([...first, ...second].map((entry) => entry.url)).size).toBe(4)
    store.close()
    rmSync(directory, { recursive: true, force: true })
  })
})

describe('importVisits', () => {
  it('adds visits once, keeps titles and skips unrecordable urls', () => {
    const imported = new HistoryStore(':memory:')
    const visits = [
      { url: 'https://a.test/', title: 'A', visitCount: 4, lastVisit: 2000 },
      { url: 'javascript:alert(1)', title: 'x', visitCount: 1, lastVisit: 1000 },
    ]
    expect(imported.importVisits('default', visits)).toBe(1)
    expect(imported.importVisits('default', visits)).toBe(1)
    const result = imported.search('default', { query: '', limit: 10 }, 3000)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ url: 'https://a.test/', title: 'A', visitCount: 4 })
    imported.close()
  })
})
