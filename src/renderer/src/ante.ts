import type { AnteApi } from '@shared/ipc'

const params = new URLSearchParams(window.location.search)

export const ante = (window as unknown as { ante: AnteApi }).ante
export const windowId = params.get('window') ?? ''
export const surface = params.get('surface') === 'overlay' ? 'overlay' : 'chrome'
export const isMac = ante.platform === 'darwin'
export const modKey = isMac ? '⌘' : 'Ctrl+'
