import { enablePatches, produceWithPatches, type Patch } from 'immer'
import type { AppState } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { reduce } from '@shared/state/reducer'

enablePatches()

export interface Change {
  action: Action
  prev: AppState
  state: AppState
  patches: Patch[]
  version: number
}

type Listener = (change: Change) => void

export class Store {
  #state: AppState
  #version = 0
  #listeners = new Set<Listener>()
  #queue: Change[] = []
  #notifying = false

  constructor(initial: AppState) {
    this.#state = initial
  }

  get state(): AppState {
    return this.#state
  }

  get version(): number {
    return this.#version
  }

  dispatch = (action: Action): void => {
    const [next, patches] = produceWithPatches(this.#state, (draft) => {
      reduce(draft, action)
    })
    if (patches.length === 0) return
    const prev = this.#state
    this.#state = next
    this.#version += 1
    this.#queue.push({ action, prev, state: next, patches, version: this.#version })
    if (this.#notifying) return
    this.#notifying = true
    try {
      for (let change = this.#queue.shift(); change; change = this.#queue.shift()) {
        for (const listener of this.#listeners) listener(change)
      }
    } finally {
      this.#notifying = false
    }
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
}
