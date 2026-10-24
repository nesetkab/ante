import { describe, expect, it } from 'vitest'
import { captureFileName, captureTarget } from '@shared/capture'

const panes = [
  { tabId: 'left', rect: { x: 260, y: 8, width: 500, height: 800 } },
  { tabId: 'right', rect: { x: 768, y: 8, width: 500, height: 800 } },
]

describe('captureTarget', () => {
  it('maps a window region into the pane under its center', () => {
    expect(captureTarget(panes, { x: 300, y: 100, width: 200, height: 100 })).toEqual({
      tabId: 'left',
      rect: { x: 40, y: 92, width: 200, height: 100 },
    })
  })

  it('clips the region to the pane edges', () => {
    expect(captureTarget(panes, { x: 200, y: 0, width: 200, height: 100 })?.rect).toEqual({
      x: 0,
      y: 0,
      width: 140,
      height: 92,
    })
  })

  it('ignores regions outside any page', () => {
    expect(captureTarget(panes, { x: 10, y: 10, width: 100, height: 100 })).toBeNull()
  })
})

describe('captureFileName', () => {
  it('names captures by date and time', () => {
    expect(captureFileName(new Date(2026, 9, 24, 9, 5, 3))).toBe(
      'Capture 2026-10-24 at 09.05.03.png',
    )
  })
})
