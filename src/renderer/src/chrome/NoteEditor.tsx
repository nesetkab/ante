import { useEffect, useRef } from 'react'
import type { Id, Rect } from '@shared/schema'
import { ante } from '../ante'
import { useDebouncedCallback } from '../panels/useDebounced'
import { useAppState } from '../store'
import { useRemoteVersion } from '../useRemoteVersion'
import styles from './NoteEditor.module.css'

const SAVE_DELAY_MS = 250

export function NoteEditor({ noteId, rect }: { noteId: Id; rect: Rect }) {
  const note = useAppState((state) => state.data.notes[noteId])
  const body = useRef<HTMLTextAreaElement>(null)
  const { fieldsKey, markLocal } = useRemoteVersion(note?.updatedAt ?? 0)
  const save = (patch: { title?: string; body?: string }) => {
    const now = Date.now()
    markLocal(now)
    ante.dispatch({ type: 'note/update', id: noteId, ...patch, now })
  }
  const saveTitle = useDebouncedCallback((title: string) => save({ title }), SAVE_DELAY_MS)
  const saveBody = useDebouncedCallback((text: string) => save({ body: text }), SAVE_DELAY_MS)

  useEffect(() => {
    body.current?.focus()
  }, [noteId])

  return (
    <article
      className={styles.note}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className={styles.page}>
        <input
          key={`${noteId}:title:${fieldsKey}`}
          className={styles.title}
          defaultValue={note?.title ?? ''}
          placeholder="Untitled note"
          spellCheck={false}
          onChange={(event) => saveTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              body.current?.focus()
            }
          }}
        />
        <textarea
          key={`${noteId}:body:${fieldsKey}`}
          ref={body}
          className={styles.body}
          defaultValue={note?.body ?? ''}
          placeholder="Start writing"
          onChange={(event) => saveBody(event.target.value)}
        />
      </div>
    </article>
  )
}
