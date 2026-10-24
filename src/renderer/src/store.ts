import { applyPatches, enablePatches } from 'immer'
import { useRef, useSyncExternalStore } from 'react'
import type { PatchBatch } from '@shared/ipc'
import type { AppState, WindowData, WindowRuntime } from '@shared/schema'
import { ante, windowId } from './ante'

enablePatches()

const RETRY_MS = 500

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
    } catch (error) {
      console.error('[store] snapshot failed, retrying', error)
      window.setTimeout(() => void this.#resync(), RETRY_MS)
      return
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

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((value, index) => Object.is(value, b[index]))
}

export function useAppSelector<T>(
  selector: (state: AppState) => T,
  equal: (a: T, b: T) => boolean = shallowEqual,
): T {
  const cache = useRef<{ value: T } | null>(null)
  return useSyncExternalStore(store.subscribe, () => {
    const state = store.state
    if (!state) throw new Error('State not loaded')
    const next = selector(state)
    const previous = cache.current
    if (previous && equal(previous.value, next)) return previous.value
    cache.current = { value: next }
    return next
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
