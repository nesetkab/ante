import { ChevronDown, ChevronUp, KeyRound, Monitor, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { describeRequest, type FindState, type Prompt } from '@shared/permissions'
import { popoverFor, type Popover as PopoverState } from '@shared/popover'
import type { AutofillState, Id } from '@shared/schema'
import { ante, windowId } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppSelector } from '../store'
import styles from './Popover.module.css'

function FindBar({ tabId, find }: { tabId: Id; find: FindState }) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [find.focus])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
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

const ARM_DELAY_MS = 500

function useArmed(): boolean {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), ARM_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return armed
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
  const armed = useArmed()
  const respond = (allow: boolean) => {
    if (armed)
      ante.command({ type: 'permission/respond', tabId, promptId: prompt.id, allow, remember })
  }
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
  const armed = useArmed()
  const respond = (allow: boolean) => {
    if (!armed) return
    ante.command({
      type: 'permission/respond',
      tabId,
      promptId: prompt.id,
      allow: allow && selected !== null,
      remember: false,
      ...(selected ? { sourceId: selected } : {}),
    })
  }
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

function PasswordCard({
  tabId,
  prompt,
}: {
  tabId: Id
  prompt: Extract<Prompt, { kind: 'password' }>
}) {
  const armed = useArmed()
  const respond = (action: 'save' | 'never' | 'dismiss') => {
    if (armed) ante.command({ type: 'password/respond', tabId, promptId: prompt.id, action })
  }
  return (
    <div className={styles.card}>
      <div className={styles.prompt}>
        <p className={styles.message}>
          {prompt.update ? 'Update' : 'Save'} password for{' '}
          <strong>{prompt.username || siteName(prompt.origin)}</strong>
          {prompt.username ? ` on ${siteName(prompt.origin)}` : ''}?
        </p>
        <div className={styles.promptActions}>
          <button
            type="button"
            className={[styles.secondary, styles.quiet].join(' ')}
            onClick={() => respond('never')}
          >
            Never
          </button>
          <button type="button" className={styles.secondary} onClick={() => respond('dismiss')}>
            Not Now
          </button>
          <button type="button" className={styles.primary} onClick={() => respond('save')}>
            {prompt.update ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AutofillList({ tabId, autofill }: { tabId: Id; autofill: AutofillState }) {
  return (
    <div className={styles.autofill}>
      <div className={[styles.card, styles.autofillCard].join(' ')} role="listbox">
        {autofill.logins.map((login) => (
          <button
            key={login.id}
            type="button"
            role="option"
            aria-selected={false}
            className={styles.autofillRow}
            onMouseDown={(event) => {
              event.preventDefault()
              ante.command({ type: 'autofill/fill', tabId, loginId: login.id })
            }}
          >
            <KeyRound size={14} className={styles.autofillIcon} />
            <span className={styles.autofillName}>{login.username || 'No username'}</span>
          </button>
        ))}
        <button
          type="button"
          className={[styles.autofillRow, styles.autofillManage].join(' ')}
          onMouseDown={(event) => {
            event.preventDefault()
            ante.command({ type: 'settings/open', section: 'passwords' })
          }}
        >
          Manage Passwords…
        </button>
      </div>
    </div>
  )
}

function samePopover(a: PopoverState | null, b: PopoverState | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.tabId === b.tabId &&
    a.find === b.find &&
    a.prompt === b.prompt &&
    a.link === b.link &&
    a.autofill === b.autofill
  )
}

export function Popover() {
  const popover = useAppSelector((state) => {
    const window = state.data.windows[windowId]
    return window ? popoverFor(state.data, state.runtime, window) : null
  }, samePopover)
  if (!popover) return null
  if (popover.autofill && !popover.find && !popover.prompt)
    return <AutofillList tabId={popover.tabId} autofill={popover.autofill} />
  if (popover.link && !popover.find && !popover.prompt)
    return (
      <div className={styles.link} role="status">
        {popover.link}
      </div>
    )
  return (
    <div className={styles.popover}>
      {popover.find && <FindBar key={popover.tabId} tabId={popover.tabId} find={popover.find} />}
      {popover.prompt?.kind === 'permission' && (
        <PermissionCard key={popover.prompt.id} tabId={popover.tabId} prompt={popover.prompt} />
      )}
      {popover.prompt?.kind === 'screen' && (
        <ScreenCard key={popover.prompt.id} tabId={popover.tabId} prompt={popover.prompt} />
      )}
      {popover.prompt?.kind === 'password' && (
        <PasswordCard key={popover.prompt.id} tabId={popover.tabId} prompt={popover.prompt} />
      )}
    </div>
  )
}
