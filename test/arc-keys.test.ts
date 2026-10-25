import { describe, expect, it } from 'vitest'
import { withOverrides } from '@shared/keys'
import { arcAccelerator, mergeArcShortcuts, parseArcKeyBindings } from '@shared/importers/arcKeys'
import { shortcuts } from '@shared/shortcuts'

const CMD = 1048576
const OPT = 524288
const CTRL = 262144
const SHIFT = 131072

const override = (identifier: string, state: object) => ({
  action: { identifier, name: identifier },
  source: 'userDefined',
  priority: 'low',
  state,
})

const set = (keyEquivalent: string, flags: number) => ({
  valid: { _0: { keyEquivalent, deviceIndependentModifierFlags: flags } },
})

describe('arcAccelerator', () => {
  it('reads Cocoa key equivalents', () => {
    expect(arcAccelerator('[', CMD)).toBe('CmdOrCtrl+[')
    expect(arcAccelerator('}', CMD)).toBe('CmdOrCtrl+Shift+]')
    expect(arcAccelerator('N', CTRL)).toBe('Ctrl+Shift+N')
    expect(arcAccelerator('↑', CMD | OPT)).toBe('CmdOrCtrl+Alt+Up')
    expect(arcAccelerator('', 0)).toBe('F1')
    expect(arcAccelerator('t', CMD | SHIFT)).toBe('CmdOrCtrl+Shift+T')
    expect(arcAccelerator('=', CTRL | SHIFT)).toBe('Ctrl+Shift+=')
  })

  it('rejects keys without a modifier or that it cannot read', () => {
    expect(arcAccelerator('a', 0)).toBeNull()
    expect(arcAccelerator('é', CMD)).toBeNull()
  })
})

describe('parseArcKeyBindings', () => {
  const file = {
    version: 1,
    userOverrides: [
      override('goBack', { unset: {} }),
      override('nextTab', set(']', CMD)),
      override('goForward', { unset: {} }),
      override('selectPreviousTab', set('[', CMD)),
      override('gptMessage', set('g', CMD)),
      override('newTab', set('é', CMD)),
      'junk',
    ],
  }

  it('maps Arc actions to Ante shortcuts and skips unknown ones', () => {
    expect(parseArcKeyBindings(file)).toEqual({
      back: null,
      'next-tab-bracket': 'CmdOrCtrl+]',
      forward: null,
      'previous-tab': 'CmdOrCtrl+[',
    })
    expect(parseArcKeyBindings(null)).toEqual({})
  })

  it('makes the imported keys work without clashing', () => {
    const merged = mergeArcShortcuts({}, parseArcKeyBindings(file), 'darwin')
    const active = withOverrides(shortcuts('darwin'), merged)
    const keyOf = (id: string) => active.find((shortcut) => shortcut.id === id)?.accelerator
    expect(keyOf('next-tab-bracket')).toBe('CmdOrCtrl+]')
    expect(keyOf('previous-tab')).toBe('CmdOrCtrl+[')
    expect(keyOf('back')).toBeUndefined()
    expect(keyOf('forward')).toBeUndefined()
  })

  it('frees a key another shortcut was using', () => {
    const merged = mergeArcShortcuts({}, { 'new-note': 'CmdOrCtrl+D' }, 'darwin')
    expect(merged).toEqual({ 'new-note': 'CmdOrCtrl+D', 'toggle-pin': null })
  })

  it('ignores keys the system menus own', () => {
    expect(mergeArcShortcuts({}, { 'new-tab': 'CmdOrCtrl+Q' }, 'darwin')).toEqual({})
  })
})
