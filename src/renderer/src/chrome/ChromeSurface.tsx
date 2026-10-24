import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { SPLIT_GAP } from '@shared/layout'
import { ante, modKey } from '../ante'
import { useAppState, useWindowData } from '../store'
import { ArcImportPrompt } from './ArcImportPrompt'
import styles from './ChromeSurface.module.css'
import { LittleToolbar } from './LittleToolbar'
import { useWindowLayout } from './useWindowLayout'
import { EaselEditor } from './easel/EaselEditor'
import { NoteEditor } from './NoteEditor'
import { TabProblem } from './TabProblem'
import { Sidebar } from './Sidebar'
import { Toasts } from './Toasts'

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
  const frame = useWindowLayout()
  const drag = useRef<{ index: number; origin: number; sizes: number[]; total: number } | null>(
    null,
  )
  const layout = frame?.layout ?? null
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
  const frame = useWindowLayout()
  if (!frame) return null
  const { layout, panes, hasTabs } = frame

  if (!hasTabs) {
    const { content } = layout
    return (
      <div
        className={styles.empty}
        style={{ left: content.x, top: content.y, width: content.width, height: content.height }}
      >
        <ArcImportPrompt />
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
      {panes.map((pane) => {
        if (pane.page?.kind === 'note') {
          return (
            <NoteEditor
              key={`${pane.tabId}:${pane.page.id}`}
              noteId={pane.page.id}
              rect={pane.rect}
            />
          )
        }
        if (pane.page?.kind === 'easel') {
          return (
            <EaselEditor
              key={`${pane.tabId}:${pane.page.id}`}
              easelId={pane.page.id}
              rect={pane.rect}
            />
          )
        }
        if (pane.problem) return <TabProblem key={pane.tabId} tabId={pane.tabId} rect={pane.rect} />
        return (
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
        )
      })}
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
      <Toasts />
    </div>
  )
}
