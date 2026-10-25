import type { FindState, Prompt } from './permissions'
import type { AutofillState, Data, Id, Rect, Runtime, WindowData } from './schema'
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

export const AUTOFILL_ROW = 34
export const AUTOFILL_PAD = 6
export const AUTOFILL_MARGIN = 6
const AUTOFILL_MIN_WIDTH = 240
const AUTOFILL_MAX_ROWS = 6

export interface Popover {
  tabId: Id
  find: FindState | null
  prompt: Prompt | null
  link?: string | null
  autofill?: AutofillState | null
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
  const filling = ordered.find((id) => runtime.tabs[id]?.autofill)
  const autofill = filling ? runtime.tabs[filling]?.autofill : null
  if (filling && autofill) return { tabId: filling, find: null, prompt: null, autofill }
  const hovering = ordered.find((id) => runtime.tabs[id]?.hoverUrl)
  const link = hovering ? runtime.tabs[hovering]?.hoverUrl : null
  if (hovering && link) return { tabId: hovering, find: null, prompt: null, link }
  return null
}

export interface Point {
  x: number
  y: number
}

const contains = (rect: Rect, point: Point) =>
  point.x >= rect.x &&
  point.x < rect.x + rect.width &&
  point.y >= rect.y &&
  point.y < rect.y + rect.height

export function linkRect(pane: Rect, link: string, cursor: Point | null = null): Rect {
  const available = Math.max(0, pane.width - LINK_INSET * 2)
  const wanted = link.length * LINK_CHAR_WIDTH + LINK_PADDING
  const width = Math.round(Math.min(available, LINK_MAX_WIDTH, Math.max(LINK_MIN_WIDTH, wanted)))
  const left: Rect = {
    x: Math.round(pane.x + LINK_INSET),
    y: Math.round(Math.max(pane.y, pane.y + pane.height - LINK_HEIGHT - LINK_INSET)),
    width,
    height: LINK_HEIGHT,
  }
  if (!cursor || !contains(left, cursor)) return left
  return { ...left, x: Math.round(pane.x + pane.width - LINK_INSET - width) }
}

export function autofillRect(pane: Rect, autofill: AutofillState): Rect {
  const rows = Math.min(autofill.logins.length, AUTOFILL_MAX_ROWS) + 1
  const cardHeight = rows * AUTOFILL_ROW + AUTOFILL_PAD * 2
  const height = cardHeight + AUTOFILL_MARGIN * 2
  const field = autofill.rect
  const width = Math.min(
    Math.max(field.width, AUTOFILL_MIN_WIDTH) + AUTOFILL_MARGIN * 2,
    Math.max(0, pane.width),
  )
  const x = Math.min(
    Math.max(pane.x, pane.x + field.x - AUTOFILL_MARGIN),
    pane.x + pane.width - width,
  )
  const below = pane.y + field.y + field.height
  const above = pane.y + field.y - height
  const fitsBelow = below + height <= pane.y + pane.height
  return {
    x: Math.round(x),
    y: Math.round(Math.max(pane.y, fitsBelow || above < pane.y ? below : above)),
    width: Math.round(width),
    height: Math.round(height),
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

export function popoverRect(pane: Rect, popover: Popover, cursor: Point | null = null): Rect {
  if (popover.autofill && !popover.find && !popover.prompt)
    return autofillRect(pane, popover.autofill)
  if (popover.link && !popover.find && !popover.prompt) return linkRect(pane, popover.link, cursor)
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
