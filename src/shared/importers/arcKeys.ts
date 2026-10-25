import { z } from 'zod'
import {
  canonicalAccelerator,
  isAccelerator,
  reservedShortcuts,
  withOverrides,
  type ShortcutOverrides,
} from '../keys'
import { shortcuts, type Platform } from '../shortcuts'

export const arcActionIds: Record<string, string> = {
  newTab: 'new-tab',
  newWindow: 'new-window',
  newIncognitoWindow: 'new-private-window',
  showLittleArc: 'new-little',
  reopenLastClosedTab: 'reopen-tab',
  addressBar: 'open-location',
  newNote: 'new-note',
  newEasel: 'new-easel',
  archiveTab: 'close-tab',
  closeWindow: 'close-window',
  capturePage: 'capture',
  captureFullPage: 'capture-full-page',
  savePageAs: 'save-page',
  printPage: 'print',
  share: 'share',
  copyCurrentURL: 'copy-url',
  copyCurrentURLMarkdown: 'copy-markdown',
  copyCurrentURLAsQuote: 'copy-quote',
  find: 'find',
  findNext: 'find-next',
  findPrevious: 'find-previous',
  showSidebar: 'toggle-sidebar',
  stopLoading: 'stop',
  reloadPage: 'reload',
  forceReloadPage: 'hard-reload',
  clearCookies: 'clear-cookies-reload',
  addSplitView: 'split',
  removeSplitView: 'close-split',
  resetZoom: 'zoom-reset',
  zoomIn: 'zoom-in',
  zoomOut: 'zoom-out',
  viewSource: 'view-source',
  developerTools: 'devtools',
  inspectElements: 'inspect',
  javaScriptConsole: 'console',
  newSpace: 'new-space',
  focusNextSpace: 'next-space',
  focusPreviousSpace: 'previous-space',
  pinTab: 'toggle-pin',
  duplicate: 'duplicate-tab',
  openTabIn: 'open-in',
  selectNextTab: 'next-tab',
  selectPreviousTab: 'previous-tab',
  nextTab: 'next-tab-bracket',
  previousTab: 'previous-tab-bracket',
  cycleNextTab: 'recent-tab',
  cyclePreviousTab: 'previous-tab-ctrl',
  resetTab: 'reset-tab',
  resetSpace: 'reset-space',
  clearExplore: 'clear-today',
  goBack: 'back',
  goForward: 'forward',
  viewHistory: 'history',
  viewArchive: 'archive',
  clearArchive: 'clear-archive',
  viewLibrary: 'library',
  viewDownloads: 'downloads',
  viewPreferences: 'settings',
}

const COMMAND = 1 << 20
const OPTION = 1 << 19
const CONTROL = 1 << 18
const SHIFT = 1 << 17

const SHIFTED: Record<string, string> = {
  '{': '[',
  '}': ']',
  _: '-',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
  '|': '\\',
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
}

const NAMED: Record<string, string> = {
  '↑': 'Up',
  '↓': 'Down',
  '←': 'Left',
  '→': 'Right',
  '': 'Up',
  '': 'Down',
  '': 'Left',
  '': 'Right',
  '\t': 'Tab',
  ' ': 'Space',
  '\r': 'Return',
  '+': 'Plus',
  '': 'Home',
  '': 'End',
  '': 'PageUp',
  '': 'PageDown',
}

function keyOf(keyEquivalent: string): { key: string; shift: boolean } | null {
  const named = NAMED[keyEquivalent]
  if (named) return { key: named, shift: false }
  const code = keyEquivalent.codePointAt(0) ?? 0
  if (keyEquivalent.length === 1 && code >= 0xf704 && code <= 0xf71b)
    return { key: `F${code - 0xf703}`, shift: false }
  const shifted = SHIFTED[keyEquivalent]
  if (shifted) return { key: shifted, shift: true }
  if (/^[A-Z]$/.test(keyEquivalent)) return { key: keyEquivalent, shift: true }
  if (/^[a-z0-9[\]=\-;',./\\`]$/.test(keyEquivalent))
    return { key: keyEquivalent.toUpperCase(), shift: false }
  return null
}

export function arcAccelerator(keyEquivalent: string, flags: number): string | null {
  const parsed = keyOf(keyEquivalent)
  if (!parsed) return null
  const parts = [
    flags & COMMAND ? 'CmdOrCtrl' : null,
    flags & CONTROL ? 'Ctrl' : null,
    flags & OPTION ? 'Alt' : null,
    flags & SHIFT || parsed.shift ? 'Shift' : null,
  ].filter((part) => part !== null)
  const accelerator = [...parts, parsed.key].join('+')
  return isAccelerator(accelerator) ? accelerator : null
}

const shortcutSchema = z.object({
  keyEquivalent: z.string().min(1).max(4),
  deviceIndependentModifierFlags: z.number().int().nonnegative(),
})

const overrideSchema = z.object({
  action: z.object({ identifier: z.string() }),
  state: z.union([
    z.object({ unset: z.unknown() }).transform(() => ({ readable: true, accelerator: null })),
    z.object({ valid: z.object({ _0: shortcutSchema }) }).transform(({ valid }) => {
      const accelerator = arcAccelerator(
        valid._0.keyEquivalent,
        valid._0.deviceIndependentModifierFlags,
      )
      return { readable: accelerator !== null, accelerator }
    }),
  ]),
})

const fileSchema = z.object({ userOverrides: z.array(z.unknown()) })

export function parseArcKeyBindings(json: unknown): ShortcutOverrides {
  const file = fileSchema.safeParse(json)
  if (!file.success) return {}
  const overrides: ShortcutOverrides = {}
  for (const entry of file.data.userOverrides) {
    const parsed = overrideSchema.safeParse(entry)
    if (!parsed.success) continue
    const id = arcActionIds[parsed.data.action.identifier]
    const { readable, accelerator } = parsed.data.state
    if (id && readable) overrides[id] = accelerator
  }
  return overrides
}

export function mergeArcShortcuts(
  current: ShortcutOverrides,
  imported: ShortcutOverrides,
  platform: Platform,
): ShortcutOverrides {
  const defaults = shortcuts(platform)
  const known = new Set(defaults.map((shortcut) => shortcut.id))
  const reserved = new Set(
    reservedShortcuts(platform).flatMap((item) =>
      item.accelerator ? [canonicalAccelerator(item.accelerator, platform)] : [],
    ),
  )
  const merged: ShortcutOverrides = { ...current }
  for (const [id, accelerator] of Object.entries(imported)) {
    if (!known.has(id)) continue
    if (accelerator && reserved.has(canonicalAccelerator(accelerator, platform))) continue
    merged[id] = accelerator
  }
  for (const shortcut of withOverrides(defaults, merged)) {
    if (Object.hasOwn(imported, shortcut.id) || !shortcut.accelerator) continue
    const key = canonicalAccelerator(shortcut.accelerator, platform)
    const taken = Object.entries(imported).some(
      ([id, accelerator]) =>
        id !== shortcut.id &&
        merged[id] === accelerator &&
        accelerator !== null &&
        canonicalAccelerator(accelerator, platform) === key,
    )
    if (taken) merged[shortcut.id] = null
  }
  return merged
}
