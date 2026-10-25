import { cp, readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'

const EXTENSION_ID = /^[a-p]{32}$/
const WEB_STORE_LOCATION = 1

const settingsSchema = z.object({
  extensions: z.object({
    settings: z.record(
      z.string(),
      z
        .object({
          location: z.number().optional(),
          from_webstore: z.boolean().optional(),
          disable_reasons: z.unknown().optional(),
          state: z.number().optional(),
        })
        .catch({}),
    ),
  }),
})

type ExtensionSettings = z.infer<typeof settingsSchema>['extensions']['settings']

const isDisabled = (reasons: unknown, state: number | undefined) =>
  state === 0 ||
  (Array.isArray(reasons) && reasons.length > 0) ||
  (typeof reasons === 'number' && reasons !== 0)

export function webStoreExtensions(
  installed: readonly string[],
  settings: ExtensionSettings,
): string[] {
  return installed.filter((id) => {
    if (!EXTENSION_ID.test(id)) return false
    const entry = settings[id]
    if (!entry) return true
    if (entry.location !== undefined && entry.location !== WEB_STORE_LOCATION) return false
    if (entry.from_webstore === false) return false
    return !isDisabled(entry.disable_reasons, entry.state)
  })
}

async function readSettings(file: string): Promise<ExtensionSettings> {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
    return parsed.success ? parsed.data.extensions.settings : {}
  } catch {
    return {}
  }
}

export async function profileExtensions(profileDir: string): Promise<string[]> {
  let installed: string[]
  try {
    installed = await readdir(join(profileDir, 'Extensions'))
  } catch {
    return []
  }
  const settings = {
    ...(await readSettings(join(profileDir, 'Preferences'))),
    ...(await readSettings(join(profileDir, 'Secure Preferences'))),
  }
  return webStoreExtensions(installed, settings)
}

const dataFolders = (id: string) => [
  join('Local Extension Settings', id),
  join('IndexedDB', `chrome-extension_${id}_0.indexeddb.leveldb`),
]

export async function copyExtensionData(
  id: string,
  profileDir: string,
  storagePath: string,
): Promise<void> {
  for (const folder of dataFolders(id)) {
    const source = join(profileDir, folder)
    const target = join(storagePath, folder)
    if (!existsSync(source) || existsSync(target)) continue
    await cp(source, target, {
      recursive: true,
      filter: (path) => basename(path) !== 'LOCK',
    })
  }
}
