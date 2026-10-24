import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { arcImportToBundle } from '@shared/importers/arc'
import {
  bookmarksToImport,
  browserIds,
  browserNames,
  CHROME_EPOCH_OFFSET_MS,
  parseChromeBookmarks,
  type BrowserId,
} from '@shared/importers/chrome'
import type { Id } from '@shared/schema'
import { DEFAULT_PROFILE_ID } from '@shared/state/initial'
import type { HistoryStore, ImportedVisit } from '../history'
import type { Store } from '../store'

const MAX_VISITS = 20_000

const folders: Record<BrowserId, { mac: string; windows: string; linux: string }> = {
  chrome: { mac: 'Google/Chrome', windows: 'Google/Chrome/User Data', linux: 'google-chrome' },
  brave: {
    mac: 'BraveSoftware/Brave-Browser',
    windows: 'BraveSoftware/Brave-Browser/User Data',
    linux: 'BraveSoftware/Brave-Browser',
  },
  edge: { mac: 'Microsoft Edge', windows: 'Microsoft/Edge/User Data', linux: 'microsoft-edge' },
  chromium: { mac: 'Chromium', windows: 'Chromium/User Data', linux: 'chromium' },
}

function profileDir(browser: BrowserId): string | null {
  const folder = folders[browser]
  switch (process.platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', folder.mac, 'Default')
    case 'win32':
      return join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        folder.windows,
        'Default',
      )
    case 'linux':
      return join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
        folder.linux,
        'Default',
      )
    default:
      return null
  }
}

export function detectBrowsers(): BrowserId[] {
  return browserIds.filter((browser) => {
    const dir = profileDir(browser)
    return dir !== null && (existsSync(join(dir, 'Bookmarks')) || existsSync(join(dir, 'History')))
  })
}

const visitRow = (row: Record<string, unknown>): ImportedVisit | null => {
  const { url, title, visit_count: visitCount, last_visit: lastVisit } = row
  if (typeof url !== 'string' || typeof lastVisit !== 'number') return null
  return {
    url,
    title: typeof title === 'string' ? title : '',
    visitCount: typeof visitCount === 'number' ? visitCount : 1,
    lastVisit: Math.max(0, lastVisit),
  }
}

export async function readVisits(file: string): Promise<ImportedVisit[]> {
  const temp = await mkdtemp(join(tmpdir(), 'ante-import-'))
  try {
    const copy = join(temp, 'History')
    await copyFile(file, copy)
    const db = new DatabaseSync(copy, { readOnly: true })
    try {
      const rows = db
        .prepare(
          `select url, title, visit_count, last_visit_time / 1000 - ${CHROME_EPOCH_OFFSET_MS} as last_visit from urls where hidden = 0 order by last_visit_time desc limit ?`,
        )
        .all(MAX_VISITS)
      return rows.flatMap((row) => visitRow(row) ?? [])
    } finally {
      db.close()
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

export interface BrowserImportResult {
  message: string
  spaceId: Id | null
}

export async function importFromBrowser(
  store: Store,
  history: HistoryStore,
  browser: BrowserId,
): Promise<BrowserImportResult> {
  const name = browserNames[browser]
  const dir = profileDir(browser)
  if (!dir) return { message: `Could not find ${name}`, spaceId: null }
  let tabCount = 0
  let visitCount = 0
  let spaceId: Id | null = null
  try {
    const bookmarksFile = join(dir, 'Bookmarks')
    if (existsSync(bookmarksFile)) {
      const raw: unknown = JSON.parse(await readFile(bookmarksFile, 'utf8'))
      const bundle = arcImportToBundle(bookmarksToImport(parseChromeBookmarks(raw), browser), {
        newId: randomUUID,
        now: Date.now(),
      })
      store.dispatch({ type: 'data/import', bundle })
      tabCount = Object.values(bundle.items).filter((item) => item.kind === 'tab').length
      spaceId = bundle.spaces.find((space) => store.state.data.spaces[space.id])?.id ?? null
    }
  } catch (error) {
    console.error('[import] could not read bookmarks', browser, error)
  }
  let historyBusy = false
  const historyFile = join(dir, 'History')
  if (existsSync(historyFile)) {
    try {
      visitCount = history.importVisits(DEFAULT_PROFILE_ID, await readVisits(historyFile))
    } catch (error) {
      console.error('[import] could not read history', browser, error)
      historyBusy = true
    }
  }
  if (historyBusy && tabCount === 0)
    return { message: `Quit ${name} and try again to import its history`, spaceId }
  if (tabCount === 0 && visitCount === 0)
    return { message: `Nothing to import from ${name}`, spaceId: null }
  const parts = [
    tabCount > 0 ? `${tabCount} bookmark${tabCount === 1 ? '' : 's'}` : null,
    visitCount > 0 ? `${visitCount} history entr${visitCount === 1 ? 'y' : 'ies'}` : null,
  ].filter((part) => part !== null)
  return { message: `Imported ${parts.join(' and ')} from ${name}`, spaceId }
}
