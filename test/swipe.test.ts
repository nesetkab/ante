import { describe, expect, it } from 'vitest'
import { swipeTracker } from '@shared/swipe'

describe('swipeTracker', () => {
  it('fires once per gesture after enough sideways movement', () => {
    const tracker = swipeTracker(100)
    expect(tracker.push(-40, 0, 0)).toBeNull()
    expect(tracker.push(-40, 2, 10)).toBeNull()
    expect(tracker.push(-40, 1, 20)).toBe('left')
    expect(tracker.push(-80, 0, 30)).toBeNull()
    expect(tracker.push(-80, 0, 200)).toBeNull()
  })

  it('unlocks after the gesture goes quiet', () => {
    const tracker = swipeTracker(100)
    expect(tracker.push(120, 0, 0)).toBe('right')
    expect(tracker.push(120, 0, 100)).toBeNull()
    expect(tracker.push(120, 0, 500)).toBe('right')
  })

  it('ignores mostly vertical scrolling and starts over', () => {
    const tracker = swipeTracker(100)
    expect(tracker.push(-60, 0, 0)).toBeNull()
    expect(tracker.push(-10, 40, 10)).toBeNull()
    expect(tracker.push(-60, 0, 20)).toBeNull()
  })
})
