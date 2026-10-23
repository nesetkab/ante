import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { Id, Rect } from '@shared/schema'
import type { UiAction } from '@shared/state/actions'
import { ante } from '../ante'
import { hitTest } from './dropTargets'

export type DragSource =
  | { type: 'item'; id: Id; variant: 'row' | 'tile' }
  | { type: 'space'; id: Id }

export interface DropVisual {
  kind: 'line' | 'vline' | 'box'
  rect: Rect
}

export interface DropTarget {
  action: UiAction | null
  visual: DropVisual | null
  springSpaceId: Id | null
}

export interface DragSession {
  source: DragSource
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  target: DropTarget | null
}

interface Pending {
  source: DragSource
  startX: number
  startY: number
  element: HTMLElement
}

const THRESHOLD = 4
const SPRING_DELAY = 550
const SCROLL_EDGE = 36
const SCROLL_SPEED = 14

const sameTarget = (a: DropTarget | null, b: DropTarget | null) =>
  JSON.stringify(a) === JSON.stringify(b)

class DragController {
  #session: DragSession | null = null
  #pending: Pending | null = null
  #listeners = new Set<() => void>()
  #frame = 0
  #spring: { spaceId: Id; timer: number } | null = null

  get session(): DragSession | null {
    return this.#session
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  start(source: DragSource, event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0 || this.#pending || this.#session) return
    const target = event.target instanceof Element ? event.target : null
    const interactive = target?.closest('button, input')
    if (interactive && interactive !== event.currentTarget) return
    this.#pending = {
      source,
      startX: event.clientX,
      startY: event.clientY,
      element: event.currentTarget,
    }
    window.addEventListener('pointermove', this.#onMove)
    window.addEventListener('pointerup', this.#onUp)
    window.addEventListener('pointercancel', this.#cancel)
    window.addEventListener('keydown', this.#onKey, true)
    window.addEventListener('blur', this.#cancel)
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }

  #onMove = (event: PointerEvent): void => {
    if (event.buttons === 0) {
      this.#cancel()
      return
    }
    if (!this.#session) {
      const pending = this.#pending
      if (!pending) return
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
      if (distance < THRESHOLD) return
      const rect = pending.element.getBoundingClientRect()
      this.#session = {
        source: pending.source,
        x: event.clientX,
        y: event.clientY,
        offsetX: pending.startX - rect.left,
        offsetY: pending.startY - rect.top,
        width: rect.width,
        height: rect.height,
        target: null,
      }
      document.documentElement.dataset.dragging = pending.source.type
      this.#frame = requestAnimationFrame(this.#tick)
    }
    this.#update(event.clientX, event.clientY)
  }

  #update(x: number, y: number): void {
    const session = this.#session
    if (!session) return
    const target = hitTest(session.source, x, y)
    this.#armSpring(target?.springSpaceId ?? null)
    if (session.x === x && session.y === y && sameTarget(session.target, target)) return
    this.#session = { ...session, x, y, target }
    this.#emit()
  }

  #armSpring(spaceId: Id | null): void {
    if (this.#spring?.spaceId === spaceId) return
    if (this.#spring) window.clearTimeout(this.#spring.timer)
    this.#spring = null
    if (!spaceId) return
    const timer = window.setTimeout(() => {
      ante.command({ type: 'space/select', spaceId })
    }, SPRING_DELAY)
    this.#spring = { spaceId, timer }
  }

  #tick = (): void => {
    const session = this.#session
    if (!session) return
    const scroller = document.querySelector<HTMLElement>('[data-drag-scroll]')
    if (scroller) {
      const rect = scroller.getBoundingClientRect()
      const inside = session.x >= rect.left && session.x <= rect.right
      const top = session.y - rect.top
      const bottom = rect.bottom - session.y
      const speed = (edge: number) => Math.ceil(SCROLL_SPEED * (1 - Math.max(edge, 0) / SCROLL_EDGE))
      if (inside && top < SCROLL_EDGE && top > -SCROLL_EDGE) scroller.scrollTop -= speed(top)
      else if (inside && bottom < SCROLL_EDGE && bottom > -SCROLL_EDGE)
        scroller.scrollTop += speed(bottom)
    }
    this.#update(session.x, session.y)
    this.#frame = requestAnimationFrame(this.#tick)
  }

  #onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.#session) return
    event.preventDefault()
    event.stopPropagation()
    this.#cancel()
  }

  #onUp = (event: PointerEvent): void => {
    if (this.#session) this.#update(event.clientX, event.clientY)
    const action = this.#session?.target?.action ?? null
    const dragged = this.#session !== null
    this.#teardown()
    if (!dragged) return
    suppressNextClick()
    if (action) ante.dispatch(action)
  }

  #cancel = (): void => {
    const dragged = this.#session !== null
    this.#teardown()
    if (dragged) suppressNextClick()
  }

  #teardown(): void {
    window.removeEventListener('pointermove', this.#onMove)
    window.removeEventListener('pointerup', this.#onUp)
    window.removeEventListener('pointercancel', this.#cancel)
    window.removeEventListener('keydown', this.#onKey, true)
    window.removeEventListener('blur', this.#cancel)
    cancelAnimationFrame(this.#frame)
    this.#armSpring(null)
    this.#pending = null
    Reflect.deleteProperty(document.documentElement.dataset, 'dragging')
    if (!this.#session) return
    this.#session = null
    this.#emit()
  }
}

function suppressNextClick(): void {
  const stop = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}

export const drag = new DragController()

export function useDragSession(): DragSession | null {
  return useSyncExternalStore(drag.subscribe, () => drag.session)
}

export function useDragType(): DragSource['type'] | null {
  return useSyncExternalStore(drag.subscribe, () => drag.session?.source.type ?? null)
}

export function useDragSource(source: DragSource) {
  const dragging = useSyncExternalStore(
    drag.subscribe,
    () => drag.session?.source.type === source.type && drag.session.source.id === source.id,
  )
  return {
    dragging,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => drag.start(source, event),
  }
}
