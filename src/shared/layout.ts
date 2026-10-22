import type { Data, Id, Rect, Settings, Split, WindowData } from './schema'
import { activeTabId, parentSplit, visibleTabIds } from './state/tree'

export const CONTENT_INSET = 8
export const SPLIT_GAP = 8
export const LITTLE_TOOLBAR_HEIGHT = 40
export const PEEK_TOOLBAR_HEIGHT = 44
export const PEEK_MAX_WIDTH = 1280
export const CONTENT_RADIUS = 8

export interface Pane {
  tabId: Id
  rect: Rect
}

export interface Layout {
  sidebar: Rect | null
  content: Rect
  panes: Pane[]
  split: Split | null
  peek: Rect | null
  radius: number
}

export interface LayoutInput {
  width: number
  height: number
  window: WindowData
  data: Data
  fullscreenTabId: Id | null
}

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x: Math.round(x),
  y: Math.round(y),
  width: Math.max(0, Math.round(width)),
  height: Math.max(0, Math.round(height)),
})

function mainContent(width: number, height: number, window: WindowData, settings: Settings) {
  const inset = CONTENT_INSET
  if (window.sidebarHidden) {
    return { sidebar: null, content: rect(inset, inset, width - inset * 2, height - inset * 2) }
  }
  const sidebarWidth = Math.min(settings.sidebarWidth, Math.max(0, width - 200))
  const contentWidth = width - sidebarWidth - inset
  if (settings.sidebarSide === 'right') {
    return {
      sidebar: rect(width - sidebarWidth, 0, sidebarWidth, height),
      content: rect(inset, inset, contentWidth, height - inset * 2),
    }
  }
  return {
    sidebar: rect(0, 0, sidebarWidth, height),
    content: rect(sidebarWidth, inset, contentWidth, height - inset * 2),
  }
}

export function splitPanes(content: Rect, split: Split, tabIds: readonly Id[]): Pane[] {
  const horizontal = split.direction === 'horizontal'
  const total = horizontal ? content.width : content.height
  const available = Math.max(0, total - SPLIT_GAP * (tabIds.length - 1))
  const weights = split.sizes.length === tabIds.length ? split.sizes : tabIds.map(() => 1)
  const sum = weights.reduce((acc, weight) => acc + weight, 0) || 1
  let start = 0
  return tabIds.map((tabId, index) => {
    const isLast = index === tabIds.length - 1
    const end = isLast ? total : start + (available * (weights[index] ?? 0)) / sum
    const length = end - start
    const paneRect = horizontal
      ? rect(content.x + start, content.y, length, content.height)
      : rect(content.x, content.y + start, content.width, length)
    start = end + SPLIT_GAP
    return { tabId, rect: paneRect }
  })
}

export function computeLayout({
  width,
  height,
  window,
  data,
  fullscreenTabId,
}: LayoutInput): Layout {
  if (fullscreenTabId) {
    return {
      sidebar: null,
      content: rect(0, 0, width, height),
      panes: [{ tabId: fullscreenTabId, rect: rect(0, 0, width, height) }],
      split: null,
      peek: null,
      radius: 0,
    }
  }

  if (window.kind === 'little') {
    const content = rect(6, LITTLE_TOOLBAR_HEIGHT, width - 12, height - LITTLE_TOOLBAR_HEIGHT - 6)
    const tabId = activeTabId(data, window)
    return {
      sidebar: null,
      content,
      panes: tabId ? [{ tabId, rect: content }] : [],
      split: null,
      peek: null,
      radius: CONTENT_RADIUS,
    }
  }

  const { sidebar, content } = mainContent(width, height, window, data.settings)
  const active = activeTabId(data, window)
  const split = active ? parentSplit(data, active) : null
  const visible = visibleTabIds(data, window)
  const panes =
    split && visible.length > 1
      ? splitPanes(content, split, visible)
      : visible.map((tabId) => ({ tabId, rect: content }))

  let peek: Rect | null = null
  if (window.peekTabId) {
    const margin = Math.max(48, (content.width - PEEK_MAX_WIDTH) / 2)
    peek = rect(
      content.x + margin,
      content.y + PEEK_TOOLBAR_HEIGHT + 12,
      content.width - margin * 2,
      content.height - PEEK_TOOLBAR_HEIGHT - 36,
    )
  }

  return {
    sidebar,
    content,
    panes,
    split: split && visible.length > 1 ? split : null,
    peek,
    radius: CONTENT_RADIUS,
  }
}
