import type { UiEvent } from '@shared/ipc'
import { ante } from './ante'

type Listener = (event: UiEvent) => void

const listeners = new Set<Listener>()
let subscribed = false

export function onUiEvent(listener: Listener): () => void {
  listeners.add(listener)
  if (!subscribed) {
    subscribed = true
    ante.onUiEvent((event) => {
      for (const current of listeners) current(event)
    })
  }
  return () => {
    listeners.delete(listener)
  }
}
