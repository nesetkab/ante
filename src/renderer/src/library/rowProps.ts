import type { KeyboardEvent, MouseEvent } from 'react'

interface Modifiers {
  metaKey: boolean
  ctrlKey: boolean
}

export function rowProps(activate: (modifiers: Modifiers) => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: (event: MouseEvent) => activate(event),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      activate(event)
    },
  } as const
}
