import { describe, expect, it } from 'vitest'
import { recentTab } from '@shared/state/recent'
import { buildData } from './helpers'

describe('recentTab', () => {
  const data = buildData({
    spaces: { s1: { pinned: ['p'], today: ['a', 'b', 'unread'] } },
    tabs: {
      p: { lastActiveAt: 5 },
      a: { lastActiveAt: 30 },
      b: { lastActiveAt: 20 },
      unread: { lastActiveAt: 0 },
    },
  })

  it('returns the most recently used other tab', () => {
    expect(recentTab(data, 's1', 'a')).toBe('b')
    expect(recentTab(data, 's1', 'b')).toBe('a')
  })

  it('skips tabs that were never opened', () => {
    expect(recentTab(data, 's1', null)).toBe('a')
  })

  it('returns null when nothing else was used', () => {
    expect(recentTab(buildData({ spaces: { s1: { today: ['only'] } } }), 's1', 'only')).toBeNull()
  })
})
