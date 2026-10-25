import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ImportedSettings } from '@shared/importers/bundle'

const DOMAIN = 'company.thebrowser.Browser'

function readDefault(key: string): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile('/usr/bin/defaults', ['read', DOMAIN, key], { timeout: 5_000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim())
    })
  })
}

export function themeFromAppearance(value: string | null): ImportedSettings['theme'] {
  if (value === 'NSAppearanceNameDarkAqua') return 'dark'
  if (value === 'NSAppearanceNameAqua') return 'light'
  return undefined
}

export async function readArcAppSettings(): Promise<ImportedSettings> {
  const [adblock, appearance] = await Promise.all([
    readDefault('nativeAdBlockEnabled'),
    readDefault('appearance'),
  ])
  const theme = themeFromAppearance(appearance)
  return {
    ...(adblock === '0' || adblock === '1' ? { adblock: adblock === '1' } : {}),
    ...(theme ? { theme } : {}),
  }
}

const hostPattern = /^[a-z0-9.-]{1,253}$/i

export function appOrigins(json: unknown): string[] {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return []
  return Object.entries(json).flatMap(([host, schemes]) =>
    hostPattern.test(host) && Array.isArray(schemes) && schemes.length > 0
      ? [`https://${host.toLowerCase()}`]
      : [],
  )
}

export function readArcAppOrigins(): Promise<string[]> {
  if (process.platform !== 'darwin') return Promise.resolve([])
  const plist = join(homedir(), 'Library', 'Preferences', `${DOMAIN}.plist`)
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/plutil',
      ['-extract', 'arcAlwaysAllowedLinkToSchemesPerSite', 'json', '-o', '-', plist],
      { timeout: 5_000 },
      (error, stdout) => {
        try {
          resolve(error ? [] : appOrigins(JSON.parse(stdout)))
        } catch {
          resolve([])
        }
      },
    )
  })
}
