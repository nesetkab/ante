import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { Command } from '@shared/commands'
import { shortcuts, type MenuSection, type Platform } from '@shared/shortcuts'

const sectionLabels: Record<Exclude<MenuSection, 'edit'>, string> = {
  file: 'File',
  view: 'View',
  go: 'Go',
  tab: 'Tab',
  space: 'Spaces',
}

export function buildAppMenu(run: (command: Command) => void): Menu {
  const platform = process.platform as Platform
  const isMac = platform === 'darwin'
  const list = shortcuts(platform)
  const itemsFor = (section: MenuSection): MenuItemConstructorOptions[] =>
    list
      .filter((shortcut) => shortcut.section === section)
      .map((shortcut) => ({
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
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => run({ type: 'settings/open' }) },
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
  template.push(
    {
      label: sectionLabels.file,
      submenu: [
        ...itemsFor('file'),
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        ...itemsFor('edit'),
      ],
    },
    {
      label: sectionLabels.view,
      submenu: [...itemsFor('view'), { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    { label: sectionLabels.go, submenu: itemsFor('go') },
    { label: sectionLabels.tab, submenu: itemsFor('tab') },
    { label: sectionLabels.space, submenu: itemsFor('space') },
    { role: 'windowMenu' },
  )
  if (!isMac)
    template.push({
      role: 'help',
      submenu: [{ label: 'Check for Updates…', click: () => run({ type: 'update/check' }) }],
    })
  return Menu.buildFromTemplate(template)
}
