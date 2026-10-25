export const SWIPE_CHANNEL = 'ante:swipe'

export type SwipeDirection = 'left' | 'right'

export const SWIPE_THRESHOLD = 110
const IDLE_MS = 220

export interface SwipeTracker {
  push: (deltaX: number, deltaY: number, now: number) => SwipeDirection | null
  reset: () => void
}

export function swipeTracker(threshold = SWIPE_THRESHOLD): SwipeTracker {
  let total = 0
  let locked = false
  let last = -Infinity
  const reset = () => {
    total = 0
    locked = false
  }
  return {
    reset,
    push: (deltaX, deltaY, now) => {
      if (now - last > IDLE_MS) reset()
      last = now
      if (locked) return null
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 2) {
        total = 0
        return null
      }
      total += deltaX
      if (Math.abs(total) < threshold) return null
      locked = true
      const direction = total < 0 ? 'left' : 'right'
      total = 0
      return direction
    },
  }
}
