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
import type { Id } from '@shared/schema'
import { DEFAULT_PROFILE_ID } from '@shared/state/initial'
import type { HistoryStore } from '../history'
import type { Store } from '../store'
import { readVisits } from './chrome'

const SIDEBAR_FILE = 'StorableSidebar.json'
const ARCHIVE_FILE = 'StorableArchiveItems.json'
const ROUTING_FILE = 'StorableLinkRouting.json'

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
  | { ok: true; spaceIds: Id[]; tabCount: number; visitCount: number }
  | { ok: false; message: string }

const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`

export function describeArcImport(result: ArcImportResult): string {
  if (!result.ok) return result.message
  const parts = [
    result.spaceIds.length > 0 ? plural(result.spaceIds.length, 'space') : null,
    result.tabCount > 0 ? plural(result.tabCount, 'tab') : null,
    result.visitCount > 0 ? plural(result.visitCount, 'history entry', 'history entries') : null,
  ].filter((part) => part !== null)
  if (parts.length === 0) return 'Nothing new to import from Arc'
  return `Imported ${parts.join(', ')} from Arc`
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function profileDirs(userData: string, profileNames: Record<string, string>, store: Store) {
  const profiles = Object.values(store.state.data.profiles)
  const byName = (name: string) =>
    profiles.find((profile) => profile.name.trim().toLowerCase() === name.trim().toLowerCase())
  const dirs: { dir: string; profileId: Id }[] = [
    { dir: join(userData, 'Default'), profileId: DEFAULT_PROFILE_ID },
  ]
  for (const [dir, name] of Object.entries(profileNames)) {
    const profile = byName(name) ?? byName(dir)
    if (profile) dirs.push({ dir: join(userData, dir), profileId: profile.id })
  }
  return dirs
}

async function importHistory(
  history: HistoryStore,
  userData: string,
  profileNames: Record<string, string>,
  store: Store,
): Promise<number> {
  let count = 0
  for (const { dir, profileId } of profileDirs(userData, profileNames, store)) {
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

export async function importFromArc(store: Store, history: HistoryStore): Promise<ArcImportResult> {
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
    const bundle = arcImportToBundle(arc, { newId: randomUUID, now: Date.now() })
    store.dispatch({ type: 'data/import', bundle })
    const data = store.state.data
    const visitCount = await importHistory(history, userData, profileNames, store)
    return {
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
