import { Copy, RotateCcw, X } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { siteName } from '@shared/passwords'
import { permissionLabels, sitePermissionSchema } from '@shared/permissions'
import {
  customSearchSchema,
  searchEngines,
  type CustomSearch,
  type ArchiveAfter,
  type SearchEngine,
  type Settings,
  type SleepAfter,
  type SyncStatus,
  type UpdateStatus,
} from '@shared/schema'
import { browserNames, type BrowserId } from '@shared/importers/chrome'
import { acceleratorFor, conflictFor, reservedShortcuts, withOverrides } from '@shared/keys'
import { shortcuts, type Platform } from '@shared/shortcuts'
import { isPrivateProfile } from '@shared/state/private'
import { ante, panelParams } from '../ante'
import { Button, Row, Section, Segmented, Select, Toggle } from '../components/Form'
import { IconButton } from '../components/IconButton'
import { useConfirm } from '../library/useConfirm'
import { useAppState } from '../store'
import styles from './Panel.module.css'

const engineLabels: Record<SearchEngine, string> = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
  brave: 'Brave Search',
  kagi: 'Kagi',
  ecosia: 'Ecosia',
  custom: 'Custom…',
}

const archiveOptions: readonly { value: ArchiveAfter; label: string }[] = [
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
]

const sleepChoices: readonly { value: SleepAfter; label: string }[] = [
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: 'never', label: 'Never' },
]

const NO_BROWSERS: readonly BrowserId[] = []

const update = (patch: Partial<Settings>) => ante.dispatch({ type: 'settings/update', patch })

function formatAccelerator(accelerator: string): string {
  if (ante.platform !== 'darwin') return accelerator.replace('CmdOrCtrl', 'Ctrl')
  return accelerator
    .replace('CmdOrCtrl', '⌘')
    .replace('Cmd', '⌘')
    .replace('Ctrl', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replaceAll('+', '')
}

function syncedAgo(lastSyncedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - lastSyncedAt) / 60_000)
  if (minutes < 1) return 'Last synced just now'
  if (minutes < 60) return `Last synced ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last synced ${hours} hour${hours === 1 ? '' : 's'} ago`
  return `Last synced ${new Date(lastSyncedAt).toLocaleDateString()}`
}

function syncHeadline(status: SyncStatus | undefined, now: number): string {
  if (status?.error) return status.error
  if (status?.lastSyncedAt) return syncedAgo(status.lastSyncedAt, now)
  return 'Syncing…'
}

