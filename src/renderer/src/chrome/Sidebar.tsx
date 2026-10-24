import { ArrowLeft, ArrowRight, PanelLeft, Plus, RotateCw, X, Shield } from 'lucide-react'
import { useRef, type WheelEvent } from 'react'
import { activeTabId, getTab } from '@shared/state/tree'
import { displayUrl } from '@shared/url'
import { ante, isMac } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppState, useWindowData } from '../store'
import { DragLayer } from './DragLayer'
import { dropZone } from './dropTargets'
import { Favorites, FavoritesDrop } from './Favorites'
import { ItemList } from './ItemList'
import styles from './Sidebar.module.css'
import { SpaceBar } from './SpaceBar'
import { SpaceHeader } from './SpaceHeader'

const SWIPE_THRESHOLD = 90

function useSpaceSwipe() {
  const accumulated = useRef(0)
  const locked = useRef(false)
  return (event: WheelEvent) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
    if (locked.current) return
    accumulated.current += event.deltaX
    if (Math.abs(accumulated.current) < SWIPE_THRESHOLD) return
    ante.command({ type: accumulated.current > 0 ? 'space/next' : 'space/previous' })
    accumulated.current = 0
    locked.current = true
    window.setTimeout(() => {
      locked.current = false
    }, 450)
  }
}

export function Sidebar({ floating = false }: { floating?: boolean }) {
  const window = useWindowData()
  const data = useAppState((state) => state.data)
  const runtime = useAppState((state) => state.runtime)
  const onWheel = useSpaceSwipe()
  if (!window) return null

  const space = data.spaces[window.spaceId]
  const activeId = activeTabId(data, window)
  const activeTab = getTab(data, activeId)
  const activeRuntime = activeId ? runtime.tabs[activeId] : undefined

  return (
    <aside
      className={[styles.sidebar, floating && styles.floating].filter(Boolean).join(' ')}
      onWheel={onWheel}
    >
      <header className={[styles.toolbar, isMac && styles.toolbarMac].filter(Boolean).join(' ')}>
        <IconButton
          label="Toggle sidebar"
          onClick={() => ante.command({ type: 'window/toggleSidebar' })}
        >
          <PanelLeft size={16} />
        </IconButton>
        <div className={styles.toolbarSpacer} />
        <IconButton
          label="Back"
          disabled={!activeRuntime?.canGoBack}
          onClick={() => ante.command({ type: 'tab/back' })}
        >
          <ArrowLeft size={16} />
        </IconButton>
        <IconButton
          label="Forward"
          disabled={!activeRuntime?.canGoForward}
          onClick={() => ante.command({ type: 'tab/forward' })}
        >
          <ArrowRight size={16} />
        </IconButton>
        {activeRuntime?.loading ? (
          <IconButton label="Stop" onClick={() => ante.command({ type: 'tab/stop' })}>
            <X size={16} />
          </IconButton>
        ) : (
          <IconButton
            label="Reload"
            disabled={!activeTab}
            onClick={() => ante.command({ type: 'tab/reload' })}
          >
            <RotateCw size={15} />
          </IconButton>
        )}
      </header>

      <div className={styles.addressSlot}>
        <button
          type="button"
          className={styles.address}
          onClick={() =>
            ante.command({ type: 'commandBar/open', mode: activeTab ? 'edit' : 'new' })
          }
        >
          <span className={styles.addressText}>
            {activeTab ? displayUrl(activeTab.url) : 'Search or enter address'}
          </span>
        </button>
        {activeTab && /^https?:/.test(activeTab.url) && (
          <button
            type="button"
            className={styles.shield}
            title="Site privacy"
            onClick={() => ante.command({ type: 'privacy/siteMenu', tabId: activeTab.id })}
          >
            <Shield size={13} />
            {(activeRuntime?.blocked ?? 0) > 0 && <span>{activeRuntime?.blocked}</span>}
          </button>
        )}
        {space && (data.favorites[space.profileId] ?? []).length === 0 && (
          <FavoritesDrop profileId={space.profileId} />
        )}
      </div>

      {space && (
        <Favorites data={data} runtime={runtime} profileId={space.profileId} activeId={activeId} />
      )}

      <div className={styles.scroll} data-drag-scroll>
        {space && (
          <>
            <SpaceHeader space={space} />
            <ItemList
              ids={space.pinned}
              data={data}
              runtime={runtime}
              activeId={activeId}
              persistent
            />
            <div
              className={styles.todayDivider}
              {...dropZone({
                placement: {
                  to: { type: 'pinned', spaceId: space.id },
                  index: space.pinned.length,
                },
                line: 'top',
              })}
            >
              <span className={styles.dividerLine} />
              {space.today.length > 0 && (
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => ante.command({ type: 'space/clearToday' })}
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="button"
              className={[styles.row, styles.newTab].join(' ')}
              {...dropZone({
                placement: { to: { type: 'today', spaceId: space.id }, index: 0 },
                line: 'bottom',
              })}
              onClick={() => ante.command({ type: 'commandBar/open', mode: 'new' })}
            >
              <Plus size={15} />
              <span className={styles.title}>New Tab</span>
            </button>
            <ItemList
              ids={space.today}
              data={data}
              runtime={runtime}
              activeId={activeId}
              persistent={false}
            />
          </>
        )}
      </div>

      <SpaceBar />
      <DragLayer />
    </aside>
  )
}
