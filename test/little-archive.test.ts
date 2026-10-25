import { describe, expect, it } from 'vitest'
import { closeIdleLittleWindows } from '../src/main/archive'
import type { Store } from '../src/main/store'
import { buildState } from './helpers'

const storeWith = (littleArchiveAfter: '1h' | 'never') => {
  const state = buildState()
  state.data.settings.littleArchiveAfter = littleArchiveAfter
  return { state } as unknown as Store
}

describe('little window archiving', () => {
  const hour = 60 * 60 * 1000
  const window = (kind: string, idle: number, focused = false) => {
    const closed = { value: false }
    return {
      closed,
      window: {
        kind,
        lastActiveAt: 10 * hour - idle,
        focused,
        close: () => {
          closed.value = true
        },
      },
    }
  }

  it('closes little windows left alone longer than the setting', () => {
    const idle = window('little', 2 * hour)
    const fresh = window('little', 10 * 60 * 1000)
    const focused = window('little', 2 * hour, true)
    const main = window('main', 5 * hour)
    closeIdleLittleWindows(
      storeWith('1h'),
      [idle, fresh, focused, main].map((entry) => entry.window),
      10 * hour,
    )
    expect([idle, fresh, focused, main].map((entry) => entry.closed.value)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('keeps them when set to never', () => {
    const idle = window('little', 100 * hour)
    closeIdleLittleWindows(storeWith('never'), [idle.window], 10 * hour)
    expect(idle.closed.value).toBe(false)
  })
})
