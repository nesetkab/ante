import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import type { Command } from '@shared/commands'
import type { AppState, Id } from '@shared/schema'
import type { CommandRunner } from './commands'
import type { Store } from './store'
import type { TabManager } from './tabs'
import type { WindowManager } from './windows'

export interface AutomationContext {
  store: Store
  tabs: TabManager
  windows: WindowManager
  run: (command: Command, windowId?: Id) => void
  waitFor: (predicate: (state: AppState) => boolean, timeoutMs?: number) => Promise<void>
  delay: (ms: number) => Promise<void>
}

interface AutomationDeps {
  store: Store
  tabs: TabManager
  windows: WindowManager
  runner: CommandRunner
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function runAutomation(script: string, deps: AutomationDeps): Promise<void> {
  const { store, runner, windows } = deps
  const context: AutomationContext = {
    store: deps.store,
    tabs: deps.tabs,
    windows: deps.windows,
    run: (command, windowId) => runner.run(windowId ?? windows.focused()?.id ?? null, command),
    delay,
    waitFor: async (predicate, timeoutMs = 15_000) => {
      const deadline = Date.now() + timeoutMs
      while (!predicate(store.state)) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
        await delay(50)
      }
    },
  }
  try {
    const module = (await import(pathToFileURL(script).href)) as {
      default: (context: AutomationContext) => Promise<void>
    }
    await module.default(context)
    console.log('[automation] passed')
    app.exit(0)
  } catch (error) {
    console.error('[automation] failed', error)
    app.exit(1)
  }
}
