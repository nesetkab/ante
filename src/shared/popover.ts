import type { FindState, Prompt } from './permissions'
import type { Data, Id, Rect, Runtime, WindowData } from './schema'
import { activeTabId, visibleTabIds } from './state/tree'

export const POPOVER_INSET = 10
export const POPOVER_PAD = 16
export const POPOVER_GAP = 8
export const FIND_BAR_SIZE = { width: 360, height: 44 }
export const PROMPT_SIZE = { width: 360, height: 128 }
export const SCREEN_PROMPT_SIZE = { width: 520, height: 392 }

export const LINK_HEIGHT = 24
export const LINK_INSET = 6
const LINK_MIN_WIDTH = 120
const LINK_MAX_WIDTH = 560
const LINK_CHAR_WIDTH = 6.6
const LINK_PADDING = 22

export interface Popover {
  tabId: Id
  find: FindState | null
  prompt: Prompt | null
  link?: string | null
}

export function popoverFor(data: Data, runtime: Runtime, window: WindowData): Popover | null {
  const visible = visibleTabIds(data, window)
  const active = activeTabId(data, window)
  const activeVisible = active !== null && visible.includes(active)
  const ordered = activeVisible ? [active, ...visible.filter((id) => id !== active)] : visible
  const prompting = ordered.find((id) => runtime.tabs[id]?.prompt)
  const find = activeVisible ? (runtime.tabs[active]?.find ?? null) : null
  if (prompting) {
    return {
      tabId: prompting,
      prompt: runtime.tabs[prompting]?.prompt ?? null,
      find: prompting === active ? find : null,
    }
  }
  if (activeVisible && find) return { tabId: active, find, prompt: null }
  const hovering = ordered.find((id) => runtime.tabs[id]?.hoverUrl)
  const link = hovering ? runtime.tabs[hovering]?.hoverUrl : null
  if (hovering && link) return { tabId: hovering, find: null, prompt: null, link }
  return null
}

export function linkRect(pane: Rect, link: string): Rect {
  const available = Math.max(0, pane.width - LINK_INSET * 2)
  const wanted = link.length * LINK_CHAR_WIDTH + LINK_PADDING
  const width = Math.min(available, LINK_MAX_WIDTH, Math.max(LINK_MIN_WIDTH, wanted))
  return {
    x: Math.round(pane.x + LINK_INSET),
    y: Math.round(Math.max(pane.y, pane.y + pane.height - LINK_HEIGHT - LINK_INSET)),
    width: Math.round(width),
    height: LINK_HEIGHT,
  }
}

export function promptSize(prompt: Prompt): { width: number; height: number } {
  return prompt.kind === 'screen' ? SCREEN_PROMPT_SIZE : PROMPT_SIZE
}

export function popoverContentSize(popover: Popover): { width: number; height: number } {
  const parts = [
    ...(popover.find ? [FIND_BAR_SIZE] : []),
    ...(popover.prompt ? [promptSize(popover.prompt)] : []),
  ]
  return {
    width: Math.max(0, ...parts.map((part) => part.width)),
    height:
      parts.reduce((sum, part) => sum + part.height, 0) +
      POPOVER_GAP * Math.max(parts.length - 1, 0),
  }
}

export function popoverRect(pane: Rect, popover: Popover): Rect {
  if (popover.link && !popover.find && !popover.prompt) return linkRect(pane, popover.link)
  const content = popoverContentSize(popover)
  const width = Math.min(content.width, Math.max(0, pane.width - POPOVER_INSET * 2))
  const outerWidth = width + POPOVER_PAD * 2
  const outerHeight = content.height + POPOVER_PAD * 2
  return {
    x: Math.round(Math.max(0, pane.x + pane.width - POPOVER_INSET - width - POPOVER_PAD)),
    y: Math.round(Math.max(0, pane.y + POPOVER_INSET - POPOVER_PAD)),
    width: Math.round(outerWidth),
    height: Math.round(outerHeight),
  }
}
