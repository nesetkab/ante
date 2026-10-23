import { describe, expect, it } from 'vitest'
import { MAX_SPLIT } from '@shared/state/reducer'
import {
  apply,
  buildState,
  favorites,
  folder,
  inFolder,
  inSplit,
  itemOf,
  list,
  pinned,
  split,
  splitOf,
  tabOf,
  today,
} from './helpers'

describe('item/move within a container', () => {
  const state = buildState({ spaces: { s1: { today: ['a', 'b', 'c', 'd'] } } })

  it.each([
    ['a', 0, ['a', 'b', 'c', 'd']],
    ['a', 1, ['a', 'b', 'c', 'd']],
    ['a', 2, ['b', 'a', 'c', 'd']],
    ['a', 4, ['b', 'c', 'd', 'a']],
    ['a', 99, ['b', 'c', 'd', 'a']],
    ['d', 0, ['d', 'a', 'b', 'c']],
    ['c', 1, ['a', 'c', 'b', 'd']],
    ['b', 3, ['a', 'c', 'b', 'd']],
  ])('moves %s to index %i', (id, index, expected) => {
    const next = apply(state, { type: 'item/move', id, to: today('s1'), index })
    expect(list(next, today('s1'))).toEqual(expected)
  })

  it('reorders split children and equalizes sizes', () => {
    const start = buildState({
      spaces: { s1: { today: [split('sp', ['a', 'b', 'c'], { sizes: [0.5, 0.25, 0.25] })] } },
    })
    const next = apply(start, { type: 'item/move', id: 'c', to: inSplit('sp'), index: 0 })
    expect(splitOf(next, 'sp').children).toEqual(['c', 'a', 'b'])
    expect(splitOf(next, 'sp').sizes).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it('reorders within a full split', () => {
    const start = buildState({
      spaces: { s1: { today: [split('sp', ['a', 'b', 'c', 'd'])] } },
    })
    const next = apply(start, { type: 'item/move', id: 'd', to: inSplit('sp'), index: 0 })
    expect(splitOf(next, 'sp').children).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('item/move across containers', () => {
  it('moves a today tab into pinned and remembers its url', () => {
    const start = buildState({ spaces: { s1: { pinned: ['p'], today: ['a'] } } })
    const next = apply(start, { type: 'item/move', id: 'a', to: pinned('s1'), index: 0 })
    expect(list(next, pinned('s1'))).toEqual(['a', 'p'])
    expect(list(next, today('s1'))).toEqual([])
    expect(tabOf(next, 'a').savedUrl).toBe('https://a.test/')
    expect(tabOf(next, 'a').savedTitle).toBe('a')
  })

  it('keeps an existing saved url when moving between persistent sections', () => {
    const start = buildState({
      spaces: { s1: { pinned: ['p'] } },
      tabs: { p: { url: 'https://p.test/elsewhere' } },
    })
    const next = apply(start, { type: 'item/move', id: 'p', to: favorites(), index: 0 })
    expect(tabOf(next, 'p').savedUrl).toBe('https://p.test/')
    expect(list(next, favorites())).toEqual(['p'])
  })

  it('clears saved urls when a pinned tab moves to today', () => {
    const start = buildState({ spaces: { s1: { pinned: ['p'] } } })
    const next = apply(start, { type: 'item/move', id: 'p', to: today('s1'), index: 0 })
    expect(tabOf(next, 'p').savedUrl).toBeNull()
    expect(tabOf(next, 'p').savedTitle).toBeNull()
  })

  it('applies the section to every tab inside a moved split', () => {
    const start = buildState({ spaces: { s1: { today: [split('sp', ['a', 'b'])] } } })
    const next = apply(start, { type: 'item/move', id: 'sp', to: pinned('s1'), index: 0 })
    expect(list(next, pinned('s1'))).toEqual(['sp'])
    expect(tabOf(next, 'a').savedUrl).toBe('https://a.test/')
    expect(tabOf(next, 'b').savedUrl).toBe('https://b.test/')
  })

  it('moves a tab into a folder in another space', () => {
    const start = buildState({
      spaces: { s1: { today: ['a'] }, s2: { pinned: [folder('f', ['x'])] } },
    })
    const next = apply(start, { type: 'item/move', id: 'a', to: inFolder('f'), index: 1 })
    expect(list(next, inFolder('f'))).toEqual(['x', 'a'])
    expect(list(next, today('s1'))).toEqual([])
    expect(tabOf(next, 'a').savedUrl).toBe('https://a.test/')
  })

  it('moves a loose tab into the tree', () => {
    const start = buildState({ loose: ['peek'] })
    const next = apply(start, { type: 'item/move', id: 'peek', to: today('s1'), index: 0 })
    expect(list(next, today('s1'))).toEqual(['peek'])
  })

  it('dissolves a split that drops to one tab', () => {
    const start = buildState({ spaces: { s1: { today: ['x', split('sp', ['a', 'b']), 'y'] } } })
    const next = apply(start, { type: 'item/move', id: 'a', to: today('s1'), index: 3 })
    expect(itemOf(next, 'sp')).toBeUndefined()
    expect(list(next, today('s1'))).toEqual(['x', 'b', 'y', 'a'])
  })

  it('keeps a split with remaining tabs and drops the moved size', () => {
    const start = buildState({
      spaces: { s1: { today: [split('sp', ['a', 'b', 'c'], { sizes: [0.5, 0.3, 0.2] })] } },
    })
    const next = apply(start, { type: 'item/move', id: 'a', to: today('s1'), index: 0 })
    expect(splitOf(next, 'sp').children).toEqual(['b', 'c'])
    expect(splitOf(next, 'sp').sizes).toEqual([0.3, 0.2])
  })

  it('adds a tab to a split and equalizes sizes', () => {
    const start = buildState({
      spaces: { s1: { today: [split('sp', ['a', 'b'], { sizes: [0.8, 0.2] }), 'c'] } },
    })
    const next = apply(start, { type: 'item/move', id: 'c', to: inSplit('sp'), index: 1 })
    expect(splitOf(next, 'sp').children).toEqual(['a', 'c', 'b'])
    expect(splitOf(next, 'sp').sizes).toEqual([1 / 3, 1 / 3, 1 / 3])
  })
})

describe('item/move rejections', () => {
  const start = buildState({
    spaces: {
      s1: {
        pinned: [folder('outer', [folder('inner', ['p'])])],
        today: ['a', split('sp', ['b', 'c']), split('full', ['d', 'e', 'f', 'g'])],
      },
    },
  })

  it.each([
    ['a folder into favorites', 'outer', favorites()],
    ['a folder into today', 'outer', today('s1')],
    ['a split into favorites', 'sp', favorites()],
    ['a split into a split', 'sp', inSplit('full')],
    ['a folder into a split', 'inner', inSplit('sp')],
    ['a folder into itself', 'outer', inFolder('outer')],
    ['a folder into its descendant', 'outer', inFolder('inner')],
    ['a tab into a full split', 'a', inSplit('full')],
    ['a tab into a missing space', 'a', today('missing')],
    ['a tab into a missing folder', 'a', inFolder('missing')],
    ['a tab into a tab', 'a', inFolder('b')],
    ['a missing item', 'missing', today('s1')],
  ])('refuses to move %s', (_label, id, to) => {
    expect(apply(start, { type: 'item/move', id, to, index: 0 })).toBe(start)
  })

  it('caps splits at the maximum size', () => {
    expect(splitOf(start, 'full').children).toHaveLength(MAX_SPLIT)
  })
})
