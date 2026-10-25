import { app, globalShortcut } from 'electron'
import { withOverrides } from '@shared/keys'
import { shortcuts } from '@shared/shortcuts'
import type { Store } from './store'

export function littleAccelerator(store: Store): string | null {
  const { settings } = store.state.data
  if (process.platform !== 'darwin' || !settings.globalLittle) return null
  const list = withOverrides(shortcuts('darwin'), settings.shortcuts)
  return list.find((shortcut) => shortcut.id === 'new-little')?.accelerator ?? null
}

export interface GlobalLittle {
  pause: (paused: boolean) => void
}

export function startGlobalLittle(store: Store, openLittle: () => void): GlobalLittle {
  let attempted: string | null = null
  let registered: string | null = null
  let paused = false
  const open = () => {
    app.focus({ steal: true })
    openLittle()
  }
  const sync = () => {
    const wanted = paused ? null : littleAccelerator(store)
    if (wanted === attempted) return
    attempted = wanted
    if (registered) globalShortcut.unregister(registered)
    registered = null
    if (!wanted) return
    try {
      if (globalShortcut.register(wanted, open)) registered = wanted
    } catch (error) {
      console.error('[shortcuts] could not register', wanted, error)
    }
  }
  sync()
  store.subscribe(sync)
  app.on('will-quit', () => globalShortcut.unregisterAll())
  return {
    pause: (next) => {
      paused = next
      sync()
    },
  }
}
