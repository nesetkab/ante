import { app, globalShortcut } from 'electron'
import type { Command } from '@shared/commands'
import { withOverrides } from '@shared/keys'
import { shortcuts } from '@shared/shortcuts'
import type { Store } from './store'

export function littleAccelerator(store: Store): string | null {
  const { settings } = store.state.data
  if (process.platform !== 'darwin' || !settings.globalLittle) return null
  const list = withOverrides(shortcuts('darwin'), settings.shortcuts)
  return list.find((shortcut) => shortcut.id === 'new-little')?.accelerator ?? null
}

export function startGlobalLittle(store: Store, run: (command: Command) => void): void {
  let registered: string | null = null
  const sync = () => {
    const wanted = littleAccelerator(store)
    if (wanted === registered) return
    if (registered) globalShortcut.unregister(registered)
    registered = null
    if (!wanted) return
    try {
      const open = () => {
        app.focus({ steal: true })
        run({ type: 'window/little' })
      }
      if (globalShortcut.register(wanted, open)) registered = wanted
    } catch (error) {
      console.error('[shortcuts] could not register', wanted, error)
    }
  }
  sync()
  store.subscribe(sync)
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
