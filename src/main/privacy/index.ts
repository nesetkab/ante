import { randomUUID } from 'node:crypto'
import { Menu, type MenuItemConstructorOptions } from 'electron'
import { siteHost, isAllowlisted, toggleAllowlist } from '@shared/adblock'
import type { Command } from '@shared/commands'
import { decisionsFor, originOf, permissionLabels, sitePermissionSchema } from '@shared/permissions'
import type { Id } from '@shared/schema'
import { PRIVATE_PREFIX, isPrivateProfile } from '@shared/state/private'
import { activeTabId, getTab, rootOf } from '@shared/state/tree'
import type { Sessions } from '../sessions'
import type { Store } from '../store'
import type { TabManager } from '../tabs'
import type { AppWindow, WindowManager } from '../windows'
import { FindInPage } from './find'
import { PermissionPrompts } from './permissions'

export type PrivacyCommand = Extract<
  Command,
  {
    type:
      | 'find/open'
      | 'find/query'
      | 'find/step'
      | 'find/close'
      | 'permission/respond'
      | 'privacy/siteMenu'
      | 'privacy/clearData'
      | 'window/newPrivate'
  }
>

const SITE_STORAGES = [
  'localstorage',
  'indexdb',
  'serviceworkers',
  'cachestorage',
  'filesystem',
  'shadercache',
] as const

interface PrivacyDeps {
  store: Store
  tabs: TabManager
  sessions: Sessions
  windows: WindowManager
  toast: (window: AppWindow, message: string) => void
}

export class Privacy {
  readonly #deps: PrivacyDeps
  readonly prompts: PermissionPrompts
  readonly find: FindInPage

  constructor(deps: PrivacyDeps) {
    this.#deps = deps
    this.prompts = new PermissionPrompts(deps.store, deps.tabs)
    this.find = new FindInPage(deps.store, deps.tabs)
    deps.sessions.onCreate((session, profileId) => this.prompts.attach(session, profileId))
    deps.store.subscribe((change) => {
      if (change.action.type !== 'window/remove') return
      const closed = change.prev.data.windows[change.action.id]
      const profileId = closed ? change.prev.data.spaces[closed.spaceId]?.profileId : undefined
      if (profileId && isPrivateProfile(profileId)) this.#discardPrivate(profileId)
    })
  }

  get #data() {
    return this.#deps.store.state.data
  }

  #targetTab(window: AppWindow, tabId: Id | undefined): Id | null {
    if (tabId) return getTab(this.#data, tabId)?.id ?? null
    const data = window.data
    if (!data) return null
    return data.kind === 'little' ? data.littleTabId : activeTabId(this.#data, data)
  }

  run(window: AppWindow, command: PrivacyCommand): void {
    switch (command.type) {
      case 'find/open': {
        const tabId = this.#targetTab(window, undefined)
        if (!tabId) return
        this.find.open(tabId)
        this.#deps.windows.syncNow()
        window.focusOverlay()
        return
      }
      case 'find/query':
        this.find.query(command.tabId, command.query)
        return
      case 'find/step': {
        const tabId = this.#targetTab(window, command.tabId)
        if (!tabId) return
        this.find.step(tabId, command.forward)
        this.#deps.windows.syncNow()
        return
      }
      case 'find/close': {
        const tabId = this.#targetTab(window, command.tabId)
        if (!tabId) return
        this.find.close(tabId)
        this.#deps.windows.syncNow()
        window.focusContent(tabId)
        return
      }
      case 'permission/respond':
        this.prompts.respond(command)
        this.#deps.windows.syncNow()
        window.focusContent(command.tabId)
        return
      case 'privacy/siteMenu':
        this.#siteMenu(window, command.tabId)
        return
      case 'privacy/clearData':
        void this.#clearData(window, command)
        return
      case 'window/newPrivate': {
        const profileId = `${PRIVATE_PREFIX}${randomUUID()}`
        const spaceId = randomUUID()
        this.#deps.store.dispatch({ type: 'private/create', profileId, spaceId })
        this.#deps.windows.createMain(spaceId)
        return
      }
    }
  }

  async #clearData(
    window: AppWindow,
    command: Extract<PrivacyCommand, { type: 'privacy/clearData' }>,
  ): Promise<void> {
    if (!this.#data.profiles[command.profileId]) return
    const session = this.#deps.sessions.forProfile(command.profileId)
    const storages = [
      ...(command.cookies ? (['cookies'] as const) : []),
      ...(command.storage ? SITE_STORAGES : []),
    ]
    try {
      if (storages.length > 0) await session.clearStorageData({ storages: [...storages] })
      if (command.cache) await session.clearCache()
      this.#deps.toast(window, 'Cleared browsing data')
    } catch (error) {
      console.error('[privacy] clearing data failed', error)
      this.#deps.toast(window, 'Could not clear browsing data')
    }
  }

  #discardPrivate(profileId: Id): void {
    const stillOpen = Object.values(this.#data.windows).some(
      (window) => this.#data.spaces[window.spaceId]?.profileId === profileId,
    )
    if (stillOpen) return
    const session = this.#deps.sessions.forProfile(profileId)
    this.#deps.store.dispatch({ type: 'private/remove', profileId })
    session.clearStorageData().catch(() => undefined)
    session.clearCache().catch(() => undefined)
  }

  #siteMenu(window: AppWindow, tabId: Id | undefined): void {
    const tab = getTab(this.#data, this.#targetTab(window, tabId))
    const host = siteHost(tab?.url)
    const origin = originOf(tab?.url)
    if (!tab || !host || !origin) return
    const { adblock, adblockAllowlist } = this.#data.settings
    const windowSpace = window.data ? this.#data.spaces[window.data.spaceId] : undefined
    const profileId = rootOf(this.#data, tab.id)?.profileId ?? windowSpace?.profileId ?? 'default'
    const decisions = decisionsFor(this.#data, profileId, origin)
    const blocked = this.#deps.store.state.runtime.tabs[tab.id]?.blocked ?? 0
    const dispatch = this.#deps.store.dispatch

    const template: MenuItemConstructorOptions[] = [
      { label: host, enabled: false },
      { type: 'separator' },
      {
        label: 'Block Ads and Trackers',
        type: 'checkbox',
        enabled: adblock,
        checked: adblock && !isAllowlisted(adblockAllowlist, tab.url),
        click: () =>
          dispatch({
            type: 'settings/update',
            patch: { adblockAllowlist: toggleAllowlist(adblockAllowlist, host) },
          }),
      },
      {
        label: blocked === 1 ? '1 request blocked' : `${blocked} requests blocked`,
        enabled: false,
      },
    ]
    const remembered = sitePermissionSchema.options.filter((permission) => decisions[permission])
    if (remembered.length > 0) {
      template.push(
        { type: 'separator' },
        ...remembered.map((permission) => ({
          label: permissionLabels[permission],
          submenu: (['allow', 'block'] as const).map((decision) => ({
            label: decision === 'allow' ? 'Allow' : 'Block',
            type: 'radio' as const,
            checked: decisions[permission] === decision,
            click: () =>
              dispatch({
                type: 'sitePermission/set',
                profileId,
                origin,
                permissions: [permission],
                decision,
              }),
          })),
        })),
        {
          label: 'Reset Permissions',
          click: () => dispatch({ type: 'sitePermission/clear', profileId, origin }),
        },
      )
    }
    Menu.buildFromTemplate(template).popup()
  }
}
