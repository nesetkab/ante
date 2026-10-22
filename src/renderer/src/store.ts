import { applyPatches, enablePatches } from 'immer'
import { useSyncExternalStore } from 'react'
import type { PatchBatch } from '@shared/ipc'
import type { AppState, WindowData, WindowRuntime } from '@shared/schema'
import { ante, windowId } from './ante'

enablePatches()

class ClientStore {
  #state: AppState | null = null
  #version = -1
  #listeners = new Set<() => void>()
  #buffer: PatchBatch[] = []
  #syncing = false

  start(): void {
    ante.onPatches((batch) => this.#receive(batch))
    void this.#resync()
  }

  get state(): AppState | null {
    return this.#state
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async #resync(): Promise<void> {
    if (this.#syncing) return
    this.#syncing = true
    try {
      const snapshot = await ante.snapshot()
      this.#state = snapshot.state
      this.#version = snapshot.version
    } finally {
      this.#syncing = false
    }
    const buffered = this.#buffer
    this.#buffer = []
    for (const batch of buffered) this.#receive(batch)
    this.#emit()
  }

  #receive(batch: PatchBatch): void {
    if (this.#syncing || !this.#state) {
      this.#buffer.push(batch)
      return
    }
    if (batch.to <= this.#version) return
    if (batch.from !== this.#version) {
      void this.#resync()
      return
    }
    this.#state = applyPatches(this.#state, batch.patches)
    this.#version = batch.to
    this.#emit()
  }

  #emit(): void {
    for (const listener of this.#listeners) listener()
  }
}

export const store = new ClientStore()

export function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => {
    const state = store.state
    if (!state) throw new Error('State not loaded')
    return selector(state)
  })
}

export function useLoaded(): boolean {
  return useSyncExternalStore(store.subscribe, () => store.state !== null)
}

export function useWindowData(): WindowData | undefined {
  return useAppState((state) => state.data.windows[windowId])
}

export function useWindowRuntime(): WindowRuntime | undefined {
  return useAppState((state) => state.runtime.windows[windowId])
}
