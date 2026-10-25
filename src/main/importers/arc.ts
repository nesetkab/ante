import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  arcImportToBundle,
  parseArcArchive,
  parseArcProfileNames,
  parseArcRouting,
  parseArcSidebar,
} from '@shared/importers/arc'
import { mergeArcShortcuts, parseArcKeyBindings } from '@shared/importers/arcKeys'
import type { ShortcutOverrides } from '@shared/keys'
import type { Id } from '@shared/schema'
import { DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { isPrivateProfile } from '@shared/state/private'
import type { HistoryStore } from '../history'
import type { Store } from '../store'
import { readVisits } from './chrome'
import { importBrowserCookies, type CookieImport, type CookieJar } from './cookies'

const SIDEBAR_FILE = 'StorableSidebar.json'
const ARCHIVE_FILE = 'StorableArchiveItems.json'
const ROUTING_FILE = 'StorableLinkRouting.json'
const KEYS_FILE = 'StorableKeyBindings.json'
const ARC_SAFE_STORAGE = 'Arc Safe Storage'

function windowsCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const packages = join(localAppData, 'Packages')
  let entries: string[]
  try {
    entries = readdirSync(packages)
  } catch {
    return []
  }
  return entries
    .filter((name) => name.startsWith('TheBrowserCompany.Arc'))
    .map((name) => join(packages, name, 'LocalCache', 'Local', 'Arc', SIDEBAR_FILE))
}

export function arcSidebarCandidates(): string[] {
  const override = process.env.ANTE_ARC_SIDEBAR
  if (override) return [override]
  switch (process.platform) {
    case 'darwin':
      return [join(homedir(), 'Library', 'Application Support', 'Arc', SIDEBAR_FILE)]
    case 'win32':
      return windowsCandidates()
    default:
      return []
  }
}

export function findArcSidebar(): string | null {
  return arcSidebarCandidates().find((file) => existsSync(file)) ?? null
}

export type ArcImportResult =
  | {
      ok: true
      spaceIds: Id[]
      tabCount: number
      visitCount: number
      cookies: CookieImport
      extensionCount: number
    }
  | { ok: false; message: string }

const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`

export function describeArcImport(result: ArcImportResult): string {
  if (!result.ok) return result.message
  const parts = [
    result.spaceIds.length > 0 ? plural(result.spaceIds.length, 'space') : null,
    result.tabCount > 0 ? plural(result.tabCount, 'tab') : null,
    result.visitCount > 0 ? plural(result.visitCount, 'history entry', 'history entries') : null,
    result.extensionCount > 0 ? plural(result.extensionCount, 'extension') : null,
    result.cookies.count > 0 ? 'your sign-ins' : null,
  ].filter((part) => part !== null)
  const skipped = result.cookies.skipped ? '. Sign-ins were skipped' : ''
  if (parts.length === 0) return `Nothing new to import from Arc${skipped}`
  return `Imported ${parts.join(', ')} from Arc${skipped}`
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

interface ProfileDir {
  dir: string
  profileId: Id
}

function profileDirs(
  userData: string,
  profileNames: Record<string, string>,
  store: Store,
): ProfileDir[] {
  const profiles = Object.values(store.state.data.profiles).filter(
    (profile) => !isPrivateProfile(profile.id),
  )
  const byName = (name: string) =>
    profiles.find((profile) => profile.name.trim().toLowerCase() === name.trim().toLowerCase())
  const dirs: ProfileDir[] = [{ dir: join(userData, 'Default'), profileId: DEFAULT_PROFILE_ID }]
  for (const [dir, name] of Object.entries(profileNames)) {
    const profile = byName(name) ?? byName(dir)
    if (profile) dirs.push({ dir: join(userData, dir), profileId: profile.id })
  }
  return dirs
}

async function importHistory(history: HistoryStore, dirs: readonly ProfileDir[]): Promise<number> {
  let count = 0
  for (const { dir, profileId } of dirs) {
    const file = join(dir, 'History')
    if (!existsSync(file)) continue
    try {
      count += history.importVisits(profileId, await readVisits(file))
    } catch (error) {
      console.error('[arc-import] could not read history', dir, error)
    }
  }
  return count
}

async function importedShortcuts(root: string, store: Store): Promise<ShortcutOverrides | null> {
  if (process.platform !== 'darwin') return null
  const imported = parseArcKeyBindings(await readJson(join(root, KEYS_FILE)))
  if (Object.keys(imported).length === 0) return null
  return mergeArcShortcuts(store.state.data.settings.shortcuts, imported, 'darwin')
}

export interface ArcImportDeps {
  store: Store
  history: HistoryStore
  jarFor: (profileId: Id) => CookieJar
  importExtensions: (profileId: Id, profileDir: string) => Promise<number>
}

export async function importFromArc({
  store,
  history,
  jarFor,
  importExtensions,
}: ArcImportDeps): Promise<ArcImportResult> {
  const file = findArcSidebar()
  if (!file) return { ok: false, message: 'Could not find Arc on this computer' }
  const root = dirname(file)
  const userData = join(root, 'User Data')
  const sidebar = await readJson(file)
  if (sidebar === null) return { ok: false, message: 'Could not read Arc data' }
  try {
    const profileNames = parseArcProfileNames(await readJson(join(userData, 'Local State')))
    const arc = {
      ...parseArcSidebar(sidebar),
      archive: parseArcArchive(await readJson(join(root, ARCHIVE_FILE))),
      routing: parseArcRouting(await readJson(join(root, ROUTING_FILE))),
      profileNames,
    }
    const bundle = {
      ...arcImportToBundle(arc, { newId: randomUUID, now: Date.now() }),
      shortcuts: await importedShortcuts(root, store),
    }
    store.dispatch({ type: 'data/import', bundle })
    const data = store.state.data
    const dirs = profileDirs(userData, profileNames, store)
    const visitCount = await importHistory(history, dirs)
    const cookies = await importBrowserCookies(
      ARC_SAFE_STORAGE,
      dirs.map(({ dir, profileId }) => ({ dir, jar: () => jarFor(profileId) })),
    )
    let extensionCount = 0
    for (const { dir, profileId } of dirs) extensionCount += await importExtensions(profileId, dir)
    return {
      cookies,
      extensionCount,
      ok: true,
      spaceIds: bundle.spaces.map((space) => space.id).filter((id) => data.spaces[id]),
      tabCount: Object.values(bundle.items).filter(
        (item) => item.kind === 'tab' && data.items[item.id],
      ).length,
      visitCount,
    }
  } catch (error) {
    console.error('[arc-import] import failed', error)
    return { ok: false, message: 'Could not import Arc data' }
  }
}

export function detectArcImport(store: Store): void {
  store.dispatch({ type: 'runtime/arcImport', available: findArcSidebar() !== null })
}
