import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainEvent, type WebContents, type WebFrameMain } from 'electron'
import {
  AUTOFILL_BLUR,
  AUTOFILL_FILL,
  AUTOFILL_FOCUS,
  AUTOFILL_SUBMIT,
  type FillValues,
} from '@shared/autofill'
import { loginOrigin } from '@shared/passwords'
import type { Id, Rect } from '@shared/schema'
import type { PasswordVault } from './passwords'
import type { Store } from './store'
import type { TabManager } from './tabs'

const BLUR_GRACE_MS = 250
const PENDING_TTL_MS = 60_000
const MAX_FIELD = 4_096

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
  at: number
  shown: boolean
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
  return {
    x: Math.round(x * zoom),
    y: Math.round(y * zoom),
    width: Math.round(Math.max(0, width) * zoom),
    height: Math.round(Math.max(0, height) * zoom),
  }
}

const text = (value: unknown) =>
  typeof value === 'string' && value.length <= MAX_FIELD ? value : null

export class Autofill {
  readonly #deps: AutofillDeps
  readonly #targets = new Map<Id, Target>()
  readonly #blurTimers = new Map<Id, NodeJS.Timeout>()
  readonly #pending = new Map<Id, Pending>()

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
  }

  watch(tabId: Id, contents: WebContents): void {
    const navigated = () => {
      this.#hide(tabId)
      this.#offerSave(tabId)
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
    this.#pending.delete(tabId)
  }

  async fill(tabId: Id, loginId: Id): Promise<void> {
    const target = this.#targets.get(tabId)
    this.#hide(tabId)
    if (!target || target.frame.isDestroyed()) return
    const { vault } = this.#deps
    const password = await vault.secret(target.profileId, loginId, target.origin)
    if (target.frame.isDestroyed()) return
    const username = vault
      .choices(target.profileId, target.origin)
      .find((login) => login.id === loginId)?.username
    if (password === null || username === undefined) return
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
    this.#pending.delete(tabId)
    const { vault } = this.#deps
    if (action === 'save')
      await vault.save(pending.profileId, pending.origin, pending.username, pending.password)
    if (action === 'never') vault.never(pending.profileId, pending.origin)
  }

  #tabOf(event: IpcMainEvent): Id | null {
    if (event.senderFrame !== event.sender.mainFrame) return null
    return this.#deps.tabs.tabIdFor(event.sender)
  }

  #focus(event: IpcMainEvent, raw: unknown): void {
    const tabId = this.#tabOf(event)
    const frame = event.senderFrame
    if (!tabId || !frame) return
    const origin = loginOrigin(frame.url)
    const rect = fieldRect(raw, event.sender.getZoomFactor())
    if (!origin || !rect) return
    const profileId = this.#deps.profileFor(tabId)
    const logins = this.#deps.vault.choices(profileId, origin)
    clearTimeout(this.#blurTimers.get(tabId))
    this.#targets.set(tabId, { frame, origin, profileId })
    if (logins.length === 0) {
      this.#hide(tabId)
      return
    }
    this.#deps.store.dispatch({
      type: 'runtime/tab',
      id: tabId,
      patch: { autofill: { rect, logins } },
    })
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

  async #submit(event: IpcMainEvent, raw: unknown): Promise<void> {
    const tabId = this.#tabOf(event)
    const origin = event.senderFrame ? loginOrigin(event.senderFrame.url) : null
    if (!tabId || !origin || typeof raw !== 'object' || raw === null) return
    const values = raw as Record<string, unknown>
    const username = text(values.username)
    const password = text(values.password)
    if (username === null || !password) return
    const profileId = this.#deps.profileFor(tabId)
    const verdict = await this.#deps.vault.verdict(profileId, origin, username, password)
    if (verdict !== 'new' && verdict !== 'update') return
    this.#pending.set(tabId, {
      promptId: randomUUID(),
      origin,
      profileId,
      username,
      password,
      update: verdict === 'update',
      at: Date.now(),
      shown: false,
    })
  }

  #offerSave(tabId: Id): void {
    const pending = this.#pending.get(tabId)
    if (!pending || pending.shown) return
    if (Date.now() - pending.at > PENDING_TTL_MS) {
      this.#pending.delete(tabId)
      return
    }
    const runtime = this.#deps.store.state.runtime.tabs[tabId]
    if (!runtime || runtime.prompt) return
    pending.shown = true
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
