import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainEvent, type WebContents, type WebFrameMain } from 'electron'
import {
  AUTOFILL_BLUR,
  AUTOFILL_FILL,
  AUTOFILL_FOCUS,
  AUTOFILL_PAGE,
  AUTOFILL_PROBE,
  AUTOFILL_SUBMIT,
  AUTOFILL_USERNAME,
  type FillValues,
} from '@shared/autofill'
import { loginOrigin, MAX_PASSWORD, MAX_USERNAME, sameLoginSite } from '@shared/passwords'
import type { Id, Rect } from '@shared/schema'
import type { PasswordVault } from './passwords'
import type { Store } from './store'
import type { TabManager } from './tabs'

const BLUR_GRACE_MS = 250
const PENDING_TTL_MS = 60_000
const PROBE_DELAY_MS = 800
const USERNAME_TTL_MS = 10 * 60_000
const QUIET_MS = 60_000
const SHOWN_TTL_MS = 10 * 60_000

interface Target {
  frame: WebFrameMain
  origin: string
  profileId: Id
}

interface Pending {
  promptId: Id
  origin: string
  profileId: Id
  username: string
  password: string
  update: boolean
  expires: NodeJS.Timeout
}

interface Remembered {
  origin: string
  value: string
  at: number
}

interface AutofillDeps {
  store: Store
  tabs: TabManager
  vault: PasswordVault
  profileFor: (tabId: Id) => Id
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function fieldRect(value: unknown, zoom: number): Rect | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, width, height } = value as Record<string, unknown>
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return null
  return {
    x: Math.round(x * zoom),
    y: Math.round(y * zoom),
    width: Math.round(width * zoom),
    height: Math.round(height * zoom),
  }
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max ? value : null

export class Autofill {
  readonly #deps: AutofillDeps
  readonly #targets = new Map<Id, Target>()
  readonly #blurTimers = new Map<Id, NodeJS.Timeout>()
  readonly #pending = new Map<Id, Pending>()
  readonly #usernames = new Map<Id, Remembered>()
  readonly #quiet = new Map<Id, Remembered>()

  constructor(deps: AutofillDeps) {
    this.#deps = deps
  }

