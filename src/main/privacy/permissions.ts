import { randomUUID } from 'node:crypto'
import {
  desktopCapturer,
  webContents as allContents,
  type DesktopCapturerSource,
  type Session,
  type Streams,
  type WebContents,
} from 'electron'
import {
  decisionsFor,
  evaluate,
  originOf,
  permissionsForCheck,
  permissionsForRequest,
  type Prompt,
  type SitePermission,
} from '@shared/permissions'
import type { Id } from '@shared/schema'
import { isPrivateProfile } from '@shared/state/private'
import { PROMPTLESS_PERMISSIONS } from '../sessions'
import type { Store } from '../store'
import type { TabManager } from '../tabs'
import { patchLoadedTab } from './runtime'

const THUMBNAIL_SIZE = { width: 240, height: 150 }

type Answer = { allow: false } | { allow: true; remember: boolean; sourceId?: string }

interface Pending {
  prompt: Prompt
  profileId: Id
  permissions: SitePermission[]
  settle: (answer: Answer) => void
}

export interface PermissionAnswer {
  tabId: Id
  promptId: Id
  allow: boolean
  remember: boolean
  sourceId?: string
}

const CAPTURE_PERMISSIONS = new Set<SitePermission>(['camera', 'microphone'])

export class PermissionPrompts {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #queues = new Map<Id, Pending[]>()
  readonly #watched = new WeakSet<WebContents>()

  constructor(store: Store, tabs: TabManager) {
    this.#store = store
    this.#tabs = tabs
  }

  attach(session: Session, profileId: Id): void {
    session.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (PROMPTLESS_PERMISSIONS.has(permission)) {
        callback(true)
        return
      }
      const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
      const permissions = permissionsForRequest(permission, mediaTypes)
      const origin = originOf(details.requestingUrl) ?? originOf(contents.getURL())
      const tabId = this.#tabs.tabIdFor(contents)
      if (!permissions || !origin || !tabId) {
        callback(false)
        return
      }
      const capture = permissions.some((name) => CAPTURE_PERMISSIONS.has(name))
      const grant = (allow: boolean) => {
        if (allow && capture) patchLoadedTab(this.#store, tabId, { capturing: true })
        callback(allow)
      }
      const verdict = evaluate(decisionsFor(this.#store.state.data, profileId, origin), permissions)
      if (verdict.result !== 'ask') {
        grant(verdict.result === 'allow')
        return
      }
      this.#enqueue(contents, tabId, {
        prompt: {
          id: randomUUID(),
          kind: 'permission',
          origin,
          permissions: verdict.pending,
          detail: null,
        },
        profileId,
        permissions: verdict.pending,
        settle: (answer) => grant(answer.allow),
      })
    })

    session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
      if (PROMPTLESS_PERMISSIONS.has(permission)) return true
      const permissions = permissionsForCheck(permission, details.mediaType)
      const origin = originOf(requestingOrigin)
      if (permissions.length === 0 || !origin) return false
      const stored = decisionsFor(this.#store.state.data, profileId, origin)
      return evaluate(stored, permissions).result === 'allow'
    })

    session.setDisplayMediaRequestHandler((request, callback) => {
      const deny = () => callback({})
      const contents = request.frame ? allContents.fromFrame(request.frame) : undefined
      const tabId = contents ? this.#tabs.tabIdFor(contents) : null
      const origin = originOf(request.securityOrigin)
      if (!contents || !tabId || !origin) {
        deny()
        return
      }
      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: THUMBNAIL_SIZE })
        .then((sources) =>
          this.#askForScreen(contents, tabId, profileId, origin, sources, callback),
        )
        .catch((error: unknown) => {
          console.warn('[permissions] could not list screens', error)
          deny()
        })
    })
  }

  respond(answer: PermissionAnswer): void {
    const queue = this.#queues.get(answer.tabId)
    const head = queue?.[0]
    if (!queue || head?.prompt.id !== answer.promptId) return
    queue.shift()
    head.settle(
      answer.allow
        ? {
            allow: true,
            remember: answer.remember,
            ...(answer.sourceId ? { sourceId: answer.sourceId } : {}),
          }
        : { allow: false },
    )
    if (head.prompt.kind === 'permission' && answer.remember && !isPrivateProfile(head.profileId)) {
      this.#store.dispatch({
        type: 'sitePermission/set',
        profileId: head.profileId,
        origin: head.prompt.origin,
        permissions: head.permissions,
        decision: answer.allow ? 'allow' : 'block',
      })
    }
    this.#show(answer.tabId)
  }

  #askForScreen(
    contents: WebContents,
    tabId: Id,
    profileId: Id,
    origin: string,
    sources: DesktopCapturerSource[],
    callback: (streams: Streams) => void,
  ): void {
    const byId = new Map(sources.map((source) => [source.id, source]))
    this.#enqueue(contents, tabId, {
      prompt: {
        id: randomUUID(),
        kind: 'screen',
        origin,
        sources: sources.map((source) => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL(),
          type: source.id.startsWith('screen') ? 'screen' : 'window',
        })),
      },
      profileId,
      permissions: [],
      settle: (answer) => {
        const source = answer.allow && answer.sourceId ? byId.get(answer.sourceId) : undefined
        if (source) patchLoadedTab(this.#store, tabId, { capturing: true })
        callback(source ? { video: source } : {})
      },
    })
  }

  #enqueue(contents: WebContents, tabId: Id, pending: Pending): void {
    this.#watch(contents, tabId)
    const queue = this.#queues.get(tabId) ?? []
    queue.push(pending)
    this.#queues.set(tabId, queue)
    if (queue.length === 1) this.#show(tabId)
  }

  #show(tabId: Id): void {
    const head = this.#queues.get(tabId)?.[0]
    if (!head) this.#queues.delete(tabId)
    patchLoadedTab(this.#store, tabId, { prompt: head?.prompt ?? null })
  }

  #denyAll(tabId: Id): void {
    const queue = this.#queues.get(tabId) ?? []
    this.#queues.delete(tabId)
    for (const pending of queue) pending.settle({ allow: false })
    patchLoadedTab(this.#store, tabId, { prompt: null })
  }

  #watch(contents: WebContents, tabId: Id): void {
    if (this.#watched.has(contents)) return
    this.#watched.add(contents)
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.#denyAll(tabId)
    })
    contents.once('destroyed', () => this.#denyAll(tabId))
  }
}
