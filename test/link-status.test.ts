import { describe, expect, it } from 'vitest'
import { LINK_HEIGHT, LINK_INSET, popoverFor, popoverRect } from '@shared/popover'
import type { AppState } from '@shared/schema'
import { defaultTabRuntime } from '@shared/state/reducer'
import { buildState } from './helpers'

const pane = { x: 260, y: 8, width: 900, height: 700 }

function withHover(state: AppState, hoverUrl: string | null, find = false): AppState {
  return {
    ...state,
    runtime: {
      ...state.runtime,
      tabs: {
        a: {
          ...defaultTabRuntime,
          hoverUrl,
          find: find ? { query: 'x', matches: 0, active: 0, focus: 0 } : null,
        },
      },
    },
  }
}

describe('link status', () => {
  const base = buildState({
    spaces: { s1: { today: ['a'] } },
    windows: { w: { spaceId: 's1', active: 'a' } },
  })
  const window = () => {
    const found = base.data.windows.w
    if (!found) throw new Error('missing window')
    return found
  }

  it('shows the hovered link at the bottom left of the page', () => {
    const state = withHover(base, 'https://example.com/docs')
    const popover = popoverFor(state.data, state.runtime, window())
    expect(popover).toEqual({
      tabId: 'a',
      find: null,
      prompt: null,
      link: 'https://example.com/docs',
    })
    if (!popover) throw new Error('missing popover')
    const rect = popoverRect(pane, popover)
    expect(rect.x).toBe(pane.x + LINK_INSET)
    expect(rect.y).toBe(pane.y + pane.height - LINK_HEIGHT - LINK_INSET)
    expect(rect.height).toBe(LINK_HEIGHT)
    expect(rect.width).toBeGreaterThanOrEqual(120)
    expect(rect.width).toBeLessThanOrEqual(560)
  })

  it('stays out of the way of the find bar and when nothing is hovered', () => {
    expect(popoverFor(base.data, withHover(base, null).runtime, window())).toBeNull()
    const finding = withHover(base, 'https://example.com/', true)
    expect(popoverFor(finding.data, finding.runtime, window())?.link).toBeUndefined()
  })
})
