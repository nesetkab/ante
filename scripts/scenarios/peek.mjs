import { createServer } from 'node:http'

const page = `<!doctype html><title>Links</title>
<a id="go" href="/target" style="display:block;position:fixed;inset:0">open</a>`

export default async function peek({ store, run, waitFor, windows, tabs, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(request.url === '/target' ? '<title>Target</title>here' : page)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const window = windows.all()[0]
  const windowData = () => store.state.data.windows[window.id]
  const space = () => store.state.data.spaces[windowData().spaceId]
  try {
    run(
      {
        type: 'open',
        input: `http://127.0.0.1:${server.address().port}/`,
        disposition: 'newTab',
      },
      window.id,
    )
    await waitFor(() => space().today.length === 1)
    const tabId = space().today[0]
    await waitFor((state) => state.data.items[tabId]?.title === 'Links')
    await delay(300)
    const contents = tabs.contents(tabId)
    contents.focus()
    for (const type of ['mouseDown', 'mouseUp'])
      contents.sendInputEvent({
        type,
        x: 60,
        y: 60,
        button: 'left',
        clickCount: 1,
        modifiers: ['shift'],
      })
    try {
      await waitFor(() => windowData().peekTabId !== null, 5000)
    } catch {
      throw new Error(`shift-click should open Peek, today has ${space().today.length} tabs`)
    }
    const peekId = windowData().peekTabId
    await waitFor((state) => state.data.items[peekId]?.url.endsWith('/target'))
    if (space().today.length !== 1) throw new Error('shift-click should not add a tab')
  } finally {
    server.close()
  }
}
