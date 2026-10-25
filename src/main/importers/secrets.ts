import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ImportedLogin } from '../passwords'
import {
  cookieKey,
  decryptCookie,
  importCookies,
  readChromiumCookies,
  safeStoragePassword,
  type CookieJar,
} from './cookies'

const MAX_LOGINS = 10_000

export interface SecretSource {
  dir: string
  jar: () => CookieJar
  saveLogins: (logins: readonly ImportedLogin[]) => Promise<number>
}

export interface SecretImport {
  cookies: number
  logins: number
  skipped: boolean
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

export async function readChromiumLogins(file: string, key: Buffer): Promise<ImportedLogin[]> {
  const temp = await mkdtemp(join(tmpdir(), 'ante-logins-'))
  try {
    const copy = join(temp, 'Login Data')
    await copyFile(file, copy)
    const db = new DatabaseSync(copy, { readOnly: true })
    try {
      const rows = db
        .prepare(
          'select origin_url, username_value, password_value from logins where blacklisted_by_user = 0 limit ?',
        )
        .all(MAX_LOGINS)
      return rows.flatMap((row): ImportedLogin[] => {
        const encrypted = row.password_value
        if (!(encrypted instanceof Uint8Array) || encrypted.length === 0) return []
        const password = decryptCookie(encrypted, key, false)
        if (!password) return []
        return [{ url: text(row.origin_url), username: text(row.username_value), password }]
      })
    } finally {
      db.close()
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

const hasFile = (dir: string, name: string) => existsSync(join(dir, name))

export async function importBrowserSecrets(
  service: string,
  sources: readonly SecretSource[],
): Promise<SecretImport> {
  const present = sources.filter(
    (source) => hasFile(source.dir, 'Cookies') || hasFile(source.dir, 'Login Data'),
  )
  if (present.length === 0) return { cookies: 0, logins: 0, skipped: false }
  const password = await safeStoragePassword(service)
  if (!password) return { cookies: 0, logins: 0, skipped: true }
  const key = cookieKey(password)
  const result: SecretImport = { cookies: 0, logins: 0, skipped: false }
  for (const source of present) {
    try {
      if (hasFile(source.dir, 'Cookies'))
        result.cookies += await importCookies(
          source.jar(),
          await readChromiumCookies(join(source.dir, 'Cookies'), key),
        )
    } catch (error) {
      console.error('[import] could not read cookies', source.dir, error)
    }
    try {
      if (hasFile(source.dir, 'Login Data'))
        result.logins += await source.saveLogins(
          await readChromiumLogins(join(source.dir, 'Login Data'), key),
        )
    } catch (error) {
      console.error('[import] could not read passwords', source.dir, error)
    }
  }
  return result
}

export function describeSecrets(secrets: SecretImport): { parts: string[]; note: string } {
  const parts = [
    secrets.logins > 0
      ? `${secrets.logins} ${secrets.logins === 1 ? 'password' : 'passwords'}`
      : null,
    secrets.cookies > 0 ? 'your sign-ins' : null,
  ].filter((part) => part !== null)
  return { parts, note: secrets.skipped ? '. Passwords and sign-ins were skipped' : '' }
}
