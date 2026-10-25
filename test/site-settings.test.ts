import { describe, expect, it } from 'vitest'
import {
  parseChromiumSiteSettings,
  patternOrigin,
  zoomFromLevel,
} from '@shared/importers/chromiumPrefs'
import { parseArcWindows } from '@shared/importers/arc'
import { zoomHost } from '@shared/zoom'
import { themeFromAppearance } from '../src/main/importers/arcDefaults'
import { uiActionSchema } from '@shared/state/actions'
import { apply, buildState } from './helpers'

const prefs = {
  profile: {
    content_settings: {
      exceptions: {
        notifications: {
          'https://mail.google.com:443,*': { setting: 1 },
          'https://spam.example:443,*': { setting: 2 },
          '[*.]wild.example,*': { setting: 1 },
        },
        media_stream_mic: { 'https://meet.google.com:443,*': { setting: 1, last_visit: '1' } },
        automatic_downloads: { 'https://files.example:443,*': { setting: 1 } },
        geolocation: { 'https://maps.example:443,*': { setting: 3 } },
        sound: [],
        cookies: 'odd',
      },
    },
  },
  partition: {
    per_host_zoom_levels: {
      x: { 'news.ycombinator.com': { zoom_level: 1 }, 'plain.example': { zoom_level: 0 } },
    },
  },
  protocol_handler: {
    allowed_origin_protocol_pairs: {
      'https://app.slack.com': { slack: true },
      'https://nope.example': { zoommtg: false },
    },
  },
}

describe('chromium site settings', () => {
  it('turns content settings into allow and block decisions', () => {
    const { permissions } = parseChromiumSiteSettings(prefs)
    expect(permissions).toEqual({
      'https://mail.google.com': { notifications: 'allow' },
      'https://spam.example': { notifications: 'block' },
      'https://meet.google.com': { microphone: 'allow' },
    })
  })

  it('converts zoom levels to zoom factors and skips the default', () => {
    expect(parseChromiumSiteSettings(prefs).zoom).toEqual({ 'news.ycombinator.com': 1.2 })
    expect(zoomFromLevel(0.5227588177433838)).toBe(1.1)
    expect(zoomFromLevel(-20)).toBe(0.25)
  })

  it('reads origins out of patterns and ignores wildcards', () => {
    expect(patternOrigin('https://a.example:443,*')).toBe('https://a.example')
    expect(patternOrigin('http://localhost:3000,*')).toBe('http://localhost:3000')
    expect(patternOrigin('[*.]a.example,*')).toBeNull()
    expect(patternOrigin('chrome://settings,*')).toBeNull()
  })

  it('tolerates missing or broken preferences', () => {
    expect(parseChromiumSiteSettings(null)).toEqual({ permissions: {}, zoom: {} })
    expect(parseChromiumSiteSettings({ profile: 4, partition: [] })).toEqual({
      permissions: {},
      zoom: {},
    })
  })
})

describe('arc window and app settings', () => {
  it('reads sidebar width and hidden sidebar', () => {
    expect(
      parseArcWindows({ sidebarViewPreferences: { sidebarWidth: 228, sidebarMode: 'noChrome' } }),
    ).toEqual({ sidebarWidth: 228, sidebarHidden: true })
    expect(parseArcWindows({ sidebarViewPreferences: { sidebarWidth: 9000 } })).toEqual({
      sidebarWidth: 480,
    })
    expect(parseArcWindows('nope')).toEqual({})
  })

  it('maps the Arc appearance setting to a theme', () => {
    expect(themeFromAppearance('NSAppearanceNameDarkAqua')).toBe('dark')
    expect(themeFromAppearance('NSAppearanceNameAqua')).toBe('light')
    expect(themeFromAppearance(null)).toBeUndefined()
  })
})

describe('site zoom', () => {
  const start = buildState({ spaces: { s1: { today: ['a'] } } })

  it('remembers zoom per site and forgets it at 100%', () => {
    const zoomed = apply(start, {
      type: 'siteZoom/set',
      profileId: 'default',
      host: 'example.com',
      zoom: 1.25,
    })
    expect(zoomed.data.siteZoom).toEqual({ default: { 'example.com': 1.25 } })
    const reset = apply(zoomed, {
      type: 'siteZoom/set',
      profileId: 'default',
      host: 'example.com',
      zoom: 1,
    })
    expect(reset.data.siteZoom).toEqual({})
    expect(
      apply(start, { type: 'siteZoom/set', profileId: 'private-1', host: 'a.com', zoom: 2 }).data
        .siteZoom,
    ).toEqual({})
    expect(zoomHost('https://Example.com/path')).toBe('example.com')
    expect(zoomHost('file:///tmp/x')).toBeNull()
    expect(zoomHost(`https://${'a'.repeat(250)}.example/`)).toBeNull()
  })

  it('imports site settings without overriding choices made in Ante', () => {
    const decided = apply(start, {
      type: 'sitePermission/set',
      profileId: 'default',
      origin: 'https://mail.google.com',
      permissions: ['notifications'],
      decision: 'block',
    })
    const imported = apply(decided, {
      type: 'profile/importSiteSettings',
      profileId: 'default',
      permissions: {
        'https://mail.google.com': { notifications: 'allow', microphone: 'allow' },
        'https://meet.google.com': { camera: 'allow' },
      },
      zoom: { 'news.ycombinator.com': 1.2 },
    })
    expect(imported.data.sitePermissions.default).toEqual({
      'https://mail.google.com': { notifications: 'block', microphone: 'allow' },
      'https://meet.google.com': { camera: 'allow' },
    })
    expect(imported.data.siteZoom.default).toEqual({ 'news.ycombinator.com': 1.2 })
  })
})

describe('collapsed pinned section', () => {
  it('can be folded from the renderer and syncs as part of the space', () => {
    const start = buildState({ spaces: { s1: { pinned: ['p'] } } })
    const folded = apply(start, { type: 'space/update', id: 's1', patch: { collapsed: true } })
    expect(folded.data.spaces.s1?.collapsed).toBe(true)
    expect(
      uiActionSchema.safeParse({ type: 'space/update', id: 's1', patch: { collapsed: true } })
        .success,
    ).toBe(true)
  })
})
