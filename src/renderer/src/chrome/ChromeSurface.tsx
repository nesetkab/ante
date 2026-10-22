import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { computeLayout, SPLIT_GAP } from '@shared/layout'
import { visibleTabIds } from '@shared/state/tree'
import { ante, modKey } from '../ante'
import { useViewportSize } from '../hooks'
import { useAppState, useWindowData } from '../store'
import styles from './ChromeSurface.module.css'
import { LittleToolbar } from './LittleToolbar'
import { Sidebar } from './Sidebar'

function SidebarResizer({ side }: { side: 'left' | 'right' }) {
  const start = useRef<{ x: number; width: number } | null>(null)
  const width = useAppState((state) => state.data.settings.sidebarWidth)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { x: event.clientX, width }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const delta =
      side === 'left' ? event.clientX - start.current.x : start.current.x - event.clientX
    const next = Math.round(Math.min(480, Math.max(180, start.current.width + delta)))
    if (next !== width) ante.dispatch({ type: 'settings/update', patch: { sidebarWidth: next } })
  }
  const onPointerUp = () => {
    start.current = null
  }

  return (
    <div
      className={styles.resizer}
      style={side === 'left' ? { left: width - 4 } : { right: width - 4 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

function SplitHandles() {
  const window = useWindowData()
  const data = useAppState((state) => state.data)
  const { width, height } = useViewportSize()
  const drag = useRef<{ index: number; origin: number; sizes: number[]; total: number } | null>(
    null,
  )
  const layout = window
    ? computeLayout({ width, height, window, data, fullscreenTabId: null })
    : null
  const split = layout?.split ?? null

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || !split) return
    const horizontal = split.direction === 'horizontal'
    const delta = ((horizontal ? event.clientX : event.clientY) - current.origin) / current.total
    const sizes = [...current.sizes]
    const a = sizes[current.index] ?? 0
    const b = sizes[current.index + 1] ?? 0
    const min = 0.12
    const shift = Math.min(Math.max(delta, min - a), b - min)
    sizes[current.index] = a + shift
    sizes[current.index + 1] = b - shift
    ante.dispatch({ type: 'split/resize', id: split.id, sizes })
  }

  if (!layout || !split) return null
  const horizontal = split.direction === 'horizontal'
  const total =
    (horizontal ? layout.content.width : layout.content.height) -
    SPLIT_GAP * (layout.panes.length - 1)

  return (
    <>
      {layout.panes.slice(0, -1).map((pane, index) => {
        const style = horizontal
          ? {
              left: pane.rect.x + pane.rect.width,
              top: pane.rect.y,
              width: SPLIT_GAP,
              height: pane.rect.height,
            }
          : {
              left: pane.rect.x,
              top: pane.rect.y + pane.rect.height,
              width: pane.rect.width,
              height: SPLIT_GAP,
            }
        return (
          <div
            key={pane.tabId}
            className={[
              styles.splitHandle,
              horizontal ? styles.splitHandleH : styles.splitHandleV,
            ].join(' ')}
            style={style}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = {
                index,
                origin: horizontal ? event.clientX : event.clientY,
                sizes: [...split.sizes],
                total,
              }
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              drag.current = null
            }}
          />
        )
      })}
    </>
  )
}

function ContentFrames() {
  const window = useWindowData()
  const data = useAppState((state) => state.data)
  const { width, height } = useViewportSize()
  if (!window) return null
  const layout = computeLayout({ width, height, window, data, fullscreenTabId: null })
  const hasTabs = visibleTabIds(data, window).length > 0

  if (!hasTabs) {
    const { content } = layout
    return (
      <div
        className={styles.empty}
        style={{ left: content.x, top: content.y, width: content.width, height: content.height }}
      >
        <button
          type="button"
          className={styles.emptyAction}
          onClick={() => ante.command({ type: 'commandBar/open', mode: 'new' })}
        >
          <span>New Tab</span>
          <kbd>{modKey}T</kbd>
        </button>
      </div>
    )
  }

  return (
    <>
      {layout.panes.map((pane) => (
        <div
          key={pane.tabId}
          className={styles.frame}
          style={{
            left: pane.rect.x,
            top: pane.rect.y,
            width: pane.rect.width,
            height: pane.rect.height,
          }}
        />
      ))}
    </>
  )
}

export function ChromeSurface() {
  const window = useWindowData()
  const settings = useAppState((state) => state.data.settings)
  if (!window) return null

  if (window.kind === 'little') {
    return (
      <div className={styles.surface}>
        <LittleToolbar />
        <ContentFrames />
      </div>
    )
  }

  const side = settings.sidebarSide
  return (
    <div className={styles.surface}>
      {!window.sidebarHidden && (
        <div className={styles.sidebarSlot} style={{ width: settings.sidebarWidth, [side]: 0 }}>
          <Sidebar />
        </div>
      )}
      {!window.sidebarHidden && <SidebarResizer side={side} />}
      {window.sidebarHidden && (
        <div
          className={styles.edgeHover}
          style={{ [side]: 0 }}
          onMouseEnter={() => ante.command({ type: 'window/sidebarHover', hovering: true })}
        />
      )}
      <div className={styles.dragRegion} />
      <ContentFrames />
      <SplitHandles />
    </div>
  )
}
