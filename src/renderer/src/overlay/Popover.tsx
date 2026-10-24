import { ChevronDown, ChevronUp, Monitor, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { describeRequest, type FindState, type Prompt } from '@shared/permissions'
import { popoverFor } from '@shared/popover'
import type { Id } from '@shared/schema'
import { ante } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppState, useWindowData } from '../store'
import styles from './Popover.module.css'

function FindBar({ tabId, find }: { tabId: Id; find: FindState }) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [find.focus])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      ante.command({ type: 'find/step', tabId, forward: !event.shiftKey })
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      ante.command({ type: 'find/close', tabId })
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.find}>
        <input
          ref={input}
          className={styles.findInput}
          defaultValue={find.query}
          placeholder="Find on page"
          spellCheck={false}
          onChange={(event) =>
            ante.command({ type: 'find/query', tabId, query: event.target.value })
          }
          onKeyDown={onKeyDown}
        />
        <span className={styles.count}>{find.query ? `${find.active}/${find.matches}` : ''}</span>
        <IconButton
          size="sm"
          label="Previous match"
          onClick={() => ante.command({ type: 'find/step', tabId, forward: false })}
        >
          <ChevronUp size={14} />
        </IconButton>
        <IconButton
          size="sm"
          label="Next match"
          onClick={() => ante.command({ type: 'find/step', tabId, forward: true })}
        >
          <ChevronDown size={14} />
        </IconButton>
        <IconButton
          size="sm"
          label="Close"
          onClick={() => ante.command({ type: 'find/close', tabId })}
        >
          <X size={14} />
        </IconButton>
      </div>
    </div>
  )
}

function siteName(origin: string): string {
  return origin.replace(/^https?:\/\//, '')
}

function PermissionCard({
  tabId,
  prompt,
}: {
  tabId: Id
  prompt: Extract<Prompt, { kind: 'permission' }>
}) {
  const [remember, setRemember] = useState(true)
  const respond = (allow: boolean) =>
    ante.command({ type: 'permission/respond', tabId, promptId: prompt.id, allow, remember })
  return (
    <div className={styles.card}>
      <div className={styles.prompt}>
        <p className={styles.message}>
          <strong>{siteName(prompt.origin)}</strong> wants to {describeRequest(prompt.permissions)}
        </p>
        <div className={styles.promptActions}>
          <label className={styles.remember}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Remember
          </label>
          <button type="button" className={styles.secondary} onClick={() => respond(false)}>
            Block
          </button>
          <button type="button" className={styles.primary} onClick={() => respond(true)}>
            Allow
          </button>
        </div>
      </div>
    </div>
  )
}

function ScreenCard({ tabId, prompt }: { tabId: Id; prompt: Extract<Prompt, { kind: 'screen' }> }) {
  const [selected, setSelected] = useState<string | null>(prompt.sources[0]?.id ?? null)
  const respond = (allow: boolean) =>
    ante.command({
      type: 'permission/respond',
      tabId,
      promptId: prompt.id,
      allow: allow && selected !== null,
      remember: false,
      ...(selected ? { sourceId: selected } : {}),
    })
  return (
    <div className={styles.card}>
      <div className={styles.prompt}>
        <p className={styles.message}>
          <strong>{siteName(prompt.origin)}</strong> wants to see your screen
        </p>
        <div className={styles.sources}>
          {prompt.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={[styles.source, source.id === selected && styles.sourceOn]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected(source.id)}
              onDoubleClick={() => respond(true)}
            >
              {source.thumbnail ? (
                <img src={source.thumbnail} alt="" className={styles.thumbnail} />
              ) : (
                <span className={styles.thumbnail}>
                  <Monitor size={18} />
                </span>
              )}
              <span className={styles.sourceName}>{source.name}</span>
            </button>
          ))}
        </div>
        <div className={styles.promptActions}>
          <span />
          <button type="button" className={styles.secondary} onClick={() => respond(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!selected}
            onClick={() => respond(true)}
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}

export function Popover() {
  const window = useWindowData()
  const data = useAppState((state) => state.data)
  const runtime = useAppState((state) => state.runtime)
  const popover = window ? popoverFor(data, runtime, window) : null
  if (!popover) return null
  return (
    <div className={styles.popover}>
      {popover.find && <FindBar tabId={popover.tabId} find={popover.find} />}
      {popover.prompt?.kind === 'permission' && (
        <PermissionCard key={popover.prompt.id} tabId={popover.tabId} prompt={popover.prompt} />
      )}
      {popover.prompt?.kind === 'screen' && (
        <ScreenCard key={popover.prompt.id} tabId={popover.tabId} prompt={popover.prompt} />
      )}
    </div>
  )
}
