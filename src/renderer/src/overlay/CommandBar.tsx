import { ArrowRight, Command as CommandIcon, Globe, History, Layers, Search } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { Command, Disposition } from '@shared/commands'
import { fuzzyMatch, rank } from '@shared/fuzzy'
import type { Data, Id } from '@shared/schema'
import { shortcuts, type Platform } from '@shared/shortcuts'
import { isPrivateSpace } from '@shared/state/private'
import { activeTabId, displayTitle, getTab, spaceTabOrder } from '@shared/state/tree'
import { displayUrl, resolveInput, searchUrls } from '@shared/url'
import { ante } from '../ante'
import { Favicon } from '../components/Favicon'
import { useAppState, useWindowData } from '../store'
import styles from './CommandBar.module.css'
import { extendsInput, useHistorySearch, useSuggestions } from './useOmnibox'

const MAX_RESULTS = 10
const STRONG_ACTION_SCORE = 1000

interface Entry {
  key: string
  icon: ReactNode
  title: string
  detail?: string
  hint?: string
  navigates?: boolean
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

function collectTabs(data: Data, spaceId: Id): Id[] {
  const own = spaceTabOrder(data, spaceId)
  if (isPrivateSpace(data, spaceId)) return own
  const others = data.spaceOrder
    .filter((id) => id !== spaceId)
    .flatMap((id) => spaceTabOrder(data, id))
  return [...new Set([...own, ...others])]
}

const openEntry = (input: string) => (disposition: Disposition) =>
  ante.command({ type: 'open', input, disposition })

export function CommandBar({ mode }: { mode: 'new' | 'edit' }) {
  const window = useWindowData()
  const data = useAppState((current) => current.data)
  const activeId = window ? activeTabId(data, window) : null
  const initial = mode === 'edit' ? (getTab(data, activeId)?.url ?? '') : ''
  const [typed, setTyped] = useState(initial)
  const [autocomplete, setAutocomplete] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fallback: Disposition = mode === 'edit' ? 'current' : 'newTab'
  const engine = data.settings.searchEngine
  const history = useHistorySearch(typed)
  const suggestions = useSuggestions(
    typed,
    typed !== initial && !/^[a-z][a-z0-9+.-]*:/i.test(typed),
  )
  const completion =
    autocomplete && extendsInput(history.completion, typed)
      ? typed + history.completion.slice(typed.length)
      : null
  const value = completion ?? typed

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useLayoutEffect(() => {
    if (completion) inputRef.current?.setSelectionRange(typed.length, completion.length)
  }, [completion, typed])

  const entries = useMemo<Entry[]>(() => {
    if (!window) return []
    const text = typed.trim()
    const target = (completion ?? typed).trim()
    const run = (command: Command) => () => ante.command(command)
    const searchFor = (query: string) => openEntry(searchUrls[engine] + encodeURIComponent(query))
    const result: Entry[] = []

    if (target) {
      const resolved = resolveInput(target, engine)
      const searching = resolved.startsWith(searchUrls[engine])
      result.push({
        key: 'go',
        icon: searching ? <Search size={16} /> : <Globe size={16} />,
        title: searching ? target : displayUrl(resolved),
        detail: searching ? `Search ${engineNames[engine]}` : 'Open',
        navigates: true,
        run: openEntry(target),
      })
    }
    if (completion && text) {
      result.push({
        key: 'search',
        icon: <Search size={16} />,
        title: text,
        detail: `Search ${engineNames[engine]}`,
        navigates: true,
        run: searchFor(text),
      })
    }

    const actions = text
      ? rank(
          text,
          shortcuts(ante.platform as Platform).filter((shortcut) => !shortcut.hidden),
          (shortcut) => [shortcut.label],
        )
      : []
    const actionEntry = (action: (typeof actions)[number]): Entry => ({
      key: `action:${action.id}`,
      icon: <CommandIcon size={16} />,
      title: action.label,
      hint: 'Action',
      run: run(action.command),
    })
    const strong = actions
      .filter((action) => (fuzzyMatch(text, action.label)?.score ?? 0) >= STRONG_ACTION_SCORE)
      .slice(0, 2)
    result.push(...strong.map(actionEntry))

    const tabIds = collectTabs(data, window.spaceId).filter(
      (id) => id !== activeId || mode === 'new',
    )
    const tabs = tabIds.map((id) => getTab(data, id)).filter((tab) => tab !== null)
    const matchedTabs = text
      ? rank(text, tabs, (tab) => [displayTitle(tab), tab.url])
      : [...tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    for (const tab of matchedTabs.slice(0, text ? 3 : 6)) {
      result.push({
        key: `tab:${tab.id}`,
        icon: <Favicon src={tab.favicon} pageUrl={tab.url} size={16} />,
        title: displayTitle(tab) || displayUrl(tab.url),
        detail: displayUrl(tab.url),
        hint: 'Switch to Tab',
        navigates: true,
        run: run({ type: 'tab/activate', tabId: tab.id }),
      })
    }

    if (text) {
      const shown = new Set(tabs.map((tab) => tab.url))
      if (completion) shown.add(resolveInput(completion, engine))
      const visits = history.entries.filter((entry) => !shown.has(entry.url)).slice(0, 4)
      for (const entry of visits) {
        result.push({
          key: `history:${entry.id}`,
          icon: entry.favicon ? (
            <Favicon src={entry.favicon} pageUrl={entry.url} size={16} />
          ) : (
            <History size={16} />
          ),
          title: entry.title || displayUrl(entry.url),
          detail: displayUrl(entry.url),
          navigates: true,
          run: openEntry(entry.url),
        })
      }

      const typedLower = text.toLowerCase()
      for (const suggestion of suggestions
        .filter((item) => item.toLowerCase() !== typedLower)
        .slice(0, 3)) {
        result.push({
          key: `suggest:${suggestion}`,
          icon: <Search size={16} />,
          title: suggestion,
          navigates: true,
          run: searchFor(suggestion),
        })
      }

      const spaces = isPrivateSpace(data, window.spaceId)
        ? []
        : data.spaceOrder.map((id) => data.spaces[id]).filter((space) => space !== undefined)
      for (const space of rank(text, spaces, (space) => [space.name]).slice(0, 1)) {
        result.push({
          key: `space:${space.id}`,
          icon: <Layers size={16} />,
          title: space.name,
          hint: 'Go to Space',
          run: run({ type: 'space/select', spaceId: space.id }),
        })
      }
      const weak = actions.filter((action) => !strong.includes(action)).slice(0, 2)
      result.push(...weak.map(actionEntry))
    }
    return result.slice(0, MAX_RESULTS)
  }, [typed, completion, history, suggestions, data, window, activeId, mode, engine])

  const selectedIndex = entries.findIndex((entry) => entry.key === selectedKey)
  const current = selectedIndex >= 0 ? selectedIndex : 0

  const select = (index: number) => {
    const count = Math.max(entries.length, 1)
    setSelectedKey(entries[(index + count) % count]?.key ?? null)
  }

  const execute = (entry: Entry | undefined, disposition: Disposition) => {
    if (!entry) return
    entry.run(disposition)
    if (!entry.navigates) ante.command({ type: 'overlay/close' })
  }

  const acceptCompletion = () => {
    if (!completion) return false
    setTyped(completion)
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        select(current + 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        select(current - 1)
        return
      case 'ArrowRight':
      case 'End':
        acceptCompletion()
        return
      case 'Tab':
        if (acceptCompletion()) event.preventDefault()
        return
      case 'Enter':
        if (event.nativeEvent.isComposing) return
        event.preventDefault()
        execute(entries[current], dispositionFor(event, fallback))
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
            value={value}
            placeholder="Search or enter address"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              const next = event.target.value
              const inputType = (event.nativeEvent as InputEvent).inputType
              const atEnd = event.target.selectionStart === next.length
              setAutocomplete(atEnd && !inputType.startsWith('delete'))
              setTyped(next)
              setSelectedKey(null)
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
                onMouseMove={() => setSelectedKey(entry.key)}
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
