import { containerSchema, type Data, type Id, type Rect } from '@shared/schema'
import {
  canDrop,
  containerDepth,
  rowPlacement,
  spaceMoveIndex,
  spacePlacement,
  type Placement,
  type RowZone,
} from '@shared/state/dnd'
import { getList } from '@shared/state/tree'
import { windowId } from '../ante'
import { store } from '../store'
import type { DragSource, DropTarget, DropVisual } from './drag'

export const INDENT = 14
export const ROW_INSET = 10

const dropKinds = ['row', 'tile', 'zone', 'space'] as const

export interface ZoneOptions {
  placement: Placement
  line: 'top' | 'bottom' | 'box'
}

export function dropRow(id: Id, depth: number) {
  return { 'data-drop': 'row', 'data-id': id, 'data-depth': depth } as const
}

export function dropTile(id: Id) {
  return { 'data-drop': 'tile', 'data-id': id } as const
}

export function dropSpace(id: Id) {
  return { 'data-drop': 'space', 'data-id': id } as const
}

export function dropZone({ placement, line }: ZoneOptions) {
  return {
    'data-drop': 'zone',
    'data-container': JSON.stringify(placement.to),
    'data-index': placement.index,
    'data-line': line,
  } as const
}

const rectOf = (rect: DOMRect): Rect => ({
  x: rect.left,
  y: rect.top,
  width: rect.width,
  height: rect.height,
})

function hline(rect: DOMRect, y: number, depth: number): DropVisual {
  const x = rect.left + ROW_INSET + depth * INDENT - 4
  return { kind: 'line', rect: { x, y: y - 1, width: rect.right - x - 4, height: 2 } }
}

function vline(rect: DOMRect, x: number): DropVisual {
  return { kind: 'vline', rect: { x: x - 1, y: rect.top + 4, width: 2, height: rect.height - 8 } }
}

function itemTarget(data: Data, id: Id, placement: Placement | null, visual: DropVisual) {
  if (!placement || !canDrop(data, id, placement)) return null
  const action = { type: 'item/move', id, to: placement.to, index: placement.index } as const
  return { action, visual, springSpaceId: null }
}

function rowTarget(data: Data, id: Id, element: HTMLElement, x: number, y: number) {
  const targetId = element.dataset.id
  const item = targetId ? data.items[targetId] : undefined
  if (!targetId || !item) return null
  const rect = element.getBoundingClientRect()
  const depth = Number(element.dataset.depth ?? 0)
  const ratio = (y - rect.top) / rect.height
  const zone: RowZone =
    item.kind === 'folder'
      ? ratio < 0.28
        ? 'before'
        : ratio > 0.72
          ? 'after'
          : 'into'
      : ratio < 0.5
        ? 'before'
        : 'after'
  const pointerDepth = Math.round((x - rect.left - ROW_INSET) / INDENT)
  const outdent = Math.max(0, depth - Math.max(pointerDepth, 0))
  const placement = rowPlacement(data, targetId, zone, outdent)
  if (zone === 'into') return itemTarget(data, id, placement, { kind: 'box', rect: rectOf(rect) })
  const lineDepth = placement ? containerDepth(data, placement.to) : depth
  const lineY = zone === 'before' ? rect.top : rect.bottom
  return itemTarget(data, id, placement, hline(rect, lineY, lineDepth))
}

function tileTarget(data: Data, id: Id, element: HTMLElement, x: number) {
  const targetId = element.dataset.id
  if (!targetId) return null
  const rect = element.getBoundingClientRect()
  const after = x > rect.left + rect.width / 2
  const placement = rowPlacement(data, targetId, after ? 'after' : 'before')
  return itemTarget(data, id, placement, vline(rect, after ? rect.right + 3 : rect.left - 3))
}

function zoneTarget(data: Data, id: Id, element: HTMLElement) {
  const parsed = containerSchema.safeParse(JSON.parse(element.dataset.container ?? 'null'))
  if (!parsed.success) return null
  const length = getList(data, parsed.data)?.length ?? 0
  const index = Math.min(Number(element.dataset.index ?? 0), length)
  const rect = element.getBoundingClientRect()
  const line = element.dataset.line
  const visual: DropVisual =
    line === 'box'
      ? { kind: 'box', rect: rectOf(rect) }
      : hline(rect, line === 'top' ? rect.top : rect.bottom, 0)
  return itemTarget(data, id, { to: parsed.data, index }, visual)
}

function spaceTarget(data: Data, id: Id, element: HTMLElement): DropTarget | null {
  const spaceId = element.dataset.id
  if (!spaceId) return null
  const springSpaceId = spaceId === data.windows[windowId]?.spaceId ? null : spaceId
  const placement = spacePlacement(data, id, spaceId)
  if (!placement) return springSpaceId ? { action: null, visual: null, springSpaceId } : null
  return {
    action: { type: 'item/move', id, to: placement.to, index: placement.index },
    visual: { kind: 'box', rect: rectOf(element.getBoundingClientRect()) },
    springSpaceId,
  }
}

function spaceOrderTarget(data: Data, id: Id, element: HTMLElement, x: number) {
  const targetId = element.dataset.id
  if (!targetId) return null
  const rect = element.getBoundingClientRect()
  const after = x > rect.left + rect.width / 2
  const before = data.spaceOrder.indexOf(targetId) + (after ? 1 : 0)
  const index = spaceMoveIndex(data.spaceOrder, id, before)
  if (index === null) return null
  return {
    action: { type: 'space/move', id, index },
    visual: vline(rect, after ? rect.right + 1 : rect.left - 1),
    springSpaceId: null,
  } satisfies DropTarget
}

export function hitTest(source: DragSource, x: number, y: number): DropTarget | null {
  const data = store.state?.data
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  if (!data || !element) return null
  const kind = dropKinds.find((candidate) => candidate === element.dataset.drop)
  if (source.type === 'space')
    return kind === 'space' ? spaceOrderTarget(data, source.id, element, x) : null
  switch (kind) {
    case 'row':
      return rowTarget(data, source.id, element, x, y)
    case 'tile':
      return tileTarget(data, source.id, element, x)
    case 'zone':
      return zoneTarget(data, source.id, element)
    case 'space':
      return spaceTarget(data, source.id, element)
    case undefined:
      return null
  }
}
