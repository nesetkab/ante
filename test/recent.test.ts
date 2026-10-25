import { describe, expect, it } from 'vitest'
import { recentTab, stepSwitcher, switcherTabs, SWITCHER_LIMIT } from '@shared/state/recent'
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

describe('tab switcher', () => {
  const data = buildData({
    spaces: { s1: { pinned: ['p'], today: ['a', 'b', 'unread'] } },
    tabs: {
      p: { lastActiveAt: 5 },
      a: { lastActiveAt: 30 },
      b: { lastActiveAt: 20 },
      unread: { lastActiveAt: 0 },
    },
  })

  it('lists the current tab first and the rest by last use', () => {
    expect(switcherTabs(data, 's1', 'b')).toEqual(['b', 'a', 'p', 'unread'])
    expect(switcherTabs(data, 's1', null)).toEqual(['a', 'b', 'p', 'unread'])
  })

  it('caps the list', () => {
    const ids = Array.from({ length: 30 }, (_, index) => `t${index}`)
    const many = buildData({ spaces: { s1: { today: ids } } })
    expect(switcherTabs(many, 's1', 't0')).toHaveLength(SWITCHER_LIMIT)
  })

  it('wraps around both ways', () => {
    expect(stepSwitcher(0, 3, 1)).toBe(1)
    expect(stepSwitcher(2, 3, 1)).toBe(0)
    expect(stepSwitcher(0, 3, -1)).toBe(2)
    expect(stepSwitcher(0, 0, 1)).toBe(0)
  })
})
