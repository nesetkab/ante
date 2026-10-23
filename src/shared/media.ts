import { z } from 'zod'
import type { AppState, Data, Id, Runtime, TabMedia } from './schema'
import { getTab, visibleTabIds } from './state/tree'

export const MEDIA_WORLD_ID = 1847
export const MINI_PLAYER_LIMIT = 3

export const mediaProbeSchema = z
  .object({
    found: z.boolean(),
    playing: z.boolean(),
    video: z.boolean(),
    pip: z.boolean(),
    title: z.string().max(500).nullable(),
    artist: z.string().max(500).nullable(),
    artwork: z.string().max(4096).nullable(),
  })
  .nullable()
export type MediaProbe = z.infer<typeof mediaProbeSchema>

const pickMedia = `
  const all = [...document.querySelectorAll('video, audio')]
  const remembered = globalThis.__anteMedia?.deref?.()
  const engaged = (el) => !el.ended && (!el.paused || el.currentTime > 0)
  const target =
    all.find((el) => !el.paused && !el.ended && el.readyState > 1) ??
    (remembered && remembered.isConnected && engaged(remembered) ? remembered : undefined) ??
    all.find(engaged) ??
    null
  if (target) globalThis.__anteMedia = new WeakRef(target)
`

export const MEDIA_PROBE_SCRIPT = `(() => {
  ${pickMedia}
  const metadata = navigator.mediaSession?.metadata ?? null
  const artwork = metadata?.artwork?.length ? metadata.artwork[metadata.artwork.length - 1].src : null
  return {
    found: target !== null,
    playing: target !== null && !target.paused,
    video: target instanceof HTMLVideoElement && target.videoWidth > 0,
    pip: document.pictureInPictureElement != null,
    title: metadata?.title || null,
    artist: metadata?.artist || null,
    artwork: artwork || null,
  }
})()`

export const MEDIA_TOGGLE_SCRIPT = `(() => {
  ${pickMedia}
  if (!target) return false
  if (target.paused) void target.play().catch(() => undefined)
  else target.pause()
  return true
})()`

export const PIP_ENTER_SCRIPT = `(async () => {
  ${pickMedia}
  if (!(target instanceof HTMLVideoElement) || target.paused || target.disablePictureInPicture) return false
  if (document.pictureInPictureElement === target) return true
  try {
    await target.requestPictureInPicture()
    return true
  } catch {
    return false
  }
})()`

export const PIP_EXIT_SCRIPT = `(async () => {
  if (!document.pictureInPictureElement) return false
  try {
    await document.exitPictureInPicture()
    return true
  } catch {
    return false
  }
})()`

export function nextMedia(
  previous: TabMedia | null,
  probe: MediaProbe,
  audible: boolean,
  now: number,
): TabMedia | null {
  if (!probe?.found) {
    if (!audible) return null
    return {
      playing: true,
      controllable: false,
      video: false,
      pip: probe?.pip ?? false,
      title: probe?.title ?? null,
      artist: probe?.artist ?? null,
      artwork: probe?.artwork ?? null,
      startedAt: previous?.playing ? previous.startedAt : now,
    }
  }
  const startedAt = probe.playing && !previous?.playing ? now : (previous?.startedAt ?? now)
  return {
    playing: probe.playing,
    controllable: true,
    video: probe.video,
    pip: probe.pip,
    title: probe.title,
    artist: probe.artist,
    artwork: probe.artwork,
    startedAt,
  }
}

export function sameMedia(a: TabMedia | null, b: TabMedia | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.playing === b.playing &&
    a.controllable === b.controllable &&
    a.video === b.video &&
    a.pip === b.pip &&
    a.title === b.title &&
    a.artist === b.artist &&
    a.artwork === b.artwork &&
    a.startedAt === b.startedAt
  )
}

export function shownTabIds(data: Data): Set<Id> {
  const shown = new Set<Id>()
  for (const window of Object.values(data.windows)) {
    for (const id of visibleTabIds(data, window)) shown.add(id)
    if (window.peekTabId) shown.add(window.peekTabId)
  }
  return shown
}

export function miniPlayerTabIds(state: AppState, limit = MINI_PLAYER_LIMIT): Id[] {
  const shown = shownTabIds(state.data)
  return Object.entries(state.runtime.tabs)
    .filter(([id, runtime]) => {
      if (shown.has(id) || !getTab(state.data, id)) return false
      return runtime.media !== null || runtime.audible
    })
    .sort(([, a], [, b]) => (b.media?.startedAt ?? 0) - (a.media?.startedAt ?? 0))
    .slice(0, limit)
    .map(([id]) => id)
}

export interface PipTransitions {
  enter: Id[]
  exit: Id[]
}

export function pipTransitions(
  previous: ReadonlySet<Id>,
  next: ReadonlySet<Id>,
  runtime: Runtime,
  autoPipped: ReadonlySet<Id>,
  enabled: boolean,
): PipTransitions {
  const enter = enabled
    ? [...previous].filter((id) => {
        const media = runtime.tabs[id]?.media
        return !next.has(id) && media?.playing === true && media.video && !media.pip
      })
    : []
  const exit = [...next].filter((id) => !previous.has(id) && autoPipped.has(id))
  return { enter, exit }
}
