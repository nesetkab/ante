import { X } from 'lucide-react'
import { permissionLabels, sitePermissionSchema } from '@shared/permissions'
import { searchEngines, type ArchiveAfter, type SearchEngine, type Settings } from '@shared/schema'
import { shortcuts, type Platform } from '@shared/shortcuts'
import { isPrivateProfile } from '@shared/state/private'
import { ante } from '../ante'
import { Button, Row, Section, Segmented, Select, Toggle } from '../components/Form'
import { IconButton } from '../components/IconButton'
import { useAppState } from '../store'
import styles from './Panel.module.css'

const engineLabels: Record<SearchEngine, string> = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
  brave: 'Brave Search',
  kagi: 'Kagi',
  ecosia: 'Ecosia',
}

const archiveOptions: readonly { value: ArchiveAfter; label: string }[] = [
  { value: '12h', label: '12 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
]

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

export function SettingsPanel() {
  const settings = useAppState((state) => state.data.settings)
  const profiles = useAppState((state) => state.data.profiles)
  const sitePermissions = useAppState((state) => state.data.sitePermissions)
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
        <Row label="Archive today tabs after" hint="Unused tabs move to the archive automatically">
          <Select
            label="Archive after"
            value={settings.archiveAfter}
            options={archiveOptions}
            onChange={(archiveAfter) => update({ archiveAfter })}
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
      </Section>

      <Section title="Privacy">
        <Row label="Block ads and trackers">
          <Toggle
            label="Block ads"
            checked={settings.adblock}
            onChange={(adblock) => update({ adblock })}
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
          <Row
            key={profile.id}
            label={`Clear browsing data${visibleProfiles.length > 1 ? ` for ${profile.name}` : ''}`}
            hint="Cookies, cache and site storage"
          >
            <Button
              tone="danger"
              onClick={() =>
                ante.command({
                  type: 'privacy/clearData',
                  profileId: profile.id,
                  cookies: true,
                  cache: true,
                  storage: true,
                })
              }
            >
              Clear
            </Button>
          </Row>
        ))}
      </Section>

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

      <Section title="Keyboard shortcuts">
        {shortcuts(ante.platform as Platform)
          .filter((shortcut) => !shortcut.hidden && shortcut.accelerator)
          .map((shortcut) => (
            <Row key={shortcut.id} label={shortcut.label}>
              <span className={styles.kbd}>{formatAccelerator(shortcut.accelerator ?? '')}</span>
            </Row>
          ))}
      </Section>
    </>
  )
}
