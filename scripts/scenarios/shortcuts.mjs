import { Menu } from 'electron'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function shortcuts({ store, waitFor, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const accelerator = (id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator

  assert(accelerator('new-tab') === 'CmdOrCtrl+T', 'new tab should start with its default keys')
  store.dispatch({
    type: 'settings/update',
    patch: { shortcuts: { 'new-tab': 'CmdOrCtrl+Shift+Y', reload: null } },
  })
  await delay(100)
  assert(accelerator('new-tab') === 'CmdOrCtrl+Shift+Y', 'the menu should use the new keys')
  assert(!accelerator('reload'), 'a removed shortcut should have no keys')

  store.dispatch({ type: 'settings/update', patch: { shortcuts: {} } })
  await delay(100)
  assert(accelerator('new-tab') === 'CmdOrCtrl+T', 'resetting should bring the default back')
}