function syncPeers(status: SyncStatus | undefined, deviceName: string): string {
  const devices = status?.devices ?? 0
  const peers =
    devices === 0
      ? 'No other devices yet'
      : `Shared with ${devices} other device${devices === 1 ? '' : 's'}`
  return deviceName ? `${peers}. This device is ${deviceName}.` : `${peers}.`
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function SyncSection() {
  const sync = useAppState((state) => state.data.settings.sync)
  const status = useAppState((state) => state.runtime.sync)
  const now = useNow(30_000)
  const iCloudFolder = status?.iCloudFolder ?? null
  const usingICloud = iCloudFolder !== null && sync.folder === iCloudFolder
  const customFolder = sync.folder !== null && !usingICloud

  return (
    <Section title="Sync">
      {iCloudFolder && (
        <Row
          label="Sync with iCloud Drive"
          hint="Spaces, pinned tabs, favorites and notes stay the same on every Mac"
        >
          <Toggle
            label="Sync with iCloud Drive"
            checked={usingICloud}
            onChange={(on) => ante.command({ type: on ? 'sync/useICloud' : 'sync/stop' })}
          />
        </Row>
      )}
      <Row
        label={customFolder ? 'Sync folder' : 'Sync with a folder'}
        hint={
          customFolder && sync.folder
            ? sync.folder
            : 'Use a folder you already sync with Dropbox, OneDrive or Syncthing'
        }
      >
        <Button onClick={() => ante.command({ type: 'sync/chooseFolder' })}>Choose Folder…</Button>
      </Row>
      {sync.folder && (
        <Row label={syncHeadline(status, now)} hint={syncPeers(status, sync.deviceName)}>
          <Button onClick={() => ante.command({ type: 'sync/now' })}>Sync Now</Button>
          <Button tone="danger" onClick={() => ante.command({ type: 'sync/stop' })}>
            Stop Syncing
          </Button>
        </Row>
      )}
    </Section>
  )
}

function CustomSearchRows({ current }: { current: CustomSearch | null }) {
  const [name, setName] = useState(current?.name ?? '')
  const [url, setUrl] = useState(current?.url ?? '')
  const parsed = customSearchSchema.safeParse({ name, url })
  const invalid = url.trim() !== '' && !parsed.success
  const save = () => {
    if (parsed.success) update({ customSearch: parsed.data })
  }
  return (
    <>
      <Row label="Engine name">
        <input
          className={styles.input}
          value={name}
          placeholder="Startpage"
          aria-label="Search engine name"
          onChange={(event) => setName(event.target.value)}
          onBlur={save}
        />
      </Row>
      <Row
        label="Search address"
        hint={
          invalid
            ? 'Use an http or https address with %s where the search goes'
            : 'Put %s where the search goes'
        }
      >
        <input
          className={styles.input}
          value={url}
          placeholder="https://www.startpage.com/do/search?q=%s"
          aria-label="Search address"
          aria-invalid={invalid}
          spellCheck={false}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={save}
        />
      </Row>
    </>
  )
}

const platform = ante.platform as Platform

function ShortcutsSection() {
  const overrides = useAppState((state) => state.data.settings.shortcuts)
  const [recording, setRecording] = useState<string | null>(null)
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null)
  const defaults = shortcuts(platform)
  const all = withOverrides(defaults, overrides)

  useEffect(() => {
    if (!recording) return
    ante.command({ type: 'shortcuts/recording', recording: true })
    return () => ante.command({ type: 'shortcuts/recording', recording: false })
  }, [recording])

  const save = (id: string, accelerator: string | null) => {
    const fallback = defaults.find((shortcut) => shortcut.id === id)?.accelerator ?? null
    const rest = Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== id))
    update({ shortcuts: accelerator === fallback ? rest : { ...rest, [id]: accelerator } })
    setRecording(null)
    setProblem(null)
  }

  const onKeyDown = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    if (event.key === 'Escape' && plain) {
      setRecording(null)
      setProblem(null)
      return
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && plain) {
      save(id, null)
      return
    }
    const accelerator = acceleratorFor(event, platform)
    if (!accelerator) return
    const conflict = conflictFor(
      [...all, ...reservedShortcuts(platform)],
      id,
      accelerator,
      platform,
    )
    if (conflict) {
      setProblem({ id, message: `${formatAccelerator(accelerator)} is used by ${conflict.label}` })
      return
    }
    save(id, accelerator)
  }

  return (
    <Section title="Keyboard shortcuts" id="section-shortcuts">
      {all
        .filter((shortcut) => !shortcut.hidden)
        .map((shortcut) => {
          const active = recording === shortcut.id
          const changed = Object.hasOwn(overrides, shortcut.id)
          return (
            <Row
              key={shortcut.id}
              label={shortcut.label}
              hint={
                problem?.id === shortcut.id
                  ? problem.message
                  : active
                    ? 'Press the new keys. Delete removes it, Escape cancels.'
                    : undefined
              }
            >
              {changed && (
                <IconButton
                  size="sm"
                  label="Use default shortcut"
                  onClick={() =>
                    save(
                      shortcut.id,
                      defaults.find((item) => item.id === shortcut.id)?.accelerator ?? null,
                    )
                  }
                >
                  <RotateCcw size={13} />
                </IconButton>
              )}
              <button
                type="button"
                className={[styles.kbdButton, active && styles.kbdRecording]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={active}
                aria-label={`Change shortcut for ${shortcut.label}`}
                onClick={() => {
                  setProblem(null)
                  setRecording(shortcut.id)
                }}
                onKeyDown={active ? onKeyDown(shortcut.id) : undefined}
                onBlur={() => {
                  if (active) setRecording(null)
                }}
              >
                {active
                  ? 'Press keys…'
                  : shortcut.accelerator
                    ? formatAccelerator(shortcut.accelerator)
                    : 'Add'}
              </button>
            </Row>
          )
        })}
    </Section>
  )
}

