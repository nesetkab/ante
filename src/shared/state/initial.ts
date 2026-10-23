import { DATA_VERSION, type AppState, type Data, type Id } from '../schema'

export const DEFAULT_PROFILE_ID = 'default'

export const spaceColors = [
  '#3d6be0',
  '#1f9e8f',
  '#4a9d5b',
  '#d99a21',
  '#e06a3b',
  '#d64545',
  '#d6528c',
  '#7a5ae0',
  '#64748b',
] as const

export function nextSpaceColor(data: Data): string {
  const used = new Set(Object.values(data.spaces).map((space) => space.color))
  return (
    spaceColors.find((color) => !used.has(color)) ??
    spaceColors[data.spaceOrder.length % spaceColors.length] ??
    '#3d6be0'
  )
}

export function createInitialData(spaceId: Id): Data {
  return {
    version: DATA_VERSION,
    profiles: { [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Default' } },
    spaces: {
      [spaceId]: {
        id: spaceId,
        name: 'Personal',
        icon: null,
        color: spaceColors[0],
        profileId: DEFAULT_PROFILE_ID,
        pinned: [],
        today: [],
      },
    },
    spaceOrder: [spaceId],
    favorites: { [DEFAULT_PROFILE_ID]: [] },
    items: {},
    windows: {},
    archive: [],
    closed: [],
    settings: {
      searchEngine: 'google',
      archiveAfter: '12h',
      sidebarWidth: 260,
      sidebarSide: 'left',
      theme: 'system',
      adblock: true,
      peekExternalLinks: true,
      adblockAllowlist: [],
    },
    sitePermissions: {},
  }
}

export function createAppState(data: Data): AppState {
  return { data, runtime: { tabs: {}, windows: {} } }
}

export const archiveThresholds = {
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  never: 0,
} as const
