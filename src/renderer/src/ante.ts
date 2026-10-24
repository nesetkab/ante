import type { AnteApi } from '@shared/ipc'

const params = new URLSearchParams(window.location.search)

export const ante = (window as unknown as { ante: AnteApi }).ante
export const windowId = params.get('window') ?? ''
const surfaces = ['chrome', 'overlay', 'panel'] as const
export type SurfaceKind = (typeof surfaces)[number]
export const surface: SurfaceKind =
  surfaces.find((candidate) => candidate === params.get('surface')) ?? 'chrome'
export const panelParams = params
export const isMac = ante.platform === 'darwin'
export const modKey = isMac ? '⌘' : 'Ctrl+'
