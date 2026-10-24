import { useState, type PointerEvent } from 'react'
import { ante } from '../ante'
import styles from './CaptureOverlay.module.css'

interface Point {
  x: number
  y: number
}

const toRect = (a: Point, b: Point) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
})

export function CaptureOverlay() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const selection = start && end ? toRect(start, end) : null

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setStart({ x: event.clientX, y: event.clientY })
    setEnd({ x: event.clientX, y: event.clientY })
  }

  const onPointerUp = () => {
    if (selection && selection.width > 4 && selection.height > 4) {
      ante.command({ type: 'capture/region', ...selection })
    }
    setStart(null)
    setEnd(null)
  }

  return (
    <div
      className={[styles.overlay, selection && styles.selecting].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        if (start) setEnd({ x: event.clientX, y: event.clientY })
      }}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onPointerUp}
    >
      {selection ? (
        <div
          className={styles.selection}
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        >
          <span className={styles.size}>
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </span>
        </div>
      ) : (
        <div className={styles.hint}>Drag to capture · Esc to cancel</div>
      )}
    </div>
  )
}
