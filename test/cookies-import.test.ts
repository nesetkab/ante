import { createCipheriv, createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cookieDetails,
  cookieKey,
  decryptCookie,
  importCookies,
  readChromiumCookies,
} from '../src/main/importers/cookies'

const key = cookieKey('peanut butter')
const CHROME_EPOCH_OFFSET_S = 11_644_473_600
const chromeTime = (unixSeconds: number) =>
  BigInt(Math.floor(unixSeconds) + CHROME_EPOCH_OFFSET_S) * 1_000_000n

const encrypt = (value: string, host: string | null) => {
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  const prefix = host ? createHash('sha256').update(host).digest() : Buffer.alloc(0)
  const body = Buffer.concat([prefix, Buffer.from(value)])
  return Buffer.concat([Buffer.from('v10'), cipher.update(body), cipher.final()])
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function cookieDb(version: number) {
  const dir = mkdtempSync(join(tmpdir(), 'ante-cookie-test-'))
  dirs.push(dir)
  const file = join(dir, 'Cookies')
  const db = new DatabaseSync(file)
  db.exec(`create table meta (key text, value text);
    create table cookies (host_key text, top_frame_site_key text, name text, value text,
      encrypted_value blob, path text, expires_utc integer, is_secure integer,
      is_httponly integer, has_expires integer, samesite integer)`)
  db.prepare('insert into meta values (?, ?)').run('version', String(version))
  const insert = db.prepare('insert into cookies values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const future = chromeTime(Date.now() / 1000 + 86_400)
  const hashed = version >= 24
  insert.run(
    '.github.com',
    '',
    'user_session',
    '',
    encrypt('abc', hashed ? '.github.com' : null),
    '/',
    future,
    1,
    1,
    1,
    1,
  )
  insert.run('example.com', '', 'plain', 'hello', Buffer.alloc(0), '/app', 0n, 0, 0, 0, -1)
  insert.run('old.com', '', 'gone', 'x', Buffer.alloc(0), '/', chromeTime(1000), 0, 0, 1, 0)
  insert.run('embed.com', 'https://top.com', 'chips', 'x', Buffer.alloc(0), '/', future, 1, 0, 1, 0)
  insert.run('bad.com', '', 'broken', '', Buffer.from('v10garbage'), '/', future, 1, 0, 1, 0)
  db.close()
  return file
}

describe('chromium cookie import', () => {
  it('decrypts values, keeps session cookies and drops expired, partitioned and broken ones', async () => {
    const cookies = await readChromiumCookies(cookieDb(24), key)
    expect(cookies.map((cookie) => [cookie.host, cookie.name, cookie.value])).toEqual([
      ['.github.com', 'user_session', 'abc'],
      ['example.com', 'plain', 'hello'],
    ])
    expect(cookies[0]).toMatchObject({ secure: true, httpOnly: true, sameSite: 'lax' })
    expect(cookies[1]).toMatchObject({ path: '/app', sameSite: 'unspecified' })
    expect(cookies[1]?.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86_400)
  })

  it('reads older databases without the host hash', async () => {
    const cookies = await readChromiumCookies(cookieDb(23), key)
    expect(cookies[0]?.value).toBe('abc')
  })

  it('refuses values it cannot decrypt', () => {
    expect(decryptCookie(Buffer.from('v11abc'), key, false)).toBeNull()
    expect(decryptCookie(encrypt('x', null), cookieKey('wrong'), false)).toBeNull()
  })

  it('turns cookies into Electron cookie details', () => {
    expect(
      cookieDetails({
        host: '.github.com',
        name: 'a',
        value: 'b',
        path: '/',
        expires: 2_000_000_000,
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
      }),
    ).toEqual({
      url: 'https://github.com/',
      name: 'a',
      value: 'b',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
      domain: '.github.com',
      expirationDate: 2_000_000_000,
    })
    expect(
      cookieDetails({
        host: 'example.com',
        name: 'a',
        value: 'b',
        path: '/x',
        expires: null,
        secure: false,
        httpOnly: false,
        sameSite: 'unspecified',
      }),
    ).not.toHaveProperty('domain')
  })

  it('counts only cookies the session accepted', async () => {
    const set: string[] = []
    const jar = {
      cookies: {
        set: (details: { name?: string }) => {
          if (details.name === 'bad') return Promise.reject(new Error('rejected'))
          set.push(details.name ?? '')
          return Promise.resolve()
        },
        flushStore: () => Promise.resolve(),
      },
    }
    const base = {
      host: 'a.com',
      value: 'v',
      path: '/',
      expires: null,
      secure: false,
      httpOnly: false,
      sameSite: 'lax' as const,
    }
    const count = await importCookies(jar, [
      { ...base, name: 'good' },
      { ...base, name: 'bad' },
    ])
    expect(count).toBe(1)
    expect(set).toEqual(['good'])
  })
})
