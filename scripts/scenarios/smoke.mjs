const page = (title) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><body style="font:24px system-ui;padding:40px">${title}</body>`)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function smoke({ store, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const spaceId = () => store.state.data.windows[window.id].spaceId
  const space = () => store.state.data.spaces[spaceId()]

  run({ type: 'open', input: page('First'), disposition: 'newTab' }, window.id)
  await waitFor(() => space()?.today.length === 1)
  const first = space().today[0]
  await waitFor((state) => state.data.items[first]?.title === 'First')

  run({ type: 'open', input: page('Second'), disposition: 'newTab' }, window.id)
  await waitFor(() => space().today.length === 2)
  const second = space().today[0]
  await waitFor((state) => state.data.items[second]?.title === 'Second')
  assert(
    store.state.data.windows[window.id].activeBySpace[spaceId()] === second,
    'second tab should be active',
  )

  run({ type: 'tab/togglePin', tabId: first }, window.id)
  await waitFor(() => space().pinned.includes(first))
  assert(store.state.data.items[first].savedUrl !== null, 'pinned tab should remember its url')

  run({ type: 'split/add', tabId: second }, window.id)
  await waitFor((state) => Object.values(state.data.items).some((item) => item.kind === 'split'))

  run({ type: 'tab/close', tabId: second }, window.id)
  await waitFor((state) => !state.data.items[second])
  assert(store.state.data.closed[0]?.tab.id === second, 'closed tab should be restorable')

  run({ type: 'tab/reopenClosed' }, window.id)
  await waitFor((state) => Boolean(state.data.items[second]))

  run({ type: 'open', input: page('Peek'), disposition: 'peek' }, window.id)
  await waitFor((state) => state.data.windows[window.id].peekTabId !== null)
  run({ type: 'peek/close' }, window.id)
  await waitFor((state) => state.data.windows[window.id].peekTabId === null)

  run({ type: 'space/new' }, window.id)
  await waitFor((state) => state.data.spaceOrder.length === 2)
  assert(
    store.state.data.windows[window.id].spaceId === store.state.data.spaceOrder[1],
    'new space should be selected',
  )
}
