import { describe, expect, it } from 'vitest'
import { libraryPages } from '@shared/pages'
import { buildData } from './helpers'

const data = {
  ...buildData(),
  notes: {
    plan: { id: 'plan', title: 'Plan', body: 'ship ante\nmore', updatedAt: 3, private: false },
    loose: { id: 'loose', title: '', body: '  buy milk  \n', updatedAt: 5, private: false },
    secret: { id: 'secret', title: 'Secret', body: '', updatedAt: 9, private: true },
  },
  easels: {
    board: { id: 'board', title: '', elements: [], updatedAt: 4, private: false },
  },
}

describe('libraryPages', () => {
  it('lists notes and easels newest first and hides private ones', () => {
    expect(libraryPages(data).map((page) => [page.kind, page.title, page.detail])).toEqual([
      ['note', 'buy milk', 'Note'],
      ['easel', 'Untitled easel', 'Easel · 0 items'],
      ['note', 'Plan', 'ship ante'],
    ])
  })

  it('searches titles and note text', () => {
    expect(libraryPages(data, 'SHIP').map((page) => page.id)).toEqual(['plan'])
    expect(libraryPages(data, 'secret')).toEqual([])
  })
})
