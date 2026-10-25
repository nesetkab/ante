import { randomUUID } from 'node:crypto'
import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { UiEvent } from '@shared/ipc'
import type { AppState, Id } from '@shared/schema'
import type { UiAction } from '@shared/state/actions'
import { arcSymbols, symbolIcon, symbolLabel } from '@shared/spaceIcons'
import { spaceColors } from '@shared/state/initial'

const colorNames: Record<(typeof spaceColors)[number], string> = {
  '#3d6be0': 'Blue',
  '#1f9e8f': 'Teal',
  '#4a9d5b': 'Green',
  '#d99a21': 'Amber',
  '#e06a3b': 'Orange',
  '#d64545': 'Red',
  '#d6528c': 'Pink',
  '#7a5ae0': 'Violet',
  '#64748b': 'Slate',
}

export const spaceIcons = [
  '🏠',
  '💼',
  '📚',
  '🎓',
  '💻',
  '🧪',
  '🎨',
  '🎵',
  '🎮',
  '📈',
  '🛒',
  '✈️',
  '🍳',
  '🏋️',
  '🌱',
  '⭐',
  '🔥',
  '💡',
  '🧭',
  '📰',
  '🎬',
  '💬',
  '🗂️',
  '🔒',
]

interface SpaceMenuDeps {
  state: AppState
  dispatch: (action: UiAction) => void
  ui: (event: UiEvent) => void
  deleteSpace: () => void
}

export function showSpaceMenu(spaceId: Id, deps: SpaceMenuDeps): void {
  const { state, dispatch } = deps
  const space = state.data.spaces[spaceId]
  if (!space) return
  const update = (patch: Extract<UiAction, { type: 'space/update' }>['patch']) =>
    dispatch({ type: 'space/update', id: spaceId, patch })

  const template: MenuItemConstructorOptions[] = [
    { label: 'Rename…', click: () => deps.ui({ type: 'rename', id: spaceId }) },
    {
      label: 'Icon',
      submenu: [
        {
          label: 'None',
          type: 'radio',
          checked: space.icon === null,
          click: () => update({ icon: null }),
        },
        { type: 'separator' },
        {
          label: 'Symbols',
          submenu: arcSymbols.map((name) => ({
            label: symbolLabel(name),
            type: 'radio' as const,
            checked: space.icon === symbolIcon(name),
            click: () => update({ icon: symbolIcon(name) }),
          })),
        },
        {
          label: 'Emoji',
          submenu: spaceIcons.map((icon) => ({
            label: icon,
            type: 'radio' as const,
            checked: space.icon === icon,
            click: () => update({ icon }),
          })),
        },
      ],
    },
    {
      label: 'Color',
      submenu: spaceColors.map((color) => ({
        label: colorNames[color],
        type: 'radio' as const,
        checked: space.color === color,
        click: () => update({ color }),
      })),
    },
    {
      label: 'Profile',
      submenu: [
        ...Object.values(state.data.profiles).map((profile) => ({
          label: profile.name,
          type: 'radio' as const,
          checked: space.profileId === profile.id,
          click: () => update({ profileId: profile.id }),
        })),
        { type: 'separator' },
        {
          label: 'New Profile',
          click: () => {
            const id = randomUUID()
            const name = `Profile ${Object.keys(state.data.profiles).length + 1}`
            dispatch({ type: 'profile/create', id, name })
            update({ profileId: id })
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Delete Space…',
      enabled: state.data.spaceOrder.length > 1,
      click: deps.deleteSpace,
    },
  ]
  Menu.buildFromTemplate(template).popup()
}
