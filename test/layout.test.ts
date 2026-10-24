import { describe, expect, it } from 'vitest'
import {
  computeLayout,
  CONTENT_RADIUS,
  LITTLE_TOOLBAR_HEIGHT,
  PEEK_MAX_WIDTH,
  splitPanes,
  type LayoutInput,
} from '@shared/layout'
import type { Data, WindowData } from '@shared/schema'
import { buildData, makeWindow, split } from './helpers'

const data = buildData({
  spaces: {
    s1: {
      today: [
        'a',
        split('h', ['b', 'c'], { sizes: [0.25, 0.75] }),
        split('v', ['d', 'e', 'f'], { direction: 'vertical' }),
        split('odd', ['g', 'h2'], { sizes: [1, 1, 1] }),
      ],
    },
  },
  loose: ['peek', 'little'],
})

const layout = (window: WindowData, extra: Partial<LayoutInput> = {}, source: Data = data) =>
  computeLayout({ width: 1200, height: 800, window, data: source, fullscreenTabId: null, ...extra })

const active = (tabId: string, extra: Partial<WindowData> = {}) =>
  makeWindow('w', 's1', { activeBySpace: { s1: tabId }, ...extra })

const withSettings = (patch: Partial<Data['settings']>): Data => ({
  ...data,
  settings: { ...data.settings, ...patch },
})

describe('sidebar placement', () => {
  it('puts the sidebar on the left by default', () => {
    const result = layout(active('a'))
    expect(result.sidebar).toEqual({ x: 0, y: 0, width: 260, height: 800 })
    expect(result.content).toEqual({ x: 260, y: 8, width: 932, height: 784 })
    expect(result.panes).toEqual([{ tabId: 'a', rect: result.content }])
    expect(result.radius).toBe(CONTENT_RADIUS)
    expect(result.split).toBeNull()
    expect(result.peek).toBeNull()
  })

  it('mirrors the sidebar on the right', () => {
    const result = layout(active('a'), {}, withSettings({ sidebarSide: 'right' }))
    expect(result.sidebar).toEqual({ x: 940, y: 0, width: 260, height: 800 })
    expect(result.content).toEqual({ x: 8, y: 8, width: 932, height: 784 })
  })

  it('gives the content the full window when the sidebar is hidden', () => {
    const result = layout(active('a', { sidebarHidden: true }))
    expect(result.sidebar).toBeNull()
    expect(result.content).toEqual({ x: 8, y: 8, width: 1184, height: 784 })
  })

  it('shrinks the sidebar in narrow windows', () => {
    const result = layout(active('a'), { width: 300 })
    expect(result.sidebar?.width).toBe(100)
    expect(result.content).toEqual({ x: 100, y: 8, width: 192, height: 784 })
  })

  it('respects the sidebar width setting', () => {
    const result = layout(active('a'), {}, withSettings({ sidebarWidth: 400 }))
    expect(result.sidebar?.width).toBe(400)
    expect(result.content.x).toBe(400)
  })

  it('has no panes without an active tab', () => {
    expect(layout(makeWindow('w', 's1')).panes).toEqual([])
  })
})