  listen(): void {
    ipcMain.on(AUTOFILL_FOCUS, (event, rect: unknown) => this.#focus(event, rect))
    ipcMain.on(AUTOFILL_BLUR, (event) => {
      const tabId = this.#tabOf(event)
      if (tabId) this.#scheduleHide(tabId)
    })
    ipcMain.on(AUTOFILL_SUBMIT, (event, values: unknown) => void this.#submit(event, values))
    ipcMain.on(AUTOFILL_USERNAME, (event, value: unknown) => this.#rememberUsername(event, value))
    ipcMain.on(AUTOFILL_PAGE, (event, hasPassword: unknown) => {
      const tabId = this.#tabOf(event)
      if (!tabId) return
      if (hasPassword === false) this.#showPrompt(tabId)
      else this.#dropPending(tabId)
    })
  }

  watch(tabId: Id, contents: WebContents): void {
    const navigated = () => {
      this.#hide(tabId)
      this.#targets.delete(tabId)
      if (!this.#pending.has(tabId)) return
      setTimeout(() => {
        if (!contents.isDestroyed() && this.#pending.has(tabId))
          contents.mainFrame.send(AUTOFILL_PROBE)
      }, PROBE_DELAY_MS)
    }
    contents.on('did-navigate', navigated)
    contents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
      if (isMainFrame) navigated()
    })
    contents.once('destroyed', () => this.forget(tabId))
  }

  forget(tabId: Id): void {
    clearTimeout(this.#blurTimers.get(tabId))
    this.#blurTimers.delete(tabId)
    this.#targets.delete(tabId)
    this.#dropPending(tabId)
    this.#usernames.delete(tabId)
    this.#quiet.delete(tabId)
  }

  async fill(tabId: Id, loginId: Id): Promise<void> {
    const target = this.#targets.get(tabId)
    this.#hide(tabId)
    if (!target) return
    const { vault } = this.#deps
    const password = await vault.secret(target.profileId, loginId, target.origin)
    const username = vault
      .choices(target.profileId, target.origin)
      .find((login) => login.id === loginId)?.username
    if (password === null || username === undefined) return
    if (this.#targets.get(tabId) !== target || !this.#stillAt(tabId, target)) return
    const values: FillValues = { username, password }
    target.frame.send(AUTOFILL_FILL, values)
    vault.markUsed(target.profileId, loginId)
    this.#deps.tabs.contents(tabId)?.focus()
  }

  async respond(tabId: Id, promptId: Id, action: 'save' | 'never' | 'dismiss'): Promise<void> {
    const pending = this.#pending.get(tabId)
    const prompt = this.#deps.store.state.runtime.tabs[tabId]?.prompt
    if (prompt?.kind === 'password' && prompt.id === promptId)
      this.#deps.store.dispatch({ type: 'runtime/tab', id: tabId, patch: { prompt: null } })
    if (pending?.promptId !== promptId) return
    this.#dropPending(tabId)
    const { vault } = this.#deps
    if (action === 'save')
      await vault.save(pending.profileId, pending.origin, pending.username, pending.password)
    if (action === 'never') vault.never(pending.profileId, pending.origin)
    if (action !== 'save')
      this.#quiet.set(tabId, { origin: pending.origin, value: '', at: Date.now() })
  }

  #stillAt(tabId: Id, target: Target): boolean {
    const contents = this.#deps.tabs.contents(tabId)
    if (!contents || contents.isDestroyed() || target.frame.isDestroyed()) return false
    if (target.frame !== contents.mainFrame || target.frame.detached) return false
    const origin = loginOrigin(target.frame.url)
    return origin !== null && sameLoginSite(origin, target.origin)
  }

  #tabOf(event: IpcMainEvent): Id | null {
    if (event.senderFrame !== event.sender.mainFrame) return null
    return this.#deps.tabs.tabIdFor(event.sender)
  }

  #focus(event: IpcMainEvent, raw: unknown): void {
    const tabId = this.#tabOf(event)
    const frame = event.senderFrame
    if (!tabId || !frame) return
    clearTimeout(this.#blurTimers.get(tabId))
    const origin = loginOrigin(frame.url)
    const rect = fieldRect(raw, event.sender.getZoomFactor())
    if (!origin || !rect) {
      this.#targets.delete(tabId)
      this.#hide(tabId)
      return
    }
    const profileId = this.#deps.profileFor(tabId)
    const logins = this.#deps.vault.choices(profileId, origin)
    this.#targets.set(tabId, { frame, origin, profileId })
    if (logins.length === 0) {
      this.#hide(tabId)
      return
    }
    const current = this.#deps.store.state.runtime.tabs[tabId]?.autofill
    const next = { rect, logins }
    if (current && JSON.stringify(current) === JSON.stringify(next)) return
    this.#deps.store.dispatch({ type: 'runtime/tab', id: tabId, patch: { autofill: next } })
  }

  #scheduleHide(tabId: Id): void {
    clearTimeout(this.#blurTimers.get(tabId))
    this.#blurTimers.set(
      tabId,
      setTimeout(() => this.#hide(tabId), BLUR_GRACE_MS),
    )
  }

  #hide(tabId: Id): void {
    clearTimeout(this.#blurTimers.get(tabId))
    this.#blurTimers.delete(tabId)
    if (this.#deps.store.state.runtime.tabs[tabId]?.autofill)
      this.#deps.store.dispatch({ type: 'runtime/tab', id: tabId, patch: { autofill: null } })
  }

  #rememberUsername(event: IpcMainEvent, raw: unknown): void {
    const tabId = this.#tabOf(event)
    const origin = event.senderFrame ? loginOrigin(event.senderFrame.url) : null
    const value = text(raw, MAX_USERNAME)?.trim()
    if (!tabId || !origin || !value) return
    this.#usernames.set(tabId, { origin, value, at: Date.now() })
  }

  #recentUsername(tabId: Id, origin: string): string {
    const remembered = this.#usernames.get(tabId)
    if (!remembered || Date.now() - remembered.at > USERNAME_TTL_MS) return ''
    return sameLoginSite(remembered.origin, origin) ? remembered.value : ''
  }

  #isQuiet(tabId: Id, origin: string): boolean {
    const quiet = this.#quiet.get(tabId)
    return quiet !== undefined && Date.now() - quiet.at < QUIET_MS && quiet.origin === origin
  }

  async #submit(event: IpcMainEvent, raw: unknown): Promise<void> {
    const tabId = this.#tabOf(event)
    const origin = event.senderFrame ? loginOrigin(event.senderFrame.url) : null
    if (!tabId || !origin || typeof raw !== 'object' || raw === null) return
    if (this.#isQuiet(tabId, origin) || this.#deps.store.state.runtime.tabs[tabId]?.prompt) return
    const values = raw as Record<string, unknown>
    const typed = text(values.username, MAX_USERNAME)
    const password = text(values.password, MAX_PASSWORD)
    if (typed === null || !password) return
    const username = typed || this.#recentUsername(tabId, origin)
    const profileId = this.#deps.profileFor(tabId)
    const verdict = await this.#deps.vault.verdict(profileId, origin, username, password)
    if (verdict !== 'new' && verdict !== 'update') return
    this.#dropPending(tabId)
    this.#pending.set(tabId, {
      promptId: randomUUID(),
      origin,
      profileId,
      username,
      password,
      update: verdict === 'update',
      expires: setTimeout(() => this.#dropPending(tabId), PENDING_TTL_MS),
    })
  }

  #dropPending(tabId: Id): void {
    const pending = this.#pending.get(tabId)
    if (!pending) return
    clearTimeout(pending.expires)
    this.#pending.delete(tabId)
  }

  #showPrompt(tabId: Id): void {
    const pending = this.#pending.get(tabId)
    const runtime = this.#deps.store.state.runtime.tabs[tabId]
    if (!pending || !runtime || runtime.prompt) return
    clearTimeout(pending.expires)
    pending.expires = setTimeout(() => this.#dropPending(tabId), SHOWN_TTL_MS)
    this.#deps.store.dispatch({
      type: 'runtime/tab',
      id: tabId,
      patch: {
        prompt: {
          id: pending.promptId,
          kind: 'password',
          origin: pending.origin,
          username: pending.username,
          update: pending.update,
        },
      },
    })
  }
}
