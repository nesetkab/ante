import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ElectronBlocker, fromElectronDetails, Request } from '@ghostery/adblocker-electron'
import {
  net,
  webContents as allContents,
  type CallbackResponse,
  type OnBeforeRequestListenerDetails,
  type Session,
  type WebContents,
} from 'electron'
import { isAllowlisted } from '@shared/adblock'
import type { Id } from '@shared/schema'
import type { Store } from '../store'
import type { TabManager } from '../tabs'
import { patchLoadedTab } from './runtime'

const CACHE_FILE = 'adblock-engine.bin'
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FLUSH_DELAY_MS = 250

export const FALLBACK_FILTERS = [
  '||doubleclick.net^',
  '||googlesyndication.com^',
  '||googleadservices.com^',
  '||google-analytics.com^',
  '||googletagmanager.com^',
  '||googletagservices.com^',
  '||adservice.google.com^',
  '||adnxs.com^',
  '||adsrvr.org^',
  '||amazon-adsystem.com^',
  '||criteo.com^',
  '||criteo.net^',
  '||taboola.com^',
  '||outbrain.com^',
  '||scorecardresearch.com^',
  '||quantserve.com^',
  '||hotjar.com^',
  '||moatads.com^',
  '||rubiconproject.com^',
  '||pubmatic.com^',
  '||openx.net^',
  '||ads-twitter.com^',
  '||connect.facebook.net^$third-party',
].join('\n')

export class AdBlocker {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #cacheDir: string
  readonly #tabByContents = new Map<number, Id>()
  readonly #watched = new WeakSet<WebContents>()
  readonly #pending = new Map<Id, number>()
  #engine: ElectronBlocker = ElectronBlocker.parse(FALLBACK_FILTERS)
  #flushTimer: NodeJS.Timeout | null = null
  #ready = false

  constructor(store: Store, tabs: TabManager, cacheDir: string) {
    this.#store = store
    this.#tabs = tabs
    this.#cacheDir = cacheDir
  }

  get ready(): boolean {
    return this.#ready
  }

  async load(): Promise<void> {
    const path = join(this.#cacheDir, CACHE_FILE)
    try {
      await mkdir(this.#cacheDir, { recursive: true })
      const info = await stat(path).catch(() => null)
      if (info && Date.now() - info.mtimeMs > CACHE_MAX_AGE_MS) await rm(path, { force: true })
      this.#engine = await ElectronBlocker.fromPrebuiltAdsAndTracking((url) => net.fetch(url), {
        path,
        read: (file) => readFile(file),
        write: (file, buffer) => writeFile(file, buffer),
      })
      this.#ready = true
    } catch (error) {
      console.warn('[adblock] using fallback filters', error)
    }
  }

  attach(session: Session): void {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      callback(this.#decide(details))
    })
  }

  #tabFor(contents: WebContents | undefined): Id | null {
    if (!contents || contents.isDestroyed()) return null
    const cached = this.#tabByContents.get(contents.id)
    if (cached) return cached
    const tabId = this.#tabs.tabIdFor(contents)
    if (tabId) {
      this.#tabByContents.set(contents.id, tabId)
      const contentsId = contents.id
      contents.once('destroyed', () => this.#tabByContents.delete(contentsId))
    }
    return tabId
  }

  #decide(details: OnBeforeRequestListenerDetails): CallbackResponse {
    const contents =
      details.webContents ??
      (details.webContentsId ? allContents.fromId(details.webContentsId) : undefined)
    const tabId = this.#tabFor(contents)
    if (contents && tabId) this.#watch(contents)
    if (details.resourceType === 'mainFrame') {
      if (tabId) this.#reset(tabId)
      return {}
    }
    const { adblock, adblockAllowlist } = this.#store.state.data.settings
    if (!adblock || isAllowlisted(adblockAllowlist, contents?.getURL())) return {}
    const request = fromElectronDetails(details)
    if (request.type === 'other') request.guessTypeOfRequest()
    const { match, redirect } = this.#engine.match(request)
    if (!match && !redirect) return {}
    if (tabId) this.#count(tabId)
    return redirect ? { redirectURL: redirect.dataUrl } : { cancel: true }
  }

  #watch(contents: WebContents): void {
    if (this.#watched.has(contents)) return
    this.#watched.add(contents)
    contents.on('dom-ready', () => this.#injectCosmetics(contents))
  }

  #injectCosmetics(contents: WebContents): void {
    if (contents.isDestroyed()) return
    const url = contents.getURL()
    const { adblock, adblockAllowlist } = this.#store.state.data.settings
    if (!adblock || !/^https?:/.test(url) || isAllowlisted(adblockAllowlist, url)) return
    const { hostname, domain } = Request.fromRawDetails({ url, type: 'main_frame' })
    const { active, styles } = this.#engine.getCosmeticsFilters({
      url,
      hostname,
      domain: domain ?? '',
      getBaseRules: true,
      getInjectionRules: false,
      getExtendedRules: false,
      getRulesFromHostname: true,
      getRulesFromDOM: false,
    })
    if (!active || !styles) return
    contents.insertCSS(styles, { cssOrigin: 'user' }).catch(() => undefined)
  }

  #reset(tabId: Id): void {
    this.#pending.delete(tabId)
    if (this.#store.state.runtime.tabs[tabId]?.blocked) patchLoadedTab(this.#store, tabId, { blocked: 0 })
  }

  #count(tabId: Id): void {
    this.#pending.set(tabId, (this.#pending.get(tabId) ?? 0) + 1)
    this.#flushTimer ??= setTimeout(() => this.#flush(), FLUSH_DELAY_MS)
  }

  #flush(): void {
    this.#flushTimer = null
    for (const [tabId, count] of this.#pending) {
      const current = this.#store.state.runtime.tabs[tabId]?.blocked ?? 0
      patchLoadedTab(this.#store, tabId, { blocked: current + count })
    }
    this.#pending.clear()
  }
}
