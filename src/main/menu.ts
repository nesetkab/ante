import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { Command } from '@shared/commands'
import { withOverrides, type ShortcutOverrides } from '@shared/keys'
import { shortcuts, type MenuSection, type Platform } from '@shared/shortcuts'

const sectionLabels: Record<MenuSection, string> = {
  app: 'Ante',
  file: 'File',
  edit: 'Edit',
  view: 'View',
  space: 'Spaces',
  tab: 'Tabs',
  archive: 'Archive',
  extensions: 'Extensions',
  window: 'Window',
  help: 'Help',
}

export function buildAppMenu(
  run: (command: Command) => void,
  overrides: ShortcutOverrides = {},
): Menu {
  const platform = process.platform as Platform
  const isMac = platform === 'darwin'
  const list = withOverrides(shortcuts(platform), overrides)
  const itemsFor = (section: MenuSection): MenuItemConstructorOptions[] =>
    list
      .filter((shortcut) => shortcut.section === section)
      .map((shortcut) => ({
        id: shortcut.id,
        label: shortcut.label,
        accelerator: shortcut.accelerator,
        visible: !shortcut.hidden,
        ...(shortcut.hidden ? { acceleratorWorksWhenHidden: true } : {}),
        click: () => run(shortcut.command),
      }))

  const template: MenuItemConstructorOptions[] = []
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => run({ type: 'update/check' }) },
        { type: 'separator' },
        ...itemsFor('app'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }
  const menu = (section: MenuSection, extra: MenuItemConstructorOptions[] = []) => ({
    label: sectionLabels[section],
    submenu: [...itemsFor(section), ...extra],
  })
  template.push(
    menu('file', isMac ? [] : [{ type: 'separator' }, ...itemsFor('app'), { role: 'quit' }]),
    {
      label: sectionLabels.edit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle', ...(isMac ? { accelerator: 'Cmd+Shift+V' } : {}) },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        ...itemsFor('edit'),
      ],
    },
    menu('view', [{ type: 'separator' }, { role: 'togglefullscreen' }]),
    menu('space'),
    menu('tab'),
    menu('archive'),
    menu('extensions'),
    {
      label: sectionLabels.window,
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        ...itemsFor('window'),
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
    {
      label: sectionLabels.help,
      role: 'help',
      submenu: [
        ...itemsFor('help'),
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              { label: 'Check for Updates…', click: () => run({ type: 'update/check' }) },
            ]),
      ],
    },
  )
  return Menu.buildFromTemplate(template)
}
