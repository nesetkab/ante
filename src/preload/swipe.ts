import { ipcRenderer } from 'electron'
import { SWIPE_CHANNEL, swipeTracker } from '@shared/swipe'

const tracker = swipeTracker()

function scrollsSideways(event: WheelEvent): boolean {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue
    if (node.scrollWidth <= node.clientWidth + 1) continue
    const root = node === document.scrollingElement
    const overflow = getComputedStyle(node).overflowX
    if (!root && overflow !== 'auto' && overflow !== 'scroll') continue
    if (event.deltaX < 0 && node.scrollLeft > 0) return true
    if (event.deltaX > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1) return true
  }
  return false
}

window.addEventListener(
  'wheel',
  (event) => {
    if (!event.isTrusted) return
    setTimeout(() => {
      if (event.defaultPrevented || event.ctrlKey || scrollsSideways(event)) {
        tracker.reset()
        return
      }
      const direction = tracker.push(event.deltaX, event.deltaY, event.timeStamp)
      if (direction) ipcRenderer.send(SWIPE_CHANNEL, direction === 'left' ? 'back' : 'forward')
    }, 0)
  },
  { passive: true },
)
