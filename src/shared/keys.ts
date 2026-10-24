import type { Platform, Shortcut } from './shortcuts'

export interface KeyPress {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const NAMED_CODES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Tab: 'Tab',
  Space: 'Space',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

const MODIFIERS = ['CmdOrCtrl', 'Ctrl', 'Alt', 'Shift', 'Super'] as const
const MODIFIER_SET = new Set<string>(MODIFIERS)
const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/
const KEYS = new Set([...Object.values(NAMED_CODES), 'Plus'])

function keyFor(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter?.[1]) return letter[1]
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code)
  if (digit?.[1]) return digit[1]
  if (FUNCTION_KEY.test(code)) return code
  return NAMED_CODES[code] ?? null
}

const TYPED_KEYS = new Set(['[', ']', '=', '-', ',', '.', '/', '\\', ';', "'", '`'])

function typedKey(press: KeyPress): string | null {
  if (press.altKey || press.key.length !== 1) return null
  const upper = press.key.toUpperCase()
  if (/^[A-Z0-9]$/.test(upper)) return upper
  return TYPED_KEYS.has(press.key) ? press.key : null
}

function isKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key) || FUNCTION_KEY.test(key) || KEYS.has(key)
}

export function isAccelerator(accelerator: string): boolean {
  const parts = accelerator.split('+')
  const key = parts.pop()
  if (key === undefined || !isKey(key)) return false
  if (new Set(parts).size !== parts.length) return false
  if (!parts.every((part) => MODIFIER_SET.has(part))) return false
  return FUNCTION_KEY.test(key) || parts.some((part) => part !== 'Shift')
}

export function acceleratorFor(press: KeyPress, platform: Platform): string | null {
  const key = typedKey(press) ?? keyFor(press.code)
  if (!key) return null
  const mac = platform === 'darwin'
  const parts: string[] = []
  if (mac ? press.metaKey : press.ctrlKey) parts.push('CmdOrCtrl')
  if (mac && press.ctrlKey) parts.push('Ctrl')
  if (press.altKey) parts.push('Alt')
  if (press.shiftKey) parts.push('Shift')
  if (!mac && press.metaKey) parts.push('Super')
  const accelerator = [...parts, key].join('+')
  return isAccelerator(accelerator) ? accelerator : null
}

export function canonicalAccelerator(accelerator: string, platform: Platform): string {
  const parts = accelerator.split('+')
  const key = (parts.pop() ?? '').toUpperCase()
  const modifiers = new Set(
    parts.map((part) => (platform !== 'darwin' && part === 'Ctrl' ? 'CmdOrCtrl' : part)),
  )
  return [...MODIFIERS.filter((name) => modifiers.has(name)), key].join('+')
}

export type ShortcutOverrides = Record<string, string | null>

export function withOverrides(list: Shortcut[], overrides: ShortcutOverrides): Shortcut[] {
  return list.map((shortcut) => {
    if (!Object.hasOwn(overrides, shortcut.id)) return shortcut
    const { accelerator: _default, ...rest } = shortcut
    const accelerator = overrides[shortcut.id]
    return accelerator ? { ...rest, accelerator } : rest
  })
}

export interface ReservedShortcut {
  id: string
  label: string
  accelerator?: string
}

export function reservedShortcuts(platform: Platform): ReservedShortcut[] {
  const mac = platform === 'darwin'
  const reserved: [string, string][] = [
    ['Undo', 'CmdOrCtrl+Z'],
    ['Redo', 'CmdOrCtrl+Shift+Z'],
    ['Cut', 'CmdOrCtrl+X'],
    ['Copy', 'CmdOrCtrl+C'],
    ['Paste', 'CmdOrCtrl+V'],
    ['Paste and Match Style', mac ? 'CmdOrCtrl+Alt+Shift+V' : 'CmdOrCtrl+Shift+V'],
    ['Select All', 'CmdOrCtrl+A'],
    ['Minimize', 'CmdOrCtrl+M'],
    ['Full Screen', mac ? 'Ctrl+CmdOrCtrl+F' : 'F11'],
    ...(mac
      ? ([
          ['Settings', 'CmdOrCtrl+,'],
          ['Quit', 'CmdOrCtrl+Q'],
          ['Hide Ante', 'CmdOrCtrl+H'],
          ['Hide Others', 'CmdOrCtrl+Alt+H'],
        ] as [string, string][])
      : []),
    ...(platform === 'win32' ? ([['Redo', 'CmdOrCtrl+Y']] as [string, string][]) : []),
    ...(platform === 'linux' ? ([['Quit', 'CmdOrCtrl+Q']] as [string, string][]) : []),
  ]
  return reserved.map(([label, accelerator]) => ({
    id: `reserved:${label}:${accelerator}`,
    label,
    accelerator,
  }))
}

export function conflictFor(
  list: readonly ReservedShortcut[],
  id: string,
  accelerator: string,
  platform: Platform,
): ReservedShortcut | null {
  const wanted = canonicalAccelerator(accelerator, platform)
  return (
    list.find(
      (shortcut) =>
        shortcut.id !== id &&
        shortcut.accelerator !== undefined &&
        canonicalAccelerator(shortcut.accelerator, platform) === wanted,
    ) ?? null
  )
}
