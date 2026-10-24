import { describe, expect, it } from 'vitest'
import {
  acceleratorFor,
  canonicalAccelerator,
  conflictFor,
  isAccelerator,
  reservedShortcuts,
  withOverrides,
  type KeyPress,
} from '@shared/keys'
import { shortcuts } from '@shared/shortcuts'

const press = (code: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key: '',
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
})

describe('acceleratorFor', () => {
  it('maps mac command to CmdOrCtrl and keeps control separate', () => {
    expect(acceleratorFor(press('KeyK', { metaKey: true, shiftKey: true }), 'darwin')).toBe(
      'CmdOrCtrl+Shift+K',
    )
    expect(acceleratorFor(press('KeyK', { ctrlKey: true }), 'darwin')).toBe('Ctrl+K')
  })

  it('maps control to CmdOrCtrl and the windows key to Super elsewhere', () => {
    expect(acceleratorFor(press('Digit3', { ctrlKey: true, altKey: true }), 'win32')).toBe(
      'CmdOrCtrl+Alt+3',
    )
    expect(acceleratorFor(press('KeyE', { metaKey: true }), 'linux')).toBe('Super+E')
  })

  it('names punctuation and arrows from the physical key', () => {
    expect(acceleratorFor(press('BracketLeft', { metaKey: true }), 'darwin')).toBe('CmdOrCtrl+[')
    expect(acceleratorFor(press('ArrowUp', { metaKey: true, altKey: true }), 'darwin')).toBe(
      'CmdOrCtrl+Alt+Up',
    )
  })

  it('allows bare function keys but not bare letters or shift alone', () => {
    expect(acceleratorFor(press('F5'), 'darwin')).toBe('F5')
    expect(acceleratorFor(press('KeyA'), 'darwin')).toBeNull()
    expect(acceleratorFor(press('KeyA', { shiftKey: true }), 'darwin')).toBeNull()
    expect(acceleratorFor(press('ShiftLeft', { shiftKey: true }), 'darwin')).toBeNull()
    expect(acceleratorFor(press('IntlRo', { metaKey: true }), 'darwin')).toBeNull()
  })
})

describe('isAccelerator', () => {
  it('accepts every built in shortcut', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const)
      for (const shortcut of shortcuts(platform))
        if (shortcut.accelerator) expect(isAccelerator(shortcut.accelerator)).toBe(true)
  })

  it.each(['K', 'Shift+K', 'CmdOrCtrl+Cmd+K', 'CmdOrCtrl+CmdOrCtrl+K', 'Hyper+K', 'CmdOrCtrl+'])(
    'rejects %s',
    (accelerator) => {
      expect(isAccelerator(accelerator)).toBe(false)
    },
  )
})

describe('overrides and conflicts', () => {
  const list = shortcuts('darwin')

  it('replaces or removes accelerators by id', () => {
    const changed = withOverrides(list, { 'new-tab': 'CmdOrCtrl+Shift+Y', reload: null })
    expect(changed.find((shortcut) => shortcut.id === 'new-tab')?.accelerator).toBe(
      'CmdOrCtrl+Shift+Y',
    )
    expect(changed.find((shortcut) => shortcut.id === 'reload')?.accelerator).toBeUndefined()
    expect(changed.find((shortcut) => shortcut.id === 'copy-url')?.accelerator).toBe(
      'CmdOrCtrl+Shift+C',
    )
  })

  it('finds another shortcut using the same keys in any modifier order', () => {
    expect(conflictFor(list, 'reload', 'Shift+CmdOrCtrl+C', 'darwin')?.id).toBe('copy-url')
    expect(conflictFor(list, 'copy-url', 'CmdOrCtrl+Shift+C', 'darwin')).toBeNull()
  })

  it('treats Ctrl and CmdOrCtrl as the same off mac', () => {
    expect(canonicalAccelerator('Ctrl+Shift+t', 'win32')).toBe('CmdOrCtrl+Shift+T')
    expect(canonicalAccelerator('Ctrl+Shift+t', 'darwin')).toBe('Ctrl+Shift+T')
  })
})

describe('keyboard layouts and reserved keys', () => {
  it('records the letter the layout types, not the physical key', () => {
    expect(acceleratorFor(press('KeyQ', { key: 'a', metaKey: true }), 'darwin')).toBe('CmdOrCtrl+A')
    expect(
      acceleratorFor(press('Digit1', { key: '!', metaKey: true, shiftKey: true }), 'darwin'),
    ).toBe('CmdOrCtrl+Shift+1')
    expect(acceleratorFor(press('KeyK', { key: '˚', metaKey: true, altKey: true }), 'darwin')).toBe(
      'CmdOrCtrl+Alt+K',
    )
  })

  it('refuses keys the edit and app menus already use', () => {
    const list = [...shortcuts('darwin'), ...reservedShortcuts('darwin')]
    expect(conflictFor(list, 'new-tab', 'CmdOrCtrl+V', 'darwin')?.label).toBe('Paste')
    expect(conflictFor(list, 'new-tab', 'CmdOrCtrl+Q', 'darwin')?.label).toBe('Quit')
    for (const platform of ['darwin', 'win32', 'linux'] as const)
      for (const item of reservedShortcuts(platform))
        expect(isAccelerator(item.accelerator ?? '')).toBe(true)
  })
})
