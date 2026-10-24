import type { EaselElement } from '@shared/schema'
import { assetUrl } from '@shared/easels'
import { hostOf } from '@shared/url'
import { ante } from '../../ante'
import { Favicon } from '../../components/Favicon'
import styles from './Easel.module.css'

export type BoxElement = Exclude<EaselElement, { kind: 'stroke' }>

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function strokePath(points: readonly number[]): string {
  if (points.length < 2) return ''
  const [x, y, ...rest] = points
  let path = `M${x ?? 0} ${y ?? 0}`
  for (let index = 0; index + 1 < rest.length; index += 2) {
    path += ` L${rest[index] ?? 0} ${rest[index + 1] ?? 0}`
  }
  return path
}

interface ElementViewProps {
  element: BoxElement
  box: Box
  selected: boolean
  editing: boolean
  onText: (text: string) => void
}

export function ElementView({ element, box, selected, editing, onText }: ElementViewProps) {
  const style = { left: box.x, top: box.y, width: box.w, height: box.h }
  const className = [styles.element, selected && styles.selected].filter(Boolean).join(' ')

  switch (element.kind) {
    case 'text':
      return (
        <div className={className} style={style} data-element={element.id}>
          {editing ? (
            <textarea
              className={styles.textInput}
              style={{ fontSize: element.size }}
              defaultValue={element.text}
              autoFocus
              onChange={(event) => onText(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ) : (
            <div className={styles.text} style={{ fontSize: element.size }}>
              {element.text || 'Text'}
            </div>
          )}
        </div>
      )
    case 'image':
      return (
        <div className={className} style={style} data-element={element.id}>
          <img className={styles.image} src={assetUrl(element.asset)} alt="" draggable={false} />
        </div>
      )
    case 'link':
      return (
        <div
          className={[className, styles.link].join(' ')}
          style={style}
          data-element={element.id}
          onDoubleClick={() =>
            ante.command({ type: 'open', input: element.url, disposition: 'newTab' })
          }
          title={element.url}
        >
          <Favicon src={null} pageUrl={element.url} size={18} />
          <span className={styles.linkText}>
            <span className={styles.linkTitle}>{element.title || hostOf(element.url)}</span>
            <span className={styles.linkHost}>{hostOf(element.url)}</span>
          </span>
        </div>
      )
  }
}
