import { createCipheriv } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { pickPassword } from '@shared/autofill'
import { loginOrigin, sameLoginSite, siteName } from '@shared/passwords'
import { autofillRect } from '@shared/popover'
import { cookieKey } from '../src/main/importers/cookies'
import { readChromiumLogins } from '../src/main/importers/secrets'
import { PasswordVault, type Cipher } from '../src/main/passwords'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ante-passwords-test-'))
  dirs.push(dir)
  return dir
}

const cipher = (available = true): Cipher => ({
  available: () => available,
  encrypt: (plain) => Promise.resolve(Buffer.from(`sealed:${plain}`).toString('base64')),
  decrypt: (secret) => {
    const plain = Buffer.from(secret, 'base64').toString()
    return Promise.resolve(plain.startsWith('sealed:') ? plain.slice(7) : null)
  },
})

const vaultIn = (dir: string, available = true) => {
  let changes = 0
  const vault = new PasswordVault(join(dir, 'passwords.json'), cipher(available), () => {
    changes += 1
  })
  return { vault, changes: () => changes }
}

describe('login helpers', () => {
  it('keeps web origins only', () => {
    expect(loginOrigin('https://accounts.example.com/login?x=1')).toBe(
      'https://accounts.example.com',
    )
    expect(loginOrigin('http://127.0.0.1:5173/sign-in')).toBe('http://127.0.0.1:5173')
    expect(loginOrigin('file:///tmp/a.html')).toBeNull()
    expect(loginOrigin('data:text/html,x')).toBeNull()
  })

  it('treats www and the bare domain as the same site', () => {
    expect(sameLoginSite('https://www.github.com', 'https://github.com')).toBe(true)
    expect(sameLoginSite('https://gist.github.com', 'https://github.com')).toBe(false)
    expect(siteName('https://www.github.com')).toBe('github.com')
  })

  it('picks the right password from sign in and change password forms', () => {
    expect(pickPassword(['hunter2'])).toBe('hunter2')
    expect(pickPassword(['', ''])).toBeNull()
    expect(pickPassword(['new', 'new'])).toBe('new')
    expect(pickPassword(['old', 'new', 'new'])).toBe('new')
    expect(pickPassword(['old', 'new', 'typo'])).toBe('new')
  })
})

describe('PasswordVault', () => {
  it('saves encrypted, offers choices for the site and fills only there', async () => {
    const dir = tempDir()
    const { vault, changes } = vaultIn(dir)
    expect(await vault.verdict('default', 'https://github.com', 'me', 'pw1')).toBe('new')
    await vault.save('default', 'https://github.com', 'me', 'pw1')
    expect(changes()).toBe(1)
    expect(readFileSync(join(dir, 'passwords.json'), 'utf8')).not.toContain('pw1')
    const [choice] = vault.choices('default', 'https://www.github.com')
    expect(choice?.username).toBe('me')
    expect(await vault.secret('default', choice?.id ?? '', 'https://github.com')).toBe('pw1')
    expect(await vault.secret('default', choice?.id ?? '', 'https://evil.example')).toBeNull()
    expect(vault.choices('other', 'https://github.com')).toEqual([])
  })

  it('knows when a password is new, changed or already saved', async () => {
    const { vault } = vaultIn(tempDir())
    await vault.save('default', 'https://a.test', 'me', 'one')
    expect(await vault.verdict('default', 'https://a.test', 'me', 'one')).toBe('known')
    expect(await vault.verdict('default', 'https://a.test', 'me', 'two')).toBe('update')
    await vault.save('default', 'https://a.test', 'me', 'two')
    expect(vault.summaries()).toHaveLength(1)
    expect(await vault.secret('default', vault.summaries()[0]?.id ?? '', null)).toBe('two')
  })

  it('never saves for private profiles, blocked sites or without secure storage', async () => {
    const { vault } = vaultIn(tempDir())
    expect(await vault.verdict('private-1', 'https://a.test', 'me', 'pw')).toBe('blocked')
    await vault.save('private-1', 'https://a.test', 'me', 'pw')
    vault.never('default', 'https://b.test')
    expect(await vault.verdict('default', 'https://b.test', 'me', 'pw')).toBe('blocked')
    expect(vault.summaries()).toEqual([])
    const locked = vaultIn(tempDir(), false).vault
    await locked.save('default', 'https://a.test', 'me', 'pw')
    expect(locked.summaries()).toEqual([])
  })

  it('survives a restart and skips duplicates when importing', async () => {
    const dir = tempDir()
    const first = vaultIn(dir).vault
    expect(
      await first.importLogins('default', [
        { url: 'https://a.test/login', username: 'me', password: 'pw' },
        { url: 'https://a.test/other', username: 'me', password: 'pw' },
        { url: 'ftp://odd.test/', username: 'me', password: 'pw' },
        { url: 'https://long.test/', username: 'x'.repeat(5000), password: 'pw' },
        { url: 'https://b.test/', username: 'you', password: '' },
      ]),
    ).toBe(1)
    const second = vaultIn(dir).vault
    expect(second.summaries().map((login) => login.origin)).toEqual(['https://a.test'])
    const id = second.summaries()[0]?.id ?? ''
    second.remove('default', id)
    expect(vaultIn(dir).vault.summaries()).toEqual([])
  })
})

