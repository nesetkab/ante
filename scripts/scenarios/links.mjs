const html = `<title>Links</title><style>a{position:fixed;inset:0;display:block}</style><a href="https://example.com/hovered">link</a>`
const page = `data:text/html,${encodeURIComponent(html)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function links({ store, tabs, run, waitFor, windows, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  run({ type: 'open', input: page, disposition: 'newTab' }, window.id)
  const tabId = () =>
    Object.values(store.state.data.items).find((item) => item.title === 'Links')?.id
  await waitFor(() => tabId() !== undefined)
  const id = tabId()
  await waitFor((state) => state.runtime.tabs[id]?.loading === false)
  const contents = tabs.contents(id)

  for (let attempt = 0; attempt < 20 && !store.state.runtime.tabs[id]?.hoverUrl; attempt += 1) {
    contents.sendInputEvent({ type: 'mouseMove', x: 100 + attempt, y: 100 })
    await delay(100)
  }
  assert(
    store.state.runtime.tabs[id]?.hoverUrl === 'https://example.com/hovered',
    `hovering a link should report it, got ${store.state.runtime.tabs[id]?.hoverUrl}`,
  )
  const overlay = window.overlay.webContents
  let shown = ''
  for (let attempt = 0; attempt < 30 && !shown.includes('example.com'); attempt += 1) {
    shown = await overlay.executeJavaScript(
      "document.querySelector('[role=status]')?.textContent ?? ''",
    )
    await delay(100)
  }
  assert(
    shown.includes('example.com/hovered'),
    `the link bubble should show the address, got "${shown}"`,
  )
}
