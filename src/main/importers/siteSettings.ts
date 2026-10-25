import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseChromiumSiteSettings } from '@shared/importers/chromiumPrefs'
import type { Id } from '@shared/schema'
import type { Store } from '../store'

async function readPreferences(dir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, 'Preferences'), 'utf8'))
  } catch {
    return null
  }
}

export async function importSiteSettings(store: Store, profileId: Id, dir: string): Promise<void> {
  const { permissions, zoom } = parseChromiumSiteSettings(await readPreferences(dir))
  if (Object.keys(permissions).length === 0 && Object.keys(zoom).length === 0) return
  store.dispatch({ type: 'profile/importSiteSettings', profileId, permissions, zoom })
}