describe('vault safety', () => {
  it('keeps good logins when one stored entry is bad', () => {
    const dir = tempDir()
    const good = {
      id: 'a',
      origin: 'https://a.test',
      username: 'me',
      secret: Buffer.from('sealed:pw').toString('base64'),
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
    }
    writeFileSync(
      join(dir, 'passwords.json'),
      JSON.stringify({
        logins: { default: [good, { ...good, id: 'b', username: 'x'.repeat(2000) }] },
      }),
    )
    expect(
      vaultIn(dir)
        .vault.summaries()
        .map((login) => login.id),
    ).toEqual(['a'])
  })

  it('sets an unreadable vault aside instead of overwriting it', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'passwords.json'), '{ half written')
    const { vault } = vaultIn(dir)
    await vault.save('default', 'https://a.test', 'me', 'pw')
    const files = readdirSync(dir)
    expect(files.some((name) => name.startsWith('passwords.json.unreadable-'))).toBe(true)
    expect(vault.summaries()).toHaveLength(1)
  })

  it('treats never for www and the bare domain alike', async () => {
    const { vault } = vaultIn(tempDir())
    vault.never('default', 'https://www.b.test')
    expect(await vault.verdict('default', 'https://b.test', 'me', 'pw')).toBe('blocked')
  })
})

describe('chromium password import', () => {
  it('reads saved logins and skips sites the user blocked', async () => {
    const key = cookieKey('peanuts')
    const seal = (value: string) => {
      const aes = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
      return Buffer.concat([Buffer.from('v10'), aes.update(value), aes.final()])
    }
    const file = join(tempDir(), 'Login Data')
    const db = new DatabaseSync(file)
    db.exec(
      'create table logins (origin_url text, username_value text, password_value blob, blacklisted_by_user integer)',
    )
    const insert = db.prepare('insert into logins values (?, ?, ?, ?)')
    insert.run('https://a.test/login', 'me', seal('secret'), 0)
    insert.run('https://blocked.test/', '', Buffer.alloc(0), 1)
    insert.run('https://broken.test/', 'x', Buffer.from('v10junk'), 0)
    db.close()
    expect(await readChromiumLogins(file, key)).toEqual([
      { url: 'https://a.test/login', username: 'me', password: 'secret' },
    ])
  })
})

describe('autofill dropdown placement', () => {
  const pane = { x: 300, y: 50, width: 800, height: 600 }
  const logins = [{ id: 'a', username: 'me' }]

  it('opens under the field inside the page', () => {
    const rect = autofillRect(pane, { rect: { x: 100, y: 100, width: 300, height: 30 }, logins })
    expect(rect.x).toBe(394)
    expect(rect.y).toBe(50 + 100 + 30)
    expect(rect.width).toBe(312)
  })

  it('flips above a field near the bottom and stays inside the pane', () => {
    const rect = autofillRect(pane, { rect: { x: 700, y: 560, width: 200, height: 30 }, logins })
    expect(rect.y + rect.height).toBeLessThanOrEqual(pane.y + 560)
    expect(rect.x + rect.width).toBeLessThanOrEqual(pane.x + pane.width)
  })
})
