const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function arcImport({ store, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  await waitFor((state) => state.runtime.arcImportAvailable === true)
  const window = windows.all()[0]

  run({ type: 'import/arc' }, window.id)
  await waitFor((state) => state.data.spaceOrder.length >= 3)

  const { data } = store.state
  const names = data.spaceOrder.map((id) => data.spaces[id].name)
  assert(
    ['Home', 'Work', 'Reading'].every((name) => names.includes(name)),
    `spaces: ${names}`,
  )
  assert(names.length === 3, 'the untouched starter space should be replaced')
  const selected = data.spaces[data.windows[window.id].spaceId]
  assert(selected.name === 'Home', 'the first imported space should be selected')
  assert(selected.pinned.length > 0, 'pinned tabs should be imported')

  const tabs = Object.values(data.items).filter((item) => item.kind === 'tab')
  run({ type: 'import/arc' }, window.id)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const after = Object.values(store.state.data.items).filter((item) => item.kind === 'tab')
  assert(store.state.data.spaceOrder.length >= 3, 'reimport keeps spaces')
  assert(after.length >= tabs.length, 'reimport never drops tabs')
}
