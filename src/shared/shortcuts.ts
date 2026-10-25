import { CHROME_WEB_STORE_URL } from './extensions'
import type { Command } from './commands'

export type MenuSection =
  'app' | 'file' | 'edit' | 'view' | 'space' | 'tab' | 'archive' | 'extensions' | 'window' | 'help'

export interface Shortcut {
  id: string
  label: string
  section: MenuSection
  command: Command
  accelerator?: string
  hidden?: boolean
}

export type Platform = 'darwin' | 'win32' | 'linux'

export const REPO_URL = 'https://github.com/nesetkab/ante'

const numbered = (count: number, build: (n: number) => Shortcut): Shortcut[] =>
  Array.from({ length: count }, (_, index) => build(index + 1))

export function shortcuts(platform: Platform): Shortcut[] {
  const mac = platform === 'darwin'
  const pick = (onMac: string, elsewhere?: string) => (mac ? onMac : elsewhere)
  const spaceModifier = mac ? 'Ctrl' : 'Alt'
  const list: (Shortcut & { accelerator?: string | undefined })[] = [
    {
      id: 'default-browser',
      label: 'Set Ante as Default Browser',
      section: 'app',
      command: { type: 'browser/setDefault' },
    },
    {
      id: 'import-arc',
      label: 'Import from Arc',
      section: 'app',
      command: { type: 'import/arc' },
    },

    {
      id: 'new-tab',
      label: 'New Tab…',
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
      id: 'new-private-window',
      label: 'New Private Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+N',
      command: { type: 'window/newPrivate' },
    },
    {
      id: 'new-little',
      label: 'New Little Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+Alt+N',
      command: { type: 'window/little' },
    },
    {
      id: 'reopen-tab',
      label: 'Restore Last Closed Tab',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+T',
      command: { type: 'tab/reopenClosed' },
    },
    {
      id: 'open-location',
      label: 'Open Command Bar',
      section: 'file',
      accelerator: 'CmdOrCtrl+L',
      command: { type: 'commandBar/open', mode: 'edit' },
    },
    {
      id: 'new-note',
      label: 'New Note',
      section: 'file',
      accelerator: pick('Ctrl+Shift+N', 'CmdOrCtrl+Alt+Shift+N'),
      command: { type: 'note/new' },
    },
    {
      id: 'new-easel',
      label: 'New Easel',
      section: 'file',
      accelerator: pick('Ctrl+Shift+E'),
      command: { type: 'easel/new' },
    },
    {
      id: 'close-window',
      label: 'Close Window',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+W',
      command: { type: 'window/close' },
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      section: 'file',
      accelerator: 'CmdOrCtrl+W',
      command: { type: 'tab/close' },
    },
    ...(mac
      ? [
          {
            id: 'share',
            label: 'Share…',
            section: 'file' as const,
            command: { type: 'tab/share' as const },
          },
        ]
      : []),
    {
      id: 'capture',
      label: 'Capture…',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+2',
      command: { type: 'capture/start' },
    },
    {
      id: 'open-in',
      label: 'Open Peek or Little Window in Space',
      section: 'file',
      accelerator: 'CmdOrCtrl+O',
      command: { type: 'tab/openIn' },
    },
    {
      id: 'open-file',
      label: 'Open File…',
      section: 'file',
      command: { type: 'file/open' },
    },
    {
      id: 'save-page',
      label: 'Save Page As…',
      section: 'file',
      accelerator: 'CmdOrCtrl+Shift+S',
      command: { type: 'tab/savePage' },
    },
    {
      id: 'print',
      label: 'Print…',
      section: 'file',
      accelerator: 'CmdOrCtrl+P',
      command: { type: 'tab/print' },
    },

    {
      id: 'copy-url',
      label: 'Copy URL',
      section: 'edit',
      accelerator: 'CmdOrCtrl+Shift+C',
      command: { type: 'tab/copyUrl' },
    },
    {
      id: 'copy-markdown',
      label: 'Copy URL as Markdown',
      section: 'edit',
      accelerator: 'CmdOrCtrl+Shift+Alt+C',
      command: { type: 'tab/copyUrl', markdown: true },
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
      id: 'toggle-sidebar',
      label: 'Show or Hide Sidebar',
      section: 'view',
      accelerator: 'CmdOrCtrl+S',
      command: { type: 'window/toggleSidebar' },
    },
    {
      id: 'stop',
      label: 'Stop',
      section: 'view',
      accelerator: pick('CmdOrCtrl+.'),
      command: { type: 'tab/stop' },
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
      label: 'Force Reload',
      section: 'view',
      accelerator: 'CmdOrCtrl+Shift+R',
      command: { type: 'tab/reload', hard: true },
    },
    {
      id: 'clear-cookies-reload',
      label: 'Clear Cookies and Reload',
      section: 'view',
      command: { type: 'tab/clearAndReload', clear: 'cookies' },
    },
    {
      id: 'clear-cache-reload',
      label: 'Clear Cache and Reload',
      section: 'view',
      command: { type: 'tab/clearAndReload', clear: 'cache' },
    },
    {
      id: 'split',
      label: 'Add Split View',
      section: 'view',
      accelerator: pick('Ctrl+Shift+=', 'CmdOrCtrl+Alt+='),
      command: { type: 'split/add' },
    },
    {
      id: 'close-split',
      label: 'Close This Split Pane',
      section: 'view',
      accelerator: pick('Ctrl+Shift+-', 'CmdOrCtrl+Alt+-'),
      command: { type: 'split/close' },
    },
    ...numbered(4, (n) => ({
      id: `split-pane-${n}`,
      label: `Split Pane ${n}`,
      section: 'view' as const,
      accelerator: pick(`Ctrl+Shift+${n}`),
      command: { type: 'split/focus' as const, index: n - 1 },
      hidden: true,
    })),
    {
      id: 'split-pane-next',
      label: 'Next Split Pane',
      section: 'view',
      accelerator: pick('Ctrl+Shift+]'),
      command: { type: 'split/focus', delta: 1 },
      hidden: true,
    },
    {
      id: 'split-pane-previous',
      label: 'Previous Split Pane',
      section: 'view',
      accelerator: pick('Ctrl+Shift+['),
      command: { type: 'split/focus', delta: -1 },
      hidden: true,
    },
    {
      id: 'zoom-reset',
      label: 'Actual Size',
      section: 'view',
      accelerator: 'CmdOrCtrl+0',
      command: { type: 'tab/zoom', delta: 0 },
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
      id: 'zoom-out-shift',
      label: 'Zoom Out',
      section: 'view',
      accelerator: 'CmdOrCtrl+Shift+-',
      command: { type: 'tab/zoom', delta: -1 },
      hidden: true,
    },
    {
      id: 'view-source',
      label: 'View Source',
      section: 'view',
      accelerator: pick('CmdOrCtrl+Alt+U', 'Ctrl+U'),
      command: { type: 'tab/viewSource' },
    },
    {
      id: 'devtools',
      label: 'Developer Tools',
      section: 'view',
      accelerator: pick('CmdOrCtrl+Alt+I', 'Ctrl+Shift+I'),
      command: { type: 'tab/devtools' },
    },
    {
      id: 'devtools-f12',
      label: 'Developer Tools',
      section: 'view',
      accelerator: 'F12',
      command: { type: 'tab/devtools' },
      hidden: true,
    },
    {
      id: 'inspect',
      label: 'Inspect Elements',
      section: 'view',
      accelerator: pick('CmdOrCtrl+Alt+C'),
      command: { type: 'tab/devtools', panel: 'inspect' },
    },
    {
      id: 'console',
      label: 'JavaScript Console',
      section: 'view',
      accelerator: pick('CmdOrCtrl+Alt+J', 'Ctrl+Shift+J'),
      command: { type: 'tab/devtools', panel: 'console' },
    },

    { id: 'new-space', label: 'New Space', section: 'space', command: { type: 'space/new' } },
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
    ...numbered(9, (n) => ({
      id: `space-${n}`,
      label: `Space ${n}`,
      section: 'space' as const,
      accelerator: `${spaceModifier}+${n}`,
      command: { type: 'space/nth' as const, index: n - 1 },
      hidden: true,
    })),
    {
      id: 'air-traffic-control',
      label: 'Air Traffic Control',
      section: 'space',
      command: { type: 'routes/open' },
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
      command: { type: 'tab/duplicate' },
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
      id: 'next-tab-bracket',
      label: 'Next Tab',
      section: 'tab',
      accelerator: pick('CmdOrCtrl+Shift+]'),
      command: { type: 'tab/next' },
      hidden: true,
    },
    {
      id: 'previous-tab-bracket',
      label: 'Previous Tab',
      section: 'tab',
      accelerator: pick('CmdOrCtrl+Shift+['),
      command: { type: 'tab/previous' },
      hidden: true,
    },
    {
      id: 'recent-tab',
      label: 'Tab Switcher',
      section: 'tab',
      accelerator: 'Ctrl+Tab',
      command: { type: 'tab/switch', delta: 1 },
      hidden: true,
    },
    {
      id: 'previous-tab-ctrl',
      label: 'Tab Switcher Backwards',
      section: 'tab',
      accelerator: 'Ctrl+Shift+Tab',
      command: { type: 'tab/switch', delta: -1 },
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
      id: 'reset-space',
      label: 'Reset All Tabs in This Space',
      section: 'tab',
      command: { type: 'space/resetTabs' },
    },
    {
      id: 'clear-today',
      label: 'Clear Unpinned Tabs',
      section: 'tab',
      accelerator: 'CmdOrCtrl+Shift+K',
      command: { type: 'space/clearToday' },
    },
    { id: 'boost-site', label: 'Boost This Site', section: 'tab', command: { type: 'boost/open' } },
    {
      id: 'follow-site',
      label: 'Follow This Site',
      section: 'tab',
      command: { type: 'feed/follow' },
    },

    {
      id: 'back',
      label: 'Go Back',
      section: 'archive',
      accelerator: 'CmdOrCtrl+[',
      command: { type: 'tab/back' },
    },
    {
      id: 'forward',
      label: 'Go Forward',
      section: 'archive',
      accelerator: 'CmdOrCtrl+]',
      command: { type: 'tab/forward' },
    },
    {
      id: 'history',
      label: 'View History',
      section: 'archive',
      accelerator: pick('CmdOrCtrl+Y', 'Ctrl+H'),
      command: { type: 'library/open', section: 'history' },
    },
    {
      id: 'archive',
      label: 'View Archive',
      section: 'archive',
      command: { type: 'library/open', section: 'archive' },
    },
    {
      id: 'clear-archive',
      label: 'Clear Archive…',
      section: 'archive',
      command: { type: 'archive/clear' },
    },

    {
      id: 'web-store',
      label: 'Add Extension…',
      section: 'extensions',
      command: { type: 'open', input: CHROME_WEB_STORE_URL, disposition: 'newTab' },
    },

    {
      id: 'library',
      label: 'View Library',
      section: 'window',
      accelerator: 'CmdOrCtrl+Shift+L',
      command: { type: 'library/open' },
    },
    {
      id: 'downloads',
      label: 'View Downloads',
      section: 'window',
      accelerator: pick('CmdOrCtrl+Shift+J', 'Ctrl+J'),
      command: { type: 'library/open', section: 'downloads' },
    },
    {
      id: 'notes-library',
      label: 'View Easels & Notes',
      section: 'window',
      command: { type: 'library/open', section: 'pages' },
    },

    {
      id: 'settings',
      label: 'Settings…',
      section: mac ? 'app' : 'file',
      accelerator: 'CmdOrCtrl+,',
      command: { type: 'settings/open' },
    },
    {
      id: 'help-shortcuts',
      label: 'Keyboard Shortcuts',
      section: 'help',
      command: { type: 'settings/open' },
    },
    {
      id: 'help-repo',
      label: 'Ante on GitHub',
      section: 'help',
      command: { type: 'open', input: REPO_URL, disposition: 'newTab' },
    },
    {
      id: 'help-issue',
      label: 'Report an Issue',
      section: 'help',
      command: { type: 'open', input: `${REPO_URL}/issues/new`, disposition: 'newTab' },
    },
  ]
  return list.flatMap(({ accelerator, ...shortcut }) => {
    if (accelerator) return [{ ...shortcut, accelerator }]
    return shortcut.hidden ? [] : [shortcut]
  })
}
