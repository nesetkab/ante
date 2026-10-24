import { describe, expect, it } from 'vitest'
import { restorableHistory, trimHistory, type SavedEntry } from '@shared/navigation'

const entries = (count: number): SavedEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://${index}.test/`,
    title: `${index}`,
  }))

describe('trimHistory', () => {
  it('keeps short histories as they are', () => {
    expect(trimHistory(entries(3), 1)).toEqual({ entries: entries(3), index: 1 })
  })

  it('keeps a window around the current page', () => {
    const trimmed = trimHistory(entries(100), 50, 10)
    expect(trimmed?.entries.map((entry) => entry.title)).toEqual([
      '45',
      '46',
      '47',
      '48',
      '49',
      '50',
      '51',
      '52',
      '53',
      '54',
    ])
    expect(trimmed?.index).toBe(5)
  })

  it('keeps the newest pages when the current page is last', () => {
    const trimmed = trimHistory(entries(40), 39, 10)
    expect(trimmed?.entries[0]?.title).toBe('30')
    expect(trimmed?.index).toBe(9)
  })

  it('rejects an index outside the list', () => {
    expect(trimHistory(entries(2), 2)).toBeNull()
    expect(trimHistory([], 0)).toBeNull()
    expect(trimHistory(entries(2), -1)).toBeNull()
  })
})

describe('restorableHistory', () => {
  it('only restores when the current page still matches the tab', () => {
    const saved = { entries: entries(3), index: 2 }
    expect(restorableHistory(saved, 'https://2.test/')).toBe(true)
    expect(restorableHistory(saved, 'https://home.test/')).toBe(false)
    expect(restorableHistory(undefined, 'https://2.test/')).toBe(false)
  })
})
