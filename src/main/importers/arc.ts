import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { arcImportToBundle, parseArcSidebar } from '@shared/importers/arc'
import type { Id } from '@shared/schema'
import type { Store } from '../store'

const SIDEBAR_FILE = 'StorableSidebar.json'

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
  { ok: true; spaceIds: Id[]; tabCount: number } | { ok: false; message: string }

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function describeArcImport(result: ArcImportResult): string {
  if (!result.ok) return result.message
  if (result.spaceIds.length === 0 && result.tabCount === 0) return 'Nothing new to import from Arc'
  return `Imported ${plural(result.spaceIds.length, 'space')} and ${plural(result.tabCount, 'tab')} from Arc`
}

export function importFromArc(store: Store): ArcImportResult {
  const file = findArcSidebar()
  if (!file) return { ok: false, message: 'Could not find Arc on this computer' }
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error('[arc-import] unreadable sidebar file', error)
    return { ok: false, message: 'Could not read Arc data' }
  }
  try {
    const bundle = arcImportToBundle(parseArcSidebar(json), { newId: randomUUID, now: Date.now() })
    store.dispatch({ type: 'data/import', bundle })
    const data = store.state.data
    return {
      ok: true,
      spaceIds: bundle.spaces.map((space) => space.id).filter((id) => data.spaces[id]),
      tabCount: Object.values(bundle.items).filter(
        (item) => item.kind === 'tab' && data.items[item.id],
      ).length,
    }
  } catch (error) {
    console.error('[arc-import] import failed', error)
    return { ok: false, message: 'Could not import Arc data' }
  }
}

export function detectArcImport(store: Store): void {
  store.dispatch({ type: 'runtime/arcImport', available: findArcSidebar() !== null })
}
