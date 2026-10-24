import type { Pane } from './layout'
import type { Rect } from './schema'

export interface CaptureTarget {
  tabId: string
  rect: Rect
}

const MIN_SIZE = 4

export function captureTarget(panes: readonly Pane[], region: Rect): CaptureTarget | null {
  const centerX = region.x + region.width / 2
  const centerY = region.y + region.height / 2
  const pane = panes.find(
    ({ rect }) =>
      centerX >= rect.x &&
      centerX <= rect.x + rect.width &&
      centerY >= rect.y &&
      centerY <= rect.y + rect.height,
  )
  if (!pane) return null
  const left = Math.max(region.x, pane.rect.x)
  const top = Math.max(region.y, pane.rect.y)
  const right = Math.min(region.x + region.width, pane.rect.x + pane.rect.width)
  const bottom = Math.min(region.y + region.height, pane.rect.y + pane.rect.height)
  if (right - left < MIN_SIZE || bottom - top < MIN_SIZE) return null
  return {
    tabId: pane.tabId,
    rect: {
      x: Math.round(left - pane.rect.x),
      y: Math.round(top - pane.rect.y),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    },
  }
}

export function captureFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
  return `Capture ${day} at ${time}.png`
}
