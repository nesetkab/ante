import { mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import { z } from 'zod'
import {
  hostCompletion,
  isRecordable,
  rankHistory,
  urlCompletion,
  type HistoryEntry,
  type HistoryResult,
  type historyQuerySchema,
} from '@shared/history'
import type { Id } from '@shared/schema'
import { getTab } from '@shared/state/tree'
import { hostOf } from '@shared/url'
import type { Store } from './store'

const RELEVANCE_CANDIDATES = 2000
const MAX_TOKENS = 8
const MAX_TITLE = 1000
const MAX_FAVICON = 4096
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000

const SCHEMA = `
  create table if not exists visits (
    id integer primary key,
    profile_id text not null,
    url text not null,
    host text not null default '',
    title text not null default '',
    favicon text,
    visit_count integer not null default 0,
    last_visit integer not null,
    unique (profile_id, url)
  );
  create index if not exists visits_recent on visits (profile_id, last_visit desc);
  create index if not exists visits_host on visits (profile_id, host);
`

const rowSchema = z.object({
  id: z.number(),
  url: z.string(),
  title: z.string(),
  favicon: z.string().nullable(),
  visit_count: z.number(),
  last_visit: z.number(),
})

const hostRowSchema = z.object({
  host: z.string(),
  visit_count: z.number(),
  last_visit: z.number(),
})

type SearchOptions = z.output<typeof historyQuerySchema>

const toEntry = (row: z.infer<typeof rowSchema>): HistoryEntry => ({
  id: row.id,
  url: row.url,
  title: row.title,
  favicon: row.favicon,
  visitCount: row.visit_count,
  lastVisit: row.last_visit,
})

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const attempt = () => {
    const db = new DatabaseSync(file)
    db.exec('pragma journal_mode = wal; pragma synchronous = normal;')
    db.exec(SCHEMA)
    return db
  }
  try {
    return attempt()
  } catch (error) {
    if (file === ':memory:') throw error
    console.error('[history] unreadable database, starting fresh', error)
    renameSync(file, `${file}.corrupt-${Date.now()}`)
    return attempt()
  }
}

export class HistoryStore {
  readonly #db: DatabaseSync
  readonly #visit: StatementSync
  readonly #title: StatementSync
  readonly #favicon: StatementSync
  readonly #hosts: StatementSync
  readonly #delete: StatementSync
  readonly #clear: StatementSync
  readonly #prune: StatementSync

  constructor(file: string) {
    this.#db = openDatabase(file)
    this.#visit = this.#db.prepare(`
      insert into visits (profile_id, url, host, visit_count, last_visit) values (?, ?, ?, 1, ?)
      on conflict (profile_id, url) do update set
        visit_count = visit_count + 1,
        last_visit = max(last_visit, excluded.last_visit)
    `)
    this.#title = this.#db.prepare('update visits set title = ? where profile_id = ? and url = ?')
    this.#favicon = this.#db.prepare(
      'update visits set favicon = ? where profile_id = ? and url = ?',
    )
    this.#hosts = this.#db.prepare(`
      select host, sum(visit_count) as visit_count, max(last_visit) as last_visit from visits
      where profile_id = ? and host like ? escape '\\'
      group by host order by visit_count desc limit 50
    `)
    this.#delete = this.#db.prepare('delete from visits where profile_id = ? and id = ?')
    this.#clear = this.#db.prepare('delete from visits where profile_id = ?')
    this.#prune = this.#db.prepare('delete from visits where last_visit < ?')
  }

  visit(profileId: Id, url: string, now = Date.now()): void {
    if (!isRecordable(url)) return
    this.#visit.run(profileId, url, hostOf(url), now)
  }

  setTitle(profileId: Id, url: string, title: string): void {
    this.#title.run(title.slice(0, MAX_TITLE), profileId, url)
  }

  setFavicon(profileId: Id, url: string, favicon: string): void {
    if (favicon.length > MAX_FAVICON) return
    this.#favicon.run(favicon, profileId, url)
  }

  search(profileId: Id, options: SearchOptions, now = Date.now()): HistoryResult {
    const text = options.query.trim()
    const conditions = ['profile_id = ?']
    const params: SQLInputValue[] = [profileId]
    for (const token of text.split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS)) {
      const pattern = `%${escapeLike(token)}%`
      conditions.push(`(url like ? escape '\\' or title like ? escape '\\')`)
      params.push(pattern, pattern)
    }
    if (options.before !== undefined) {
      if (options.beforeId === undefined) {
        conditions.push('last_visit < ?')
        params.push(options.before)
      } else {
        conditions.push('(last_visit < ? or (last_visit = ? and id < ?))')
        params.push(options.before, options.before, options.beforeId)
      }
    }
    const recent = options.order === 'recent'
    const limit = recent ? options.limit : RELEVANCE_CANDIDATES
    const rows = this.#db
      .prepare(
        `select id, url, title, favicon, visit_count, last_visit from visits
         where ${conditions.join(' and ')} order by last_visit desc, id desc limit ?`,
      )
      .all(...params, limit)
    const entries = z.array(rowSchema).parse(rows).map(toEntry)
    if (recent) return { entries, completion: null }
    return {
      entries: rankHistory(text, entries, now).slice(0, options.limit),
      completion: text ? this.#completion(profileId, options.query, entries, now) : null,
    }
  }

  #completion(profileId: Id, query: string, entries: HistoryEntry[], now: number) {
    const fromUrl = urlCompletion(query, entries, now)
    if (fromUrl) return fromUrl
    const bare = query
      .trimStart()
      .toLowerCase()
      .replace(/^www\./, '')
    if (!bare) return null
    const hosts = z
      .array(hostRowSchema)
      .parse(this.#hosts.all(profileId, `${escapeLike(bare)}%`))
      .map((row) => ({ host: row.host, visitCount: row.visit_count, lastVisit: row.last_visit }))
    return hostCompletion(query, hosts, now)
  }

  delete(profileId: Id, ids: readonly number[]): void {
    this.#db.exec('begin')
    try {
      for (const id of ids) this.#delete.run(profileId, id)
      this.#db.exec('commit')
    } catch (error) {
      this.#db.exec('rollback')
      throw error
    }
  }

  clear(profileId: Id): void {
    this.#clear.run(profileId)
  }

  prune(now = Date.now()): void {
    this.#prune.run(now - RETENTION_MS)
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close()
  }
}

export interface HistoryHooks {
  profileFor(tabId: Id): Id
  isRecording(tabId: Id): boolean
}

export function recordHistory(store: Store, history: HistoryStore, hooks: HistoryHooks) {
  const lastUrl = new Map<Id, string>()
  return store.subscribe(({ action, state }) => {
    if (action.type !== 'tab/update') return
    const tab = getTab(state.data, action.id)
    if (!tab || !hooks.isRecording(action.id)) return
    const { url, title, favicon } = action.patch
    try {
      const profileId = hooks.profileFor(action.id)
      if (url !== undefined && lastUrl.get(action.id) !== url) {
        lastUrl.set(action.id, url)
        history.visit(profileId, url)
        const inPage = !('favicon' in action.patch)
        if (inPage && tab.title) history.setTitle(profileId, url, tab.title)
        if (inPage && tab.favicon) history.setFavicon(profileId, url, tab.favicon)
      }
      if (title) history.setTitle(profileId, tab.url, title)
      if (favicon) history.setFavicon(profileId, tab.url, favicon)
    } catch (error) {
      console.warn('[history] failed to record visit', error)
    }
    if (lastUrl.size > 2000) {
      for (const id of lastUrl.keys()) if (!getTab(state.data, id)) lastUrl.delete(id)
    }
  })
}
