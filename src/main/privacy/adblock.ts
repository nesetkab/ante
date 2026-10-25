import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  adsAndTrackingLists,
  ElectronBlocker,
  fromElectronDetails,
  fullLists,
  Request,
} from '@ghostery/adblocker-electron'
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
const COOKIE_CACHE_FILE = 'adblock-engine-cookies.bin'
const cookieLists = fullLists.filter((url) => url.includes('cookie'))
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
    const cookies = this.#store.state.data.settings.blockCookieBanners
    if (await this.#build(cookies)) return
    if (cookies) await this.#build(false)
  }

  async #build(cookies: boolean): Promise<boolean> {
    const path = join(this.#cacheDir, cookies ? COOKIE_CACHE_FILE : CACHE_FILE)
    try {
      await mkdir(this.#cacheDir, { recursive: true })
      const info = await stat(path).catch(() => null)
      if (info && Date.now() - info.mtimeMs > CACHE_MAX_AGE_MS) await rm(path, { force: true })
      const fetch = (url: string) => net.fetch(url)
      const caching = {
        path,
        read: (file: string) => readFile(file),
        write: (file: string, buffer: Uint8Array) => writeFile(file, buffer),
      }
      const engine = cookies
        ? await ElectronBlocker.fromLists(
            fetch,
            [...adsAndTrackingLists, ...cookieLists],
            { loadCosmeticFilters: true, loadNetworkFilters: true },
            caching,
          )
        : await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, caching)
      if (cookies && !this.#store.state.data.settings.blockCookieBanners) return true
      this.#engine = engine
      this.#ready = true
      return true
    } catch (error) {
      console.warn('[adblock] could not load filters', cookies ? 'with cookie lists' : '', error)
      return false
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
      domain,
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
    if (this.#store.state.runtime.tabs[tabId]?.blocked)
      patchLoadedTab(this.#store, tabId, { blocked: 0 })
  }

  #count(tabId: Id): void {
    this.#pending.set(tabId, (this.#pending.get(tabId) ?? 0) + 1)
    if (!this.#flushTimer) this.#flushTimer = setTimeout(() => this.#flush(), FLUSH_DELAY_MS)
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
