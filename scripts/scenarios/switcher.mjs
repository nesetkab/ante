const page = (title) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><body>${title}</body>`)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function switcher({ store, run, waitFor, windows, tabs, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const windowData = () => store.state.data.windows[window.id]
  const space = () => store.state.data.spaces[windowData().spaceId]
  const active = () => windowData().activeBySpace[windowData().spaceId]
  const overlay = () => store.state.runtime.windows[window.id]?.overlay ?? null

  for (const title of ['One', 'Two', 'Three']) {
    const count = space().today.length
    run({ type: 'open', input: page(title), disposition: 'newTab' }, window.id)
    await waitFor(() => space().today.length === count + 1)
    await delay(60)
  }
  const [three, two, one] = space().today
  assert(active() === three, 'the newest tab should be active')

  run({ type: 'tab/switch', delta: 1 }, window.id)
  await waitFor(() => overlay()?.kind === 'switcher')
  assert(overlay().tabIds[0] === three, `switcher starts at the current tab: ${overlay().tabIds}`)
  assert(overlay().index === 1, 'first press selects the previous tab')
  run({ type: 'tab/switch', delta: 1 }, window.id)
  await waitFor(() => overlay()?.index === 2)
  run({ type: 'switcher/commit' }, window.id)
  await waitFor(() => overlay() === null)
  assert(active() === one, `commit should open the third most recent tab, got ${active()}`)

  run({ type: 'tab/switch', delta: 1 }, window.id)
  await waitFor(() => overlay()?.kind === 'switcher')
  const target = overlay().tabIds[1]
  const contents = tabs.contents(one)
  assert(contents, 'the active tab should be live')
  const seen = []
  const record = (_event, input) => seen.push(`${input.type}:${input.key}:${input.control}`)
  contents.on('before-input-event', record)
  contents.focus()
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'Control', modifiers: ['control'] })
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' })
  try {
    await waitFor(() => overlay() === null, 3000)
  } catch {
    throw new Error(
      `releasing control should commit: ${JSON.stringify(overlay())} inputs ${JSON.stringify(seen)} focused ${contents.isFocused()}`,
    )
  } finally {
    contents.off('before-input-event', record)
  }
  assert(active() === target, 'releasing control picks the highlighted tab')

  run({ type: 'tab/switch', delta: -1 }, window.id)
  await waitFor(() => overlay()?.kind === 'switcher')
  assert(overlay().index === overlay().tabIds.length - 1, 'backwards starts at the oldest tab')
  run({ type: 'overlay/close' }, window.id)
  await waitFor(() => overlay() === null)
  assert(active() === target, 'closing the switcher keeps the current tab')
  assert(two, 'all tabs exist')
}
