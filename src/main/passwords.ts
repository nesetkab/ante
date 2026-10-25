import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  loginOrigin,
  MAX_PASSWORD,
  MAX_USERNAME,
  sameLoginSite,
  type LoginChoice,
  type LoginSummary,
} from '@shared/passwords'
import { idSchema, type Id } from '@shared/schema'
import { isPrivateProfile } from '@shared/state/private'

export interface Cipher {
  available: () => boolean
  encrypt: (plain: string) => Promise<string>
  decrypt: (secret: string) => Promise<string | null>
}

export type LoginVerdict = 'new' | 'update' | 'known' | 'blocked'

export interface ImportedLogin {
  url: string
  username: string
  password: string
}

const MAX_LOGINS = 10_000
const MAX_FILE_BYTES = 16 * 1024 * 1024

const loginSchema = z.object({
  id: idSchema,
  origin: z.string().min(1).max(2_000),
  username: z.string().max(MAX_USERNAME),
  secret: z.string().min(1).max(20_000),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastUsedAt: z.number().nullable(),
})
type StoredLogin = z.infer<typeof loginSchema>

interface VaultData {
  logins: Record<Id, StoredLogin[]>
  never: Record<Id, string[]>
}

const empty = (): VaultData => ({ logins: {}, never: {} })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function entriesOf<T>(value: unknown, parse: (entry: unknown) => T | null): Record<Id, T[]> {
  if (!isRecord(value)) return {}
  const result: Record<Id, T[]> = {}
  for (const [profileId, list] of Object.entries(value)) {
    if (!idSchema.safeParse(profileId).success || !Array.isArray(list)) continue
    result[profileId] = list.slice(0, MAX_LOGINS).flatMap((entry) => parse(entry) ?? [])
  }
  return result
}

export function parseVault(raw: unknown): VaultData {
  if (!isRecord(raw)) return empty()
  return {
    logins: entriesOf(raw.logins, (entry) => {
      const parsed = loginSchema.safeParse(entry)
      return parsed.success ? parsed.data : null
    }),
    never: entriesOf(raw.never, (entry) =>
      typeof entry === 'string' && entry.length <= 2_000 ? entry : null,
    ),
  }
}

interface LoadResult {
  data: VaultData
  ok: boolean
}

function readVault(path: string): LoadResult {
  if (!existsSync(path)) return { data: empty(), ok: true }
  try {
    const text = readFileSync(path, 'utf8')
    if (text.length > MAX_FILE_BYTES) return { data: empty(), ok: false }
    return { data: parseVault(JSON.parse(text)), ok: true }
  } catch {
    return { data: empty(), ok: false }
  }
}