function updateHeadline(status: UpdateStatus | undefined): string {
  if (!status) return 'Ante'
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Ante ${status.version ?? ''} is available`
    case 'current':
      return `Ante ${status.current} is up to date`
    case 'error':
      return 'Could not check for updates'
    case 'idle':
      return `Ante ${status.current}`
  }
}

function UpdatesSection() {
  const checkUpdates = useAppState((state) => state.data.settings.checkUpdates)
  const status = useAppState((state) => state.runtime.update)
  return (
    <Section title="Updates">
      <Row
        label={updateHeadline(status)}
        hint={status?.state === 'available' ? `You have version ${status.current}` : undefined}
      >
        {status?.state === 'available' ? (
          <Button onClick={() => ante.command({ type: 'update/open' })}>Download</Button>
        ) : (
          <Button
            disabled={status?.state === 'checking'}
            onClick={() => ante.command({ type: 'update/check' })}
          >
            Check Now
          </Button>
        )}
      </Row>
      <Row label="Check for updates automatically" hint="Asks GitHub for the latest release">
        <Toggle
          label="Check for updates"
          checked={checkUpdates}
          onChange={(value) => update({ checkUpdates: value })}
        />
      </Row>
    </Section>
  )
}

function ClearDataRow({ profileId, label }: { profileId: string; label: string }) {
  const [confirming, clear] = useConfirm(() =>
    ante.command({
      type: 'privacy/clearData',
      profileId,
      cookies: true,
      cache: true,
      storage: true,
    }),
  )
  return (
    <Row label={label} hint="Cookies, cache and site storage">
      <Button tone="danger" onClick={clear}>
        {confirming ? 'Click again to clear' : 'Clear'}
      </Button>
    </Row>
  )
}

export function SettingsPanel() {
  useScrollToSection()
  const settings = useAppState((state) => state.data.settings)
  const profiles = useAppState((state) => state.data.profiles)
  const sitePermissions = useAppState((state) => state.data.sitePermissions)
  const browsers = useAppState((state) => state.runtime.browsers ?? NO_BROWSERS)
  const visibleProfiles = Object.values(profiles).filter((profile) => !isPrivateProfile(profile.id))
  const sites = Object.entries(sitePermissions).flatMap(([profileId, byOrigin]) =>
    Object.entries(byOrigin).map(([origin, decisions]) => ({ profileId, origin, decisions })),
  )

  return (
    <>
      <Section title="General">
        <Row label="Search engine">
          <Select
            label="Search engine"
            value={settings.searchEngine}
            options={searchEngines.map((engine) => ({
              value: engine,
              label: engineLabels[engine],
            }))}
            onChange={(searchEngine) => update({ searchEngine })}
          />
        </Row>
        {settings.searchEngine === 'custom' && <CustomSearchRows current={settings.customSearch} />}
        <Row label="Archive today tabs after" hint="Unused tabs move to the archive automatically">
          <Select
            label="Archive after"
            value={settings.archiveAfter}
            options={archiveOptions}
            onChange={(archiveAfter) => update({ archiveAfter })}
          />
        </Row>
        <Row
          label="Put tabs to sleep after"
          hint="Idle tabs free their memory and reload when you open them"
        >
          <Select
            label="Sleep after"
            value={settings.sleepAfter}
            options={sleepChoices}
            onChange={(sleepAfter) => update({ sleepAfter })}
          />
        </Row>
        <Row label="Appearance">
          <Segmented
            value={settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => update({ theme })}
          />
        </Row>
        <Row label="Sidebar position">
          <Segmented
            value={settings.sidebarSide}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(sidebarSide) => update({ sidebarSide })}
          />
        </Row>
        <Row
          label="Open links from pinned tabs in Peek"
          hint="Links to other sites open in a preview"
        >
          <Toggle
            label="Peek"
            checked={settings.peekExternalLinks}
            onChange={(peekExternalLinks) => update({ peekExternalLinks })}
          />
        </Row>
        <Row
          label="Picture in picture"
          hint="Keep videos playing in a floating window when you switch tabs"
        >
          <Toggle
            label="Picture in picture"
            checked={settings.autoPip}
            onChange={(autoPip) => update({ autoPip })}
          />
        </Row>
        <Row label="Import from Arc" hint="Bring over spaces, pinned tabs and folders">
          <Button onClick={() => ante.command({ type: 'import/arc' })}>Import</Button>
        </Row>
        {browsers.map((browser) => (
          <Row
            key={browser}
            label={`Import from ${browserNames[browser]}`}
            hint="Bookmarks become a space, and your history comes along"
          >
            <Button onClick={() => ante.command({ type: 'import/browser', browser })}>
              Import
            </Button>
          </Row>
        ))}
      </Section>

      <SyncSection />

      <Section title="Downloads">
        <Row label="Save downloads to" hint={settings.downloadFolder ?? 'Your Downloads folder'}>
          {settings.downloadFolder && (
            <Button onClick={() => ante.command({ type: 'downloads/useDefaultFolder' })}>
              Use Default
            </Button>
          )}
          <Button onClick={() => ante.command({ type: 'downloads/chooseFolder' })}>Choose…</Button>
        </Row>
        <Row label="Ask where to save each file">
          <Toggle
            label="Ask where to save"
            checked={settings.askWhereToSave}
            onChange={(askWhereToSave) => update({ askWhereToSave })}
          />
        </Row>
      </Section>

      <Section title="Privacy">
        <Row label="Block ads and trackers">
          <Toggle
            label="Block ads"
            checked={settings.adblock}
            onChange={(adblock) => update({ adblock })}
          />
        </Row>
        <Row
          label="Ask sites not to sell or share my data"
          hint="Sends the Global Privacy Control signal"
        >
          <Toggle
            label="Global Privacy Control"
            checked={settings.globalPrivacyControl}
            onChange={(globalPrivacyControl) => update({ globalPrivacyControl })}
          />
        </Row>
        <Row label="Clear history when Ante quits" hint="Cookies and logins stay">
          <Toggle
            label="Clear history on quit"
            checked={settings.clearHistoryOnQuit}
            onChange={(clearHistoryOnQuit) => update({ clearHistoryOnQuit })}
          />
        </Row>
        {settings.adblockAllowlist.length > 0 && (
          <div className={styles.list}>
            {settings.adblockAllowlist.map((host) => (
              <div key={host} className={styles.listItem}>
                <span className={styles.mono}>Allowed on {host}</span>
                <IconButton
                  size="sm"
                  label="Block ads again"
                  onClick={() =>
                    update({
                      adblockAllowlist: settings.adblockAllowlist.filter((entry) => entry !== host),
                    })
                  }
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        {visibleProfiles.map((profile) => (
          <ClearDataRow
            key={profile.id}
            profileId={profile.id}
            label={`Clear browsing data${visibleProfiles.length > 1 ? ` for ${profile.name}` : ''}`}
          />
        ))}
      </Section>

      <PasswordsSection profiles={visibleProfiles} />

      <Section title="Site permissions">
        {sites.length === 0 && (
          <p className={styles.empty}>Sites you allow or block will show up here.</p>
        )}
        <div className={styles.list}>
          {sites.flatMap(({ profileId, origin, decisions }) =>
            sitePermissionSchema.options.flatMap((permission) => {
              const decision = decisions[permission]
              if (!decision) return []
              return [
                <div key={`${profileId}:${origin}:${permission}`} className={styles.listItem}>
                  <span className={styles.mono} title={origin}>
                    {origin.replace(/^https?:\/\//, '')}
                  </span>
                  <span className={styles.kbd}>
                    {permissionLabels[permission]}: {decision === 'allow' ? 'Allowed' : 'Blocked'}
                  </span>
                  <IconButton
                    size="sm"
                    label="Reset"
                    onClick={() =>
                      ante.dispatch({ type: 'sitePermission/clear', profileId, origin, permission })
                    }
                  >
                    <X size={13} />
                  </IconButton>
                </div>,
              ]
            }),
          )}
        </div>
      </Section>

      <Section title="Profiles">
        {visibleProfiles.map((profile) => (
          <Row key={profile.id} label={profile.name}>
            <input
              className={styles.input}
              defaultValue={profile.name}
              aria-label="Profile name"
              onBlur={(event) =>
                ante.dispatch({ type: 'profile/rename', id: profile.id, name: event.target.value })
              }
            />
          </Row>
        ))}
      </Section>

      <UpdatesSection />

      <ShortcutsSection />
    </>
  )
}

function useScrollToSection() {
  useEffect(() => {
    const section = panelParams.get('section')
    if (section) document.getElementById(`section-${section}`)?.scrollIntoView()
  }, [])
}

function PasswordsSection({ profiles }: { profiles: readonly { id: string; name: string }[] }) {
  const passwords = useAppState((state) => state.runtime.passwords)
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const names = new Map(profiles.map((profile) => [profile.id, profile.name]))
  const logins = (passwords?.logins ?? [])
    .filter((login) => names.has(login.profileId))
    .filter(
      (login) =>
        !needle ||
        login.origin.toLowerCase().includes(needle) ||
        login.username.toLowerCase().includes(needle),
    )
    .sort((a, b) => siteName(a.origin).localeCompare(siteName(b.origin)))
  const total = passwords?.logins.length ?? 0

  return (
    <Section title="Passwords" id="section-passwords">
      {passwords?.available === false && (
        <p className={styles.empty}>
          Passwords can't be saved because this computer has no secure storage available.
        </p>
      )}
      {passwords?.available !== false && total === 0 && (
        <p className={styles.empty}>
          Ante offers to save passwords when you sign in, and fills them in next time. Importing
          from Arc or Chrome brings your saved passwords too.
        </p>
      )}
      {total > 8 && (
        <Row label="Search">
          <input
            className={styles.input}
            value={filter}
            placeholder="Site or username"
            aria-label="Search passwords"
            onChange={(event) => setFilter(event.target.value)}
          />
        </Row>
      )}
      <div className={styles.list}>
        {logins.map((login) => (
          <div key={login.id} className={styles.listItem}>
            <span className={styles.mono} title={login.origin}>
              {siteName(login.origin)}
              {profiles.length > 1 ? ` · ${names.get(login.profileId) ?? ''}` : ''}
            </span>
            <span className={styles.kbd}>{login.username || 'No username'}</span>
            <IconButton
              size="sm"
              label="Copy password"
              onClick={() =>
                ante.command({
                  type: 'password/copy',
                  profileId: login.profileId,
                  loginId: login.id,
                })
              }
            >
              <Copy size={13} />
            </IconButton>
            <IconButton
              size="sm"
              label="Delete password"
              onClick={() =>
                ante.command({
                  type: 'password/remove',
                  profileId: login.profileId,
                  loginId: login.id,
                })
              }
            >
              <X size={13} />
            </IconButton>
          </div>
        ))}
      </div>
    </Section>
  )
}
