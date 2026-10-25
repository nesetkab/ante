import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { loginOrigin, sameLoginSite, type LoginChoice, type LoginSummary } from '@shared/passwords'
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
  username: z.string().max(1_000),
  secret: z.string().min(1).max(20_000),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastUsedAt: z.number().nullable(),
})
type StoredLogin = z.infer<typeof loginSchema>

const vaultSchema = z.object({
  logins: z.record(idSchema, z.array(loginSchema).max(MAX_LOGINS)).catch({}),
  never: z.record(idSchema, z.array(z.string().max(2_000)).max(MAX_LOGINS)).catch({}),
})
type VaultData = z.infer<typeof vaultSchema>

function readVault(path: string): VaultData {
  try {
    const text = readFileSync(path, 'utf8')
    if (text.length > MAX_FILE_BYTES) return { logins: {}, never: {} }
    const parsed = vaultSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : { logins: {}, never: {} }
  } catch {
    return { logins: {}, never: {} }
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
    this.#data = readVault(path)
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
    if (this.#data.never[profileId]?.includes(origin)) return 'blocked'
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
      if (!origin || !entry.password) continue
      const verdict = await this.verdict(profileId, origin, entry.username, entry.password)
      if (verdict === 'known') continue
      await this.#store(profileId, origin, entry.username, entry.password)
      count += 1
    }
    if (count > 0) this.#write()
    return count
  }

  async #store(profileId: Id, origin: string, username: string, password: string): Promise<void> {
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
    const temp = join(dirname(this.#path), `.passwords.${randomUUID()}.tmp`)
    try {
      writeFileSync(temp, JSON.stringify(this.#data), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, this.#path)
    } catch (error) {
      rmSync(temp, { force: true })
      console.error('[passwords] could not save', error)
    }
    if (notify) this.#onChange()
  }
}
