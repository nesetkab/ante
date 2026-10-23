import { describe, expect, it } from 'vitest'
import {
  canDrop,
  containerDepth,
  rowPlacement,
  spaceMoveIndex,
  spacePlacement,
} from '@shared/state/dnd'
import { addTab, apply, folder, makeState, OTHER_SPACE, pinned, SPACE, today } from './dnd-helpers'

function sample() {
  const state = makeState()
  for (const id of ['a', 'b', 'c', 'd']) addTab(state, id, today())
  apply(
    state,
    { type: 'tab/pin', id: 'a', spaceId: SPACE },
    { type: 'tab/pin', id: 'b', spaceId: SPACE },
    { type: 'folder/create', id: 'f', name: 'Folder', spaceId: SPACE, children: ['a', 'b'] },
    { type: 'folder/create', id: 'g', name: 'Inner', spaceId: SPACE, children: [] },
    { type: 'item/move', id: 'g', to: folder('f'), index: 2 },
  )
  return state
}

describe('rowPlacement', () => {
  it('places before and after a row in its own list', () => {
    const { data } = sample()
    expect(rowPlacement(data, 'c', 'before')).toEqual({ to: today(), index: 0 })
    expect(rowPlacement(data, 'c', 'after')).toEqual({ to: today(), index: 1 })
  })

  it('drops into a folder at the end', () => {
    const { data } = sample()
    expect(rowPlacement(data, 'f', 'into')).toEqual({ to: folder('f'), index: 3 })
    expect(rowPlacement(data, 'c', 'into')).toBeNull()
  })

  it('treats after an open folder as its first child', () => {
    const { data } = sample()
    expect(rowPlacement(data, 'f', 'after')).toEqual({ to: folder('f'), index: 0 })
    expect(rowPlacement(data, 'g', 'after')).toEqual({ to: folder('f'), index: 3 })
  })

  it('outdents after the last child of a folder', () => {
    const { data } = sample()
    expect(rowPlacement(data, 'g', 'after', 1)).toEqual({ to: pinned(), index: 1 })
    expect(rowPlacement(data, 'a', 'after', 1)).toEqual({ to: folder('f'), index: 1 })
  })
})

describe('canDrop', () => {
  it('rejects no-op moves next to the item itself', () => {
    const { data } = sample()
    expect(canDrop(data, 'c', { to: today(), index: 0 })).toBe(false)
    expect(canDrop(data, 'c', { to: today(), index: 1 })).toBe(false)
    expect(canDrop(data, 'c', { to: today(), index: 2 })).toBe(true)
  })

  it('rejects cycles and folders outside pinned', () => {
    const { data } = sample()
    expect(canDrop(data, 'f', { to: folder('g'), index: 0 })).toBe(false)
    expect(canDrop(data, 'f', { to: folder('f'), index: 0 })).toBe(false)
    expect(canDrop(data, 'f', { to: today(), index: 0 })).toBe(false)
    expect(canDrop(data, 'g', { to: pinned(), index: 0 })).toBe(true)
  })
})

describe('spacePlacement', () => {
  it('keeps the section when moving to another space', () => {
    const { data } = sample()
    expect(spacePlacement(data, 'c', OTHER_SPACE)).toEqual({ to: today(OTHER_SPACE), index: 0 })
    expect(spacePlacement(data, 'f', OTHER_SPACE)).toEqual({ to: pinned(OTHER_SPACE), index: 0 })
    expect(spacePlacement(data, 'a', OTHER_SPACE)).toEqual({ to: pinned(OTHER_SPACE), index: 0 })
  })

  it('ignores the space the item already lives in', () => {
    const { data } = sample()
    expect(spacePlacement(data, 'c', SPACE)).toBeNull()
    expect(spacePlacement(data, 'c', 'missing')).toBeNull()
  })
})

describe('containerDepth', () => {
  it('counts folder nesting', () => {
    const { data } = sample()
    expect(containerDepth(data, pinned())).toBe(0)
    expect(containerDepth(data, folder('f'))).toBe(1)
    expect(containerDepth(data, folder('g'))).toBe(2)
  })
})

describe('spaceMoveIndex', () => {
  const order = ['a', 'b', 'c', 'd']

  it('converts an insertion point to the final index', () => {
    expect(spaceMoveIndex(order, 'a', 3)).toBe(2)
    expect(spaceMoveIndex(order, 'a', 4)).toBe(3)
    expect(spaceMoveIndex(order, 'd', 0)).toBe(0)
  })

  it('returns null when nothing would change', () => {
    expect(spaceMoveIndex(order, 'b', 1)).toBeNull()
    expect(spaceMoveIndex(order, 'b', 2)).toBeNull()
    expect(spaceMoveIndex(order, 'z', 0)).toBeNull()
  })
})