function writeDurably(path: string, text: string): void {
  const temp = join(dirname(path), `.passwords.${randomUUID()}.tmp`)
  try {
    const fd = openSync(temp, 'w', 0o600)
    try {
      writeSync(fd, text)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temp, path)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

export class PasswordVault {
  readonly #path: string
  readonly #cipher: Cipher
  readonly #now: () => number
  readonly #onChange: () => void
  #data: VaultData

  constructor(path: string, cipher: Cipher, onChange: () => void, now = Date.now) {
    this.#path = path
    this.#cipher = cipher
    this.#onChange = onChange
    this.#now = now
    const loaded = readVault(path)
    if (!loaded.ok) this.#setAside()
    this.#data = loaded.data
  }

  #setAside(): void {
    try {
      renameSync(this.#path, `${this.#path}.unreadable-${this.#now()}`)
    } catch (error) {
      console.error('[passwords] could not set aside unreadable vault', error)
    }
  }

  get available(): boolean {
    return this.#cipher.available()
  }

  summaries(): LoginSummary[] {
    return Object.entries(this.#data.logins).flatMap(([profileId, logins]) =>
      logins.map((login) => ({
        id: login.id,
        profileId,
        origin: login.origin,
        username: login.username,
        updatedAt: login.updatedAt,
      })),
    )
  }

  choices(profileId: Id, origin: string): LoginChoice[] {
    return this.#matching(profileId, origin)
      .sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt))
      .map((login) => ({ id: login.id, username: login.username }))
  }

  async secret(profileId: Id, id: Id, origin: string | null): Promise<string | null> {
    const login = this.#logins(profileId).find((candidate) => candidate.id === id)
    if (!login || (origin !== null && !sameLoginSite(login.origin, origin))) return null
    return this.#cipher.decrypt(login.secret)
  }

  async verdict(
    profileId: Id,
    origin: string,
    username: string,
    password: string,
  ): Promise<LoginVerdict> {
    if (isPrivateProfile(profileId) || !this.available || !password) return 'blocked'
    if (this.#data.never[profileId]?.some((site) => sameLoginSite(site, origin))) return 'blocked'
    const existing = this.#matching(profileId, origin).find((login) => login.username === username)
    if (!existing) return 'new'
    return (await this.#cipher.decrypt(existing.secret)) === password ? 'known' : 'update'
  }

  async save(profileId: Id, origin: string, username: string, password: string): Promise<void> {
    if (isPrivateProfile(profileId) || !this.available || !password) return
    await this.#store(profileId, origin, username, password)
    this.#write()
  }

  never(profileId: Id, origin: string): void {
    if (isPrivateProfile(profileId)) return
    const list = (this.#data.never[profileId] ??= [])
    if (!list.includes(origin)) list.push(origin)
    this.#write()
  }

  markUsed(profileId: Id, id: Id): void {
    const login = this.#logins(profileId).find((candidate) => candidate.id === id)
    if (!login) return
    login.lastUsedAt = this.#now()
    this.#write(false)
  }

  remove(profileId: Id, id: Id): void {
    const logins = this.#logins(profileId)
    const next = logins.filter((login) => login.id !== id)
    if (next.length === logins.length) return
    this.#data.logins[profileId] = next
    this.#write()
  }

  removeProfile(profileId: Id): void {
    Reflect.deleteProperty(this.#data.logins, profileId)
    Reflect.deleteProperty(this.#data.never, profileId)
    this.#write()
  }

  async importLogins(profileId: Id, entries: readonly ImportedLogin[]): Promise<number> {
    if (isPrivateProfile(profileId) || !this.available) return 0
    let count = 0
    for (const entry of entries) {
      const origin = loginOrigin(entry.url)
      if (!origin || !entry.password || entry.password.length > MAX_PASSWORD) continue
      if (entry.username.length > MAX_USERNAME) continue
      const verdict = await this.verdict(profileId, origin, entry.username, entry.password)
      if (verdict === 'known') continue
      await this.#store(profileId, origin, entry.username, entry.password)
      count += 1
    }
    if (count > 0) this.#write()
    return count
  }

  async #store(profileId: Id, origin: string, username: string, password: string): Promise<void> {
    if (username.length > MAX_USERNAME || password.length > MAX_PASSWORD) return
    const secret = await this.#cipher.encrypt(password)
    const now = this.#now()
    const logins = (this.#data.logins[profileId] ??= [])
    const existing = this.#matching(profileId, origin).find((login) => login.username === username)
    if (existing) {
      existing.secret = secret
      existing.updatedAt = now
      return
    }
    if (logins.length >= MAX_LOGINS) return
    logins.push({
      id: randomUUID(),
      origin,
      username,
      secret,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
    })
  }

  #logins(profileId: Id): StoredLogin[] {
    return this.#data.logins[profileId] ?? []
  }

  #matching(profileId: Id, origin: string): StoredLogin[] {
    return this.#logins(profileId).filter((login) => sameLoginSite(login.origin, origin))
  }

  #write(notify = true): void {
    try {
      writeDurably(this.#path, JSON.stringify(this.#data))
    } catch (error) {
      console.error('[passwords] could not save', error)
    }
    if (notify) this.#onChange()
  }
}
