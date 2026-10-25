import { execFile } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { CookiesSetDetails } from 'electron'

export type SameSite = NonNullable<CookiesSetDetails['sameSite']>

export interface ChromiumCookie {
  host: string
  name: string
  value: string
  path: string
  expires: number
  secure: boolean
  httpOnly: boolean
  sameSite: SameSite
}

export interface CookieJar {
  cookies: {
    set: (details: CookiesSetDetails) => Promise<void>
    flushStore: () => Promise<void>
  }
}

const CHROME_EPOCH_OFFSET_S = 11_644_473_600
const HASH_PREFIX_VERSION = 24
const MAX_COOKIES = 20_000
const SESSION_COOKIE_DAYS = 30

const sameSites: Record<number, SameSite> = {
  0: 'no_restriction',
  1: 'lax',
  2: 'strict',
}

export function safeStoragePassword(service: string): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', service],
      { timeout: 60_000 },
      (error, stdout) => {
        const password = stdout.trim()
        resolve(error || !password ? null : password)
      },
    )
  })
}

export function cookieKey(password: string): Buffer {
  return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
}

export function decryptCookie(
  encrypted: Uint8Array,
  key: Buffer,
  hashPrefix: boolean,
): string | null {
  const data = Buffer.from(encrypted)
  if (data.subarray(0, 3).toString('latin1') !== 'v10') return null
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
    const plain = Buffer.concat([decipher.update(data.subarray(3)), decipher.final()])
    const value = hashPrefix ? plain.subarray(32) : plain
    return value.toString('utf8')
  } catch {
    return null
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const flag = (value: unknown) => value === 1 || value === 1n

function columnsOf(db: DatabaseSync): Set<string> {
  const rows = db.prepare('pragma table_info(cookies)').all()
  return new Set(rows.map((row) => text(row.name)))
}

function versionOf(db: DatabaseSync): number {
  try {
    const row = db.prepare("select value from meta where key = 'version'").get()
    return Number(row?.value ?? 0)
  } catch {
    return 0
  }
}

export async function readChromiumCookies(
  file: string,
  key: Buffer,
  now = Date.now(),
): Promise<ChromiumCookie[]> {
  const temp = await mkdtemp(join(tmpdir(), 'ante-cookies-'))
  try {
    const copy = join(temp, 'Cookies')
    await copyFile(file, copy)
    const db = new DatabaseSync(copy, { readOnly: true })
    try {
      const hashPrefix = versionOf(db) >= HASH_PREFIX_VERSION
      const columns = columnsOf(db)
      const nowSeconds = now / 1000
      const filters = [
        `(has_expires = 0 or expires_utc / 1000000 - ${CHROME_EPOCH_OFFSET_S} > ?)`,
        ...(columns.has('top_frame_site_key') ? ["top_frame_site_key = ''"] : []),
      ]
      const order = columns.has('last_access_utc') ? 'order by last_access_utc desc' : ''
      const rows = db
        .prepare(
          `select host_key, name, value, encrypted_value, path, is_secure, is_httponly, samesite, has_expires, expires_utc / 1000000 - ${CHROME_EPOCH_OFFSET_S} as expires from cookies where ${filters.join(' and ')} ${order} limit ?`,
        )
        .all(Math.floor(nowSeconds), MAX_COOKIES)
      return rows.flatMap((row): ChromiumCookie[] => {
        const host = text(row.host_key)
        const name = text(row.name)
        if (!host) return []
        const expires = flag(row.has_expires)
          ? Number(row.expires)
          : Math.floor(nowSeconds + SESSION_COOKIE_DAYS * 86_400)
        if (expires <= nowSeconds) return []
        const plain = text(row.value)
        const encrypted = row.encrypted_value
        const value =
          plain ||
          (encrypted instanceof Uint8Array && encrypted.length > 0
            ? decryptCookie(encrypted, key, hashPrefix)
            : '')
        if (value === null) return []
        return [
          {
            host,
            name,
            value,
            path: text(row.path) || '/',
            expires,
            secure: flag(row.is_secure),
            httpOnly: flag(row.is_httponly),
            sameSite: sameSites[Number(row.samesite)] ?? 'unspecified',
          },
        ]
      })
    } finally {
      db.close()
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

export function cookieDetails(cookie: ChromiumCookie): CookiesSetDetails {
  const domainCookie = cookie.host.startsWith('.')
  const host = domainCookie ? cookie.host.slice(1) : cookie.host
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    ...(domainCookie ? { domain: cookie.host } : {}),
    expirationDate: cookie.expires,
  }
}

export async function importCookies(
  jar: CookieJar,
  cookies: readonly ChromiumCookie[],
): Promise<number> {
  let count = 0
  for (const cookie of cookies) {
    try {
      await jar.cookies.set(cookieDetails(cookie))
      count += 1
    } catch {
      continue
    }
  }
  await jar.cookies.flushStore()
  return count
}

export interface CookieSource {
  dir: string
  jar: () => CookieJar
}

export interface CookieImport {
  count: number
  skipped: boolean
}

export async function importBrowserCookies(
  service: string,
  sources: readonly CookieSource[],
): Promise<CookieImport> {
  const files = sources.filter((source) => existsSync(join(source.dir, 'Cookies')))
  if (files.length === 0) return { count: 0, skipped: false }
  const password = await safeStoragePassword(service)
  if (!password) return { count: 0, skipped: true }
  const key = cookieKey(password)
  let count = 0
  for (const source of files) {
    try {
      count += await importCookies(
        source.jar(),
        await readChromiumCookies(join(source.dir, 'Cookies'), key),
      )
    } catch (error) {
      console.error('[import] could not read cookies', source.dir, error)
    }
  }
  return { count, skipped: false }
}
