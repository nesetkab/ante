import { dockedDevtoolsTabId } from '@shared/devtools'
import { computeLayout, type Layout, type Pane } from '@shared/layout'
import { internalPage, type InternalPage } from '@shared/pages'
import { getTab, visibleTabIds } from '@shared/state/tree'
import { windowId } from '../ante'
import { useViewportSize } from '../hooks'
import { useAppSelector } from '../store'

export interface FramePane extends Pane {
  page: InternalPage | null
  problem: boolean
}

export interface WindowLayout {
  layout: Layout
  panes: FramePane[]
  hasTabs: boolean
}

const sameJson = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

export function useWindowLayout(): WindowLayout | null {
  const { width, height } = useViewportSize()
  return useAppSelector((state) => {
    const window = state.data.windows[windowId]
    if (!window) return null
    const devtoolsTabId = dockedDevtoolsTabId(state.data, state.runtime, window)
    const layout = computeLayout({
      width,
      height,
      window,
      data: state.data,
      fullscreenTabId: null,
      devtoolsTabId,
    })
    const panes = layout.panes.map((pane) => {
      const runtime = state.runtime.tabs[pane.tabId]
      return {
        ...pane,
        page: internalPage(getTab(state.data, pane.tabId)?.url ?? ''),
        problem: Boolean(runtime?.error ?? runtime?.crashed),
      }
    })
    return { layout, panes, hasTabs: visibleTabIds(state.data, window).length > 0 }
  }, sameJson)
}
