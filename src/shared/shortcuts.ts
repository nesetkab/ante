import { CHROME_WEB_STORE_URL } from './extensions'
import type { Command } from './commands'

export type MenuSection = 'file' | 'edit' | 'view' | 'go' | 'tab' | 'space'

export interface Shortcut {
  id: string
  label: string
  section: MenuSection
  command: Command
  accelerator?: string
  hidden?: boolean
}

export type Platform = 'darwin' | 'win32' | 'linux'

const numbered = (count: number, build: (n: number) => Shortcut): Shortcut[] =>
  Array.from({ length: count }, (_, index) => build(index + 1))

export function shortcuts(platform: Platform): Shortcut[] {
  const spaceModifier = platform === 'darwin' ? 'Ctrl' : 'Alt'
  return [
    {
      id: 'new-tab',
      label: 'New Tab',
      section: 'file',
      accelerator: 'CmdOrCtrl+T',
      command: { type: 'commandBar/open', mode: 'new' },
    },
    {
      id: 'new-window',
      label: 'New Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+N',
      command: { type: 'window/new' },
    },
    {
      id: 'new-little',
      label: 'New Little Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+Alt+N',
      command: { type: 'window/little' },
    },
    {
      id: 'open-location',
      label: 'Open Location',
      section: 'file',
      accelerator: 'CmdOrCtrl+L',
      command: { type: 'commandBar/open', mode: 'edit' },
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      section: 'file',
      accelerator: 'CmdOrCtrl+W',
      command: { type: 'tab/close' },
    },
    {
      id: 'close-window',
      label: 'Close Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+W',
      command: { type: 'window/close' },
    },
    {
      id: 'reopen-tab',
      label: 'Reopen Closed Tab',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+T',
      command: { type: 'tab/reopenClosed' },
    },
    {
      id: 'copy-url',
      label: 'Copy URL',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+C',
      command: { type: 'tab/copyUrl' },
    },

    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      section: 'view',
      accelerator: 'CmdOrCtrl+S',
      command: { type: 'window/toggleSidebar' },
    },
    {
      id: 'reload',
      label: 'Reload Page',
      section: 'view',
      accelerator: 'CmdOrCtrl+R',
      command: { type: 'tab/reload' },
    },
    {
      id: 'hard-reload',
      label: 'Hard Reload',
      section: 'view',
      accelerator: 'CmdOrCtrl+Shift+R',
      command: { type: 'tab/reload', hard: true },
    },
    {
      id: 'zoom-in',
      label: 'Zoom In',
      section: 'view',
      accelerator: 'CmdOrCtrl+=',
      command: { type: 'tab/zoom', delta: 1 },
    },
    {
      id: 'zoom-in-plus',
      label: 'Zoom In',
      section: 'view',
      accelerator: 'CmdOrCtrl+Plus',
      command: { type: 'tab/zoom', delta: 1 },
      hidden: true,
    },
    {
      id: 'zoom-out',
      label: 'Zoom Out',
      section: 'view',
      accelerator: 'CmdOrCtrl+-',
      command: { type: 'tab/zoom', delta: -1 },
    },
    {
      id: 'zoom-reset',
      label: 'Actual Size',
      section: 'view',
      accelerator: 'CmdOrCtrl+0',
      command: { type: 'tab/zoom', delta: 0 },
    },
    {
      id: 'devtools',
      label: 'Developer Tools',
      section: 'view',
      accelerator: 'CmdOrCtrl+Alt+I',
      command: { type: 'tab/devtools' },
    },

    {
      id: 'back',
      label: 'Back',
      section: 'go',
      accelerator: 'CmdOrCtrl+[',
      command: { type: 'tab/back' },
    },
    {
      id: 'forward',
      label: 'Forward',
      section: 'go',
      accelerator: 'CmdOrCtrl+]',
      command: { type: 'tab/forward' },
    },

    {
      id: 'toggle-pin',
      label: 'Pin or Unpin Tab',
      section: 'tab',
      accelerator: 'CmdOrCtrl+D',
      command: { type: 'tab/togglePin' },
    },
    {
      id: 'duplicate-tab',
      label: 'Duplicate Tab',
      section: 'tab',
      accelerator: 'Alt+Shift+D',
      command: { type: 'tab/duplicate' },
    },
    {
      id: 'split',
      label: 'Add Split View',
      section: 'tab',
      accelerator: 'CmdOrCtrl+Alt+=',
      command: { type: 'split/add' },
    },
    {
      id: 'mute-tab',
      label: 'Mute or Unmute Tab',
      section: 'tab',
      accelerator: 'CmdOrCtrl+Shift+M',
      command: { type: 'tab/toggleMute' },
    },
    {
      id: 'reset-tab',
      label: 'Go Back to Pinned URL',
      section: 'tab',
      command: { type: 'tab/resetToSaved' },
    },
    {
      id: 'next-tab',
      label: 'Next Tab',
      section: 'tab',
      accelerator: 'CmdOrCtrl+Alt+Down',
      command: { type: 'tab/next' },
    },
    {
      id: 'previous-tab',
      label: 'Previous Tab',
      section: 'tab',
      accelerator: 'CmdOrCtrl+Alt+Up',
      command: { type: 'tab/previous' },
    },
    {
      id: 'recent-tab',
      label: 'Switch to Last Tab',
      section: 'tab',
      accelerator: 'Ctrl+Tab',
      command: { type: 'tab/recent' },
      hidden: true,
    },
    {
      id: 'previous-tab-ctrl',
      label: 'Previous Tab',
      section: 'tab',
      accelerator: 'Ctrl+Shift+Tab',
      command: { type: 'tab/previous' },
      hidden: true,
    },
    ...numbered(8, (n) => ({
      id: `tab-${n}`,
      label: `Tab ${n}`,
      section: 'tab' as const,
      accelerator: `CmdOrCtrl+${n}`,
      command: { type: 'tab/nth' as const, index: n - 1 },
      hidden: true,
    })),
    {
      id: 'last-tab',
      label: 'Last Tab',
      section: 'tab',
      accelerator: 'CmdOrCtrl+9',
      command: { type: 'tab/last' },
      hidden: true,
    },

    {
      id: 'next-space',
      label: 'Next Space',
      section: 'space',
      accelerator: 'CmdOrCtrl+Alt+Right',
      command: { type: 'space/next' },
    },
    {
      id: 'previous-space',
      label: 'Previous Space',
      section: 'space',
      accelerator: 'CmdOrCtrl+Alt+Left',
      command: { type: 'space/previous' },
    },
    { id: 'new-space', label: 'New Space', section: 'space', command: { type: 'space/new' } },
    {
      id: 'clear-today',
      label: 'Clear Today Tabs',
      section: 'space',
      accelerator: 'CmdOrCtrl+Shift+K',
      command: { type: 'space/clearToday' },
    },
    ...numbered(9, (n) => ({
      id: `space-${n}`,
      label: `Space ${n}`,
      section: 'space' as const,
      accelerator: `${spaceModifier}+${n}`,
      command: { type: 'space/nth' as const, index: n - 1 },
      hidden: true,
    })),
    {
      id: 'import-arc',
      label: 'Import from Arc',
      section: 'file',
      command: { type: 'import/arc' },
    },
    {
      id: 'library',
      label: 'Library',
      section: 'view',
      accelerator: 'CmdOrCtrl+Y',
      command: { type: 'library/open' },
    },
    {
      id: 'history',
      label: 'History',
      section: 'view',
      command: { type: 'library/open', section: 'history' },
    },
    {
      id: 'downloads',
      label: 'Downloads',
      section: 'view',
      accelerator: 'CmdOrCtrl+Alt+L',
      command: { type: 'library/open', section: 'downloads' },
    },
    {
      id: 'archive',
      label: 'Archived Tabs',
      section: 'view',
      command: { type: 'library/open', section: 'archive' },
    },
    { id: 'boost-site', label: 'Boost This Site', section: 'tab', command: { type: 'boost/open' } },
    {
      id: 'air-traffic-control',
      label: 'Air Traffic Control',
      section: 'space',
      command: { type: 'routes/open' },
    },
    {
      id: 'new-note',
      label: 'New Note',
      section: 'file',
      accelerator: 'CmdOrCtrl+Alt+Shift+N',
      command: { type: 'note/new' },
    },
    {
      id: 'follow-site',
      label: 'Follow This Site',
      section: 'tab',
      command: { type: 'feed/follow' },
    },
    {
      id: 'new-easel',
      label: 'New Easel',
      section: 'file',
      command: { type: 'easel/new' },
    },
    {
      id: 'capture',
      label: 'Capture',
      section: 'tab',
      accelerator: 'CmdOrCtrl+Shift+2',
      command: { type: 'capture/start' },
    },
    {
      id: 'web-store',
      label: 'Chrome Web Store',
      section: 'file',
      command: { type: 'open', input: CHROME_WEB_STORE_URL, disposition: 'newTab' },
    },
    {
      id: 'default-browser',
      label: 'Set Ante as Default Browser',
      section: 'file',
      command: { type: 'browser/setDefault' },
    },
    {
      id: 'new-private-window',
      label: 'New Private Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+N',
      command: { type: 'window/newPrivate' },
    },
    {
      id: 'find',
      label: 'Find…',
      section: 'edit',
      accelerator: 'CmdOrCtrl+F',
      command: { type: 'find/open' },
    },
    {
      id: 'find-next',
      label: 'Find Next',
      section: 'edit',
      accelerator: 'CmdOrCtrl+G',
      command: { type: 'find/step', forward: true },
    },
    {
      id: 'find-previous',
      label: 'Find Previous',
      section: 'edit',
      accelerator: 'CmdOrCtrl+Shift+G',
      command: { type: 'find/step', forward: false },
    },
    {
      id: 'settings',
      label: 'Settings…',
      section: 'file',
      ...(platform === 'darwin' ? {} : { accelerator: 'Ctrl+,' }),
      command: { type: 'settings/open' },
    },
  ]
}
