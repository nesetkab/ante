import { Crop, MousePointer2, Pencil, Trash2, Type } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH, placeImage } from '@shared/easels'
import type { EaselElement, Id, Rect } from '@shared/schema'
import { isWebUrl } from '@shared/url'
import { ante } from '../../ante'
import { IconButton } from '../../components/IconButton'
import { useDebouncedCallback } from '../../panels/useDebounced'
import { useAppState } from '../../store'
import styles from './Easel.module.css'
import { ElementView, strokePath, type Box, type BoxElement } from './EaselElements'

type Tool = 'select' | 'text' | 'draw'

const PEN_COLORS = ['#141414', '#d64545', '#3d6be0', '#1f9e8f'] as const
const PEN_WIDTH = 3
const MIN_BOX = { w: 40, h: 24 }

interface Drag {
  id: Id
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origin: Box
}

interface Point {
  x: number
  y: number
}

const isBox = (element: EaselElement): element is BoxElement => element.kind !== 'stroke'

export function EaselEditor({ easelId, rect }: { easelId: Id; rect: Rect }) {
  const easel = useAppState((state) => state.data.easels[easelId])
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>(PEN_COLORS[0])
  const [selected, setSelected] = useState<Id | null>(null)
  const [editing, setEditing] = useState<Id | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [moved, setMoved] = useState<{ id: Id; box: Box } | null>(null)
  const [stroke, setStroke] = useState<number[] | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const board = useRef<HTMLDivElement>(null)
  const elementsRef = useRef<readonly EaselElement[]>([])
  const elements = useMemo(() => easel?.elements ?? [], [easel])

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  const upsert = (element: EaselElement) =>
    ante.dispatch({ type: 'easel/upsert', id: easelId, element, now: Date.now() })

  const saveText = useDebouncedCallback((change: { id: Id; text: string }) => {
    const current = elementsRef.current.find((element) => element.id === change.id)
    if (current?.kind === 'text') upsert({ ...current, text: change.text })
  }, 300)

  const saveTitle = useDebouncedCallback(
    (title: string) => ante.dispatch({ type: 'easel/rename', id: easelId, title, now: Date.now() }),
    300,
  )

  const viewport = (): Rect => {
    const element = scroller.current
    if (!element) return { x: 0, y: 0, width: 1200, height: 800 }
    return {
      x: element.scrollLeft,
      y: element.scrollTop,
      width: element.clientWidth,
      height: element.clientHeight,
    }
  }

  const pointFrom = (event: { clientX: number; clientY: number }): Point | null => {
    const bounds = board.current?.getBoundingClientRect()
    if (!bounds) return null
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  const removeSelected = () => {
    if (!selected) return
    ante.dispatch({ type: 'easel/remove', id: easelId, elementIds: [selected], now: Date.now() })
    setSelected(null)
    setEditing(null)
  }

  const addText = (point: Point, text = '') => {
    const id = crypto.randomUUID()
    upsert({ kind: 'text', id, x: point.x, y: point.y, w: 260, h: 64, text, size: 20 })
    setSelected(id)
    if (!text) setEditing(id)
  }

  const addLink = (point: Point, url: string) => {
    const id = crypto.randomUUID()
    upsert({ kind: 'link', id, x: point.x, y: point.y, w: 300, h: 64, url, title: '' })
    setSelected(id)
  }

  const addImage = async (file: Blob) => {
    const asset = await ante.saveAsset(new Uint8Array(await file.arrayBuffer()))
    if (!asset) return
    const bitmap = await createImageBitmap(file)
    const box = placeImage(viewport(), { width: bitmap.width, height: bitmap.height })
    bitmap.close()
    const id = crypto.randomUUID()
    upsert({ kind: 'image', id, ...box, asset, sourceUrl: null })
    setSelected(id)
  }

  const center = (): Point => {
    const view = viewport()
    return { x: view.x + view.width / 2 - 150, y: view.y + view.height / 2 - 32 }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const point = pointFrom(event)
    if (!point) return
    const target = event.target instanceof Element ? event.target : null
    const handle = target?.closest<HTMLElement>('[data-handle]')?.dataset.handle
    const hit =
      handle ?? target?.closest<HTMLElement | SVGElement>('[data-element]')?.dataset.element

    if (tool === 'draw') {
      event.currentTarget.setPointerCapture(event.pointerId)
      setStroke([Math.round(point.x), Math.round(point.y)])
      return
    }
    if (tool === 'text' && !hit) {
      addText(point)
      setTool('select')
      return
    }
    if (!hit) {
      setSelected(null)
      setEditing(null)
      return
    }
    const element = elements.find((candidate) => candidate.id === hit)
    if (!element) return
    setSelected(hit)
    if (editing !== hit) setEditing(null)
    if (!isBox(element)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      id: hit,
      mode: handle ? 'resize' : 'move',
      startX: point.x,
      startY: point.y,
      origin: { x: element.x, y: element.y, w: element.w, h: element.h },
    })
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointFrom(event)
    if (!point) return
    if (stroke) {
      const lastX = stroke[stroke.length - 2] ?? point.x
      const lastY = stroke[stroke.length - 1] ?? point.y
      if (Math.hypot(point.x - lastX, point.y - lastY) >= 2) {
        setStroke([...stroke, Math.round(point.x), Math.round(point.y)])
      }
      return
    }
    if (!drag) return
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY
    const { origin } = drag
    const box =
      drag.mode === 'move'
        ? { ...origin, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) }
        : {
            ...origin,
            w: Math.round(Math.max(MIN_BOX.w, origin.w + dx)),
            h: Math.round(Math.max(MIN_BOX.h, origin.h + dy)),
          }
    setMoved({ id: drag.id, box })
  }

  const onPointerUp = () => {
    if (stroke) {
      if (stroke.length >= 4) {
        upsert({ kind: 'stroke', id: crypto.randomUUID(), points: stroke, color, width: PEN_WIDTH })
      }
      setStroke(null)
      return
    }
    if (drag && moved) {
      const element = elements.find((candidate) => candidate.id === moved.id)
      if (element && isBox(element)) upsert({ ...element, ...moved.box })
      ante.dispatch({ type: 'easel/front', id: easelId, elementId: moved.id, now: Date.now() })
    }
    setDrag(null)
    setMoved(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || event.target instanceof HTMLInputElement) return
    if (event.key === 'Backspace' || event.key === 'Delete') removeSelected()
    if (event.key === 'Escape') {
      setSelected(null)
      setEditing(null)
    }
    if (event.key === 'v') setTool('select')
    if (event.key === 't') setTool('text')
    if (event.key === 'p') setTool('draw')
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)
      return
    const images = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'))
    if (images.length > 0) {
      event.preventDefault()
      for (const image of images) void addImage(image)
      return
    }
    const text = event.clipboardData.getData('text/plain').trim()
    if (!text) return
    event.preventDefault()
    if (isWebUrl(text)) addLink(center(), text)
    else addText(center(), text)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const point = pointFrom(event) ?? center()
    const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'))
    if (images.length > 0) {
      for (const image of images) void addImage(image)
      return
    }
    const url = event.dataTransfer.getData('text/uri-list').split('\n')[0]?.trim() ?? ''
    if (isWebUrl(url)) addLink(point, url)
    else {
      const text = event.dataTransfer.getData('text/plain').trim()
      if (text) addText(point, text)
    }
  }

  if (!easel) return null
  const strokes = elements.filter((element) => element.kind === 'stroke')
  const boxes = elements.filter(isBox)
  const selectedBox = boxes.find((element) => element.id === selected)
  const handle = selectedBox
    ? { id: selectedBox.id, box: moved?.id === selectedBox.id ? moved.box : selectedBox }
    : null

  return (
    <article
      className={styles.easel}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className={styles.toolbar}>
        <input
          key={easelId}
          className={styles.title}
          defaultValue={easel.title}
          placeholder="Untitled easel"
          spellCheck={false}
          onChange={(event) => saveTitle(event.target.value)}
        />
        <span className={styles.separator} />
        <IconButton
          label="Select (V)"
          aria-pressed={tool === 'select'}
          className={tool === 'select' ? styles.toolOn : undefined}
          onClick={() => setTool('select')}
        >
          <MousePointer2 size={15} />
        </IconButton>
        <IconButton
          label="Text (T)"
          aria-pressed={tool === 'text'}
          className={tool === 'text' ? styles.toolOn : undefined}
          onClick={() => setTool('text')}
        >
          <Type size={15} />
        </IconButton>
        <IconButton
          label="Draw (P)"
          aria-pressed={tool === 'draw'}
          className={tool === 'draw' ? styles.toolOn : undefined}
          onClick={() => setTool('draw')}
        >
          <Pencil size={15} />
        </IconButton>
        {tool === 'draw' &&
          PEN_COLORS.map((pen) => (
            <button
              key={pen}
              type="button"
              aria-label={`Pen color ${pen}`}
              className={[styles.pen, pen === color && styles.penOn].filter(Boolean).join(' ')}
              style={{ background: pen }}
              onClick={() => setColor(pen)}
            />
          ))}
        <span className={styles.separator} />
        <IconButton
          label="Capture from a page"
          onClick={() => ante.command({ type: 'capture/start', easelId, view: viewport() })}
        >
          <Crop size={15} />
        </IconButton>
        {selected && (
          <IconButton label="Delete" onClick={removeSelected}>
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>

      {elements.length === 0 && (
        <p className={styles.hint}>
          Paste images or links, press T to write, P to draw. Put a page next to this easel and use
          capture to clip parts of it.
        </p>
      )}

      <div
        ref={scroller}
        className={styles.scroller}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div
          ref={board}
          className={[
            styles.board,
            tool === 'draw' && styles.drawing,
            tool === 'text' && styles.typing,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(event) => {
            const target = event.target instanceof Element ? event.target : null
            const hit = target?.closest<HTMLElement>('[data-element]')?.dataset.element
            const element = elements.find((candidate) => candidate.id === hit)
            if (element?.kind === 'text') setEditing(element.id)
          }}
        >
          <svg className={styles.strokes} width={BOARD_WIDTH} height={BOARD_HEIGHT}>
            {strokes.map((element) => (
              <path
                key={element.id}
                data-element={element.id}
                d={strokePath(element.points)}
                stroke={element.color}
                strokeWidth={element.width}
                className={selected === element.id ? styles.strokeSelected : undefined}
              />
            ))}
            {stroke && <path d={strokePath(stroke)} stroke={color} strokeWidth={PEN_WIDTH} />}
          </svg>
          {boxes.map((element) => (
            <ElementView
              key={element.id}
              element={element}
              box={moved?.id === element.id ? moved.box : element}
              selected={selected === element.id}
              editing={editing === element.id}
              onText={(text) => saveText({ id: element.id, text })}
            />
          ))}
          {handle && (
            <div
              className={styles.handle}
              data-handle={handle.id}
              style={{
                left: handle.box.x + handle.box.w - 6,
                top: handle.box.y + handle.box.h - 6,
              }}
            />
          )}
        </div>
      </div>
    </article>
  )
}
