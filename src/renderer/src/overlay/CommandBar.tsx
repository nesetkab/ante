import { ArrowRight, Command as CommandIcon, Globe, Layers, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Command, Disposition } from '@shared/commands'
import { rank } from '@shared/fuzzy'
import type { AppState, Id } from '@shared/schema'
import { shortcuts, type Platform } from '@shared/shortcuts'
import { activeTabId, displayTitle, getTab, spaceTabOrder } from '@shared/state/tree'
import { displayUrl, resolveInput, searchUrls } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { useAppState, useWindowData } from '../store'
import styles from './CommandBar.module.css'

const MAX_RESULTS = 8

interface Entry {
  key: string
  icon: ReactNode
  title: string
  detail?: string
  hint?: string
  run(disposition: Disposition): void
}

const engineNames: Record<keyof typeof searchUrls, string> = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
  brave: 'Brave Search',
  kagi: 'Kagi',
  ecosia: 'Ecosia',
}

function dispositionFor(event: KeyboardEvent, fallback: Disposition): Disposition {
  if (event.altKey) return 'peek'
  if (event.shiftKey) return 'background'
  if (event.metaKey || event.ctrlKey) return 'little'
  return fallback
}

function collectTabs(state: AppState, spaceId: Id): Id[] {
  const own = spaceTabOrder(state.data, spaceId)
  const others = state.data.spaceOrder
    .filter((id) => id !== spaceId)
    .flatMap((id) => spaceTabOrder(state.data, id))
  return [...new Set([...own, ...others])]
}

export function CommandBar({ mode }: { mode: 'new' | 'edit' }) {
  const window = useWindowData()
  const state = useAppState((current) => current)
  const activeId = window ? activeTabId(state.data, window) : null
  const initial = mode === 'edit' ? (getTab(state.data, activeId)?.url ?? '') : ''
  const [query, setQuery] = useState(initial)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const fallback: Disposition = mode === 'edit' ? 'current' : 'newTab'
  const engine = state.data.settings.searchEngine

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const entries = useMemo<Entry[]>(() => {
    if (!window) return []
    const text = query.trim()
    const run = (command: Command) => () => ante.command(command)
    const result: Entry[] = []

    if (text) {
      const resolved = resolveInput(text, engine)
      const isSearch = resolved.startsWith(searchUrls[engine])
      result.push({
        key: 'go',
        icon: isSearch ? <Search size={16} /> : <Globe size={16} />,
        title: isSearch ? text : displayUrl(resolved),
        detail: isSearch ? `Search ${engineNames[engine]}` : 'Open',
        run: (disposition) => ante.command({ type: 'open', input: text, disposition }),
      })
    }

    const tabIds = collectTabs(state, window.spaceId).filter(
      (id) => id !== activeId || mode === 'new',
    )
    const tabs = tabIds.map((id) => getTab(state.data, id)).filter((tab) => tab !== null)
    const matchedTabs = text
      ? rank(text, tabs, (tab) => [displayTitle(tab), tab.url])
      : [...tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    for (const tab of matchedTabs.slice(0, text ? 5 : 6)) {
      result.push({
        key: `tab:${tab.id}`,
        icon: <Favicon src={tab.favicon} size={16} />,
        title: displayTitle(tab) || displayUrl(tab.url),
        detail: displayUrl(tab.url),
        hint: 'Switch to Tab',
        run: run({ type: 'tab/activate', tabId: tab.id }),
      })
    }

    if (text) {
      const spaces = state.data.spaceOrder
        .map((id) => state.data.spaces[id])
        .filter((space) => space !== undefined)
      for (const space of rank(text, spaces, (space) => [space.name]).slice(0, 2)) {
        result.push({
          key: `space:${space.id}`,
          icon: <Layers size={16} />,
          title: space.name,
          hint: 'Go to Space',
          run: run({ type: 'space/select', spaceId: space.id }),
        })
      }
      const actions = shortcuts(ante.platform as Platform).filter((shortcut) => !shortcut.hidden)
      for (const action of rank(text, actions, (shortcut) => [shortcut.label]).slice(0, 4)) {
        result.push({
          key: `action:${action.id}`,
          icon: <CommandIcon size={16} />,
          title: action.label,
          hint: 'Action',
          run: run(action.command),
        })
      }
    }
    return result.slice(0, MAX_RESULTS)
  }, [query, state, window, activeId, mode, engine])

  const current = Math.min(selected, Math.max(entries.length - 1, 0))

  const execute = (entry: Entry | undefined, disposition: Disposition) => {
    if (!entry) return
    entry.run(disposition)
    if (!entry.key.startsWith('go') && !entry.key.startsWith('tab:'))
      ante.command({ type: 'overlay/close' })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setSelected((current + 1) % Math.max(entries.length, 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setSelected((current - 1 + entries.length) % Math.max(entries.length, 1))
        return
      case 'Enter':
        event.preventDefault()
        execute(entries[current], dispositionFor(event, fallback))
        return
      case 'Escape':
        event.preventDefault()
        ante.command({ type: 'overlay/close' })
        return
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={() => ante.command({ type: 'overlay/close' })}>
      <div className={styles.panel} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.inputRow}>
          <Search size={17} className={styles.inputIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder="Search or enter address"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        {entries.length > 0 && (
          <ul className={styles.results} role="listbox">
            {entries.map((entry, index) => (
              <li
                key={entry.key}
                role="option"
                aria-selected={index === current}
                className={[styles.result, index === current && styles.selected]
                  .filter(Boolean)
                  .join(' ')}
                onMouseMove={() => setSelected(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  execute(entry, fallback)
                }}
              >
                <span className={styles.icon}>{entry.icon}</span>
                <span className={styles.text}>
                  <span className={styles.title}>{entry.title}</span>
                  {entry.detail && <span className={styles.detail}>{entry.detail}</span>}
                </span>
                {entry.hint && <span className={styles.hint}>{entry.hint}</span>}
                {index === current && <ArrowRight size={14} className={styles.enter} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
