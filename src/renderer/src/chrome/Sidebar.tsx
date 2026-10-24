import { ArrowLeft, ArrowRight, PanelLeft, Plus, RotateCw, X, Shield } from 'lucide-react'
import { useRef, type WheelEvent } from 'react'
import { getTab } from '@shared/state/tree'
import { displayUrl } from '@shared/url'
import { profilePartition } from '@shared/extensions'
import { internalPage } from '@shared/pages'
import { isPrivateProfile } from '@shared/state/private'
import { ante, isMac } from '../ante'
import { IconButton } from '../components/IconButton'
import { useAppState, useWindowData } from '../store'
import { DragLayer } from './DragLayer'
import { dropZone } from './dropTargets'
import { Favorites, FavoritesDrop } from './Favorites'
import { ItemList } from './ItemList'
import { selectActiveId } from './selectors'
import { MiniPlayer } from './MiniPlayer'
import { onRowKeyDown } from './rowKeys'
import styles from './Sidebar.module.css'
import { SpaceBar } from './SpaceBar'
import { SpaceHeader } from './SpaceHeader'

const SWIPE_THRESHOLD = 90

function pageLabel(url: string): string | null {
  const page = internalPage(url)
  if (!page) return null
  return page.kind === 'note' ? 'Note' : 'Easel'
}

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
  const space = useAppState((state) => (window ? state.data.spaces[window.spaceId] : undefined))
  const activeTab = useAppState((state) => getTab(state.data, selectActiveId(state)))
  const activeRuntime = useAppState((state) => {
    const id = selectActiveId(state)
    return id ? state.runtime.tabs[id] : undefined
  })
  const hasFavorites = useAppState((state) =>
    space ? (state.data.favorites[space.profileId] ?? []).length > 0 : false,
  )
  const underControls = useAppState(
    (state) => !isMac && !floating && state.data.settings.sidebarSide === 'right',
  )
  const onWheel = useSpaceSwipe()
  if (!window) return null

  return (
    <aside
      className={[styles.sidebar, floating && styles.floating].filter(Boolean).join(' ')}
      onWheel={onWheel}
    >
      <header
        className={[
          styles.toolbar,
          isMac && styles.toolbarMac,
          underControls && styles.toolbarControls,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <IconButton
          label="Toggle sidebar"
          onClick={() => ante.command({ type: 'window/toggleSidebar' })}
        >
          <PanelLeft size={16} />
        </IconButton>
        <div className={styles.toolbarSpacer}>
          {space && !isPrivateProfile(space.profileId) && (
            <browser-action-list
              className={styles.extensions}
              partition={profilePartition(space.profileId)}
              alignment="bottom left"
            />
          )}
        </div>
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
            {activeTab
              ? (pageLabel(activeTab.url) ?? displayUrl(activeTab.url))
              : 'Search or enter address'}
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
        {space && !hasFavorites && <FavoritesDrop profileId={space.profileId} />}
      </div>

      {space && <Favorites profileId={space.profileId} />}

      <div className={styles.scroll} data-drag-scroll onKeyDown={onRowKeyDown}>
        {space && (
          <div key={space.id} className={styles.spaceContent}>
            <SpaceHeader space={space} />
            <ItemList ids={space.pinned} persistent />
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
              data-row
              {...dropZone({
                placement: { to: { type: 'today', spaceId: space.id }, index: 0 },
                line: 'bottom',
              })}
              onClick={() => ante.command({ type: 'commandBar/open', mode: 'new' })}
            >
              <Plus size={15} />
              <span className={styles.title}>New Tab</span>
            </button>
            <ItemList ids={space.today} persistent={false} />
          </div>
        )}
      </div>

      <MiniPlayer />
      <SpaceBar />
      <DragLayer />
    </aside>
  )
}
