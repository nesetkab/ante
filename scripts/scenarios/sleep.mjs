const page = (title) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><body>${title}</body>`)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function sleep({ store, tabs, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]

  run({ type: 'open', input: page('One'), disposition: 'newTab' }, window.id)
  await waitFor(() => space()?.today.length === 1)
  const id = space().today[0]
  await waitFor((state) => state.data.items[id]?.title === 'One')

  const first = tabs.contents(id)
  await first.loadURL(page('Two'))
  await waitFor((state) => state.data.items[id]?.title === 'Two')
  await waitFor((state) => state.runtime.tabs[id]?.canGoBack === true)

  run({ type: 'open', input: page('Other'), disposition: 'newTab' }, window.id)
  await waitFor(() => space().today.length === 2)
  await waitFor((state) => state.data.windows[window.id].activeBySpace[space().id] !== id)

  const changes = []
  const stop = store.subscribe((change) => {
    if ('id' in change.action && change.action.id === id) changes.push(change.action.type)
  })
  store.dispatch({ type: 'runtime/unload', id })
  try {
    await waitFor(() => tabs.contents(id) === undefined, 5000)
  } catch {
    throw new Error(
      `the sleeping tab kept its view: runtime ${JSON.stringify(Object.keys(store.state.runtime.tabs[id] ?? {}))}, actions ${JSON.stringify(changes)}`,
    )
  } finally {
    stop()
  }
  run({ type: 'tab/activate', tabId: id }, window.id)
  await waitFor(() => tabs.contents(id) !== undefined && tabs.contents(id) !== first)
  await waitFor((state) => state.runtime.tabs[id]?.loading === false, 5000)
  await waitFor((state) => state.runtime.tabs[id]?.canGoBack === true, 5000)
  assert(store.state.data.items[id].title === 'Two', 'the tab should wake on the same page')

  run({ type: 'tab/back', tabId: id }, window.id)
  await waitFor((state) => state.data.items[id]?.title === 'One', 5000)
}