describe('splits', () => {
  it('lays out a horizontal split with sizes', () => {
    const result = layout(active('c'))
    expect(result.split?.id).toBe('h')
    expect(result.panes).toEqual([
      { tabId: 'b', rect: { x: 260, y: 8, width: 231, height: 784 } },
      { tabId: 'c', rect: { x: 499, y: 8, width: 693, height: 784 } },
    ])
  })

  it('lays out a vertical split', () => {
    const result = layout(active('d'))
    expect(result.panes.map((pane) => pane.rect)).toEqual([
      { x: 260, y: 8, width: 932, height: 256 },
      { x: 260, y: 272, width: 932, height: 256 },
      { x: 260, y: 536, width: 932, height: 256 },
    ])
  })

  it('uses equal sizes when stored sizes do not match', () => {
    const result = layout(active('g'))
    expect(result.panes.map((pane) => pane.rect.width)).toEqual([462, 462])
  })

  it('fills the content exactly and leaves gaps between panes', () => {
    for (const tabId of ['b', 'd', 'g']) {
      const { panes, content } = layout(active(tabId))
      const last = panes.at(-1)?.rect
      expect(last && last.x + last.width).toBe(content.x + content.width)
      expect(last && last.y + last.height).toBe(content.y + content.height)
    }
  })

  it('falls back to a single pane when split tabs are missing', () => {
    const broken: Data = { ...data, items: { ...data.items } }
    Reflect.deleteProperty(broken.items, 'b')
    const result = layout(active('c'), {}, broken)
    expect(result.split).toBeNull()
    expect(result.panes).toEqual([{ tabId: 'c', rect: result.content }])
  })

  it('never produces negative sizes', () => {
    const panes = splitPanes(
      { x: 0, y: 0, width: 4, height: 4 },
      { kind: 'split', id: 's', children: [], direction: 'horizontal', sizes: [] },
      ['a', 'b', 'c'],
    )
    for (const pane of panes) expect(pane.rect.width).toBeGreaterThanOrEqual(0)
  })
})

describe('peek, little windows and fullscreen', () => {
  it('centers peek inside the content with a margin', () => {
    const result = layout(active('a', { peekTabId: 'peek' }))
    expect(result.peek).toEqual({ x: 308, y: 64, width: 836, height: 704 })
  })

  it('caps the peek width in wide windows', () => {
    const result = layout(active('a', { peekTabId: 'peek' }), { width: 3000 })
    expect(result.peek?.width).toBe(PEEK_MAX_WIDTH)
    expect(result.peek?.x).toBe(260 + (2732 - PEEK_MAX_WIDTH) / 2)
  })

  it('shows peek even without an active tab', () => {
    expect(layout(makeWindow('w', 's1', { peekTabId: 'peek' })).peek).not.toBeNull()
  })

  it('lays out a little window under its toolbar', () => {
    const window = makeWindow('w', 's1', { kind: 'little', littleTabId: 'little' })
    const result = layout(window, { width: 600, height: 400 })
    const content = { x: 6, y: LITTLE_TOOLBAR_HEIGHT, width: 588, height: 354 }
    expect(result).toEqual({
      sidebar: null,
      devtools: null,
      content,
      panes: [{ tabId: 'little', rect: content }],
      split: null,
      peek: null,
      radius: CONTENT_RADIUS,
    })
  })

  it('has no panes in an empty little window', () => {
    const window = makeWindow('w', 's1', { kind: 'little' })
    expect(layout(window).panes).toEqual([])
  })

  it('gives a fullscreen tab the whole window', () => {
    const result = layout(active('c', { peekTabId: 'peek' }), { fullscreenTabId: 'c' })
    const full = { x: 0, y: 0, width: 1200, height: 800 }
    expect(result).toEqual({
      sidebar: null,
      devtools: null,
      content: full,
      panes: [{ tabId: 'c', rect: full }],
      split: null,
      peek: null,
      radius: 0,
    })
  })
})

describe('docked devtools', () => {
  it('splits the page and devtools side by side', () => {
    const result = layout(active('a'), { devtoolsTabId: 'a' }, withSettings({ devtoolsWidth: 400 }))
    const page = result.panes[0]?.rect
    expect(result.devtools?.frame.width).toBe(400)
    expect(page && page.x + page.width + 8).toBe(result.devtools?.frame.x)
    expect(result.devtools?.view.y).toBe((result.devtools?.frame.y ?? 0) + 32)
  })

  it('skips devtools when the window is too narrow', () => {
    const result = layout(active('a'), { devtoolsTabId: 'a', width: 600 })
    expect(result.devtools).toBeNull()
  })

  it('ignores devtools for tabs that are not visible', () => {
    expect(layout(active('a'), { devtoolsTabId: 'b' }).devtools).toBeNull()
  })
})
