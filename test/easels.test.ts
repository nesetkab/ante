import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  assetUrl,
  BOARD_WIDTH,
  bringToFront,
  easelIdOf,
  easelUrl,
  isAssetName,
  placeImage,
  referencedAssets,
  sniffImageType,
} from '@shared/easels'
import { internalPage } from '@shared/pages'
import type { AppState, EaselElement } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { reduce } from '@shared/state/reducer'
import { sanitize } from '@shared/state/sanitize'
import { buildState } from './helpers'

const apply = (state: AppState, ...actions: Action[]) =>
  actions.reduce((current, action) => produce(current, (draft) => reduce(draft, action)), state)

const text = (id: string): Extract<EaselElement, { kind: 'text' }> => ({
  kind: 'text',
  id,
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  text: id,
  size: 18,
})

const withEasel = () =>
  apply(buildState({ spaces: { s1: { today: ['t'] } }, tabs: { t: { url: easelUrl('e') } } }), {
    type: 'easel/create',
    id: 'e',
    now: 1,
  })

describe('easel urls and assets', () => {
  it('recognizes internal pages', () => {
    expect(easelIdOf(easelUrl('abc'))).toBe('abc')
    expect(internalPage(easelUrl('abc'))).toEqual({ kind: 'easel', id: 'abc' })
    expect(internalPage('https://example.com')).toBeNull()
  })

  it('only accepts generated asset names', () => {
    expect(isAssetName('3f2b8c1e-1d2c-4b5a-9e8f-0a1b2c3d4e5f.png')).toBe(true)
    expect(isAssetName('../../etc/passwd')).toBe(false)
    expect(isAssetName('3f2b8c1e-1d2c-4b5a-9e8f-0a1b2c3d4e5f.svg')).toBe(false)
    expect(assetUrl('a.png')).toBe('ante-asset://asset/a.png')
  })

  it('detects image types from their bytes', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(sniffImageType(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull()
  })

  it('fits new images inside the visible part of the board', () => {
    const box = placeImage(
      { x: 100, y: 200, width: 1000, height: 600 },
      { width: 4000, height: 1000 },
    )
    expect(box.w).toBeLessThanOrEqual(600)
    expect(box.x).toBeGreaterThanOrEqual(100)
    expect(
      placeImage({ x: BOARD_WIDTH, y: 0, width: 800, height: 600 }, { width: 200, height: 100 }).x,
    ).toBe(BOARD_WIDTH - 200)
  })

  it('moves an element to the top of the stack', () => {
    expect(
      bringToFront([text('a'), text('b'), text('c')], 'a').map((element) => element.id),
    ).toEqual(['b', 'c', 'a'])
  })
})

describe('easel reducer', () => {
  it('adds, updates and removes elements', () => {
    const added = apply(withEasel(), { type: 'easel/upsert', id: 'e', element: text('x'), now: 2 })
    expect(added.data.easels.e?.elements).toHaveLength(1)
    const updated = apply(added, {
      type: 'easel/upsert',
      id: 'e',
      element: { ...text('x'), text: 'new' },
      now: 3,
    })
    expect(updated.data.easels.e?.elements[0]).toMatchObject({ text: 'new' })
    const removed = apply(updated, { type: 'easel/remove', id: 'e', elementIds: ['x'], now: 4 })
    expect(removed.data.easels.e?.elements).toEqual([])
  })

  it('renames the easel and its tabs', () => {
    const renamed = apply(withEasel(), {
      type: 'easel/rename',
      id: 'e',
      title: 'Moodboard',
      now: 2,
    })
    expect(renamed.data.easels.e?.title).toBe('Moodboard')
    expect(renamed.data.items.t).toMatchObject({ title: 'Moodboard' })
  })

  it('tracks which image files are still in use', () => {
    const state = apply(withEasel(), {
      type: 'easel/upsert',
      id: 'e',
      element: {
        kind: 'image',
        id: 'i',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        asset: 'a.png',
        sourceUrl: null,
      },
      now: 2,
    })
    expect([...referencedAssets(state.data)]).toEqual(['a.png'])
  })

  it('keeps easels nothing points to but drops private ones', () => {
    const state = apply(
      withEasel(),
      { type: 'easel/create', id: 'orphan', now: 2 },
      { type: 'easel/rename', id: 'orphan', title: 'Moodboard', now: 2 },
      { type: 'easel/create', id: 'blank', now: 2 },
      { type: 'easel/create', id: 'secret', now: 2, private: true },
    )
    expect(Object.keys(sanitize(state.data, 'x').easels).sort()).toEqual(['e', 'orphan'])
  })
})
