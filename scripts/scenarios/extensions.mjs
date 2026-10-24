import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { session } from 'electron'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function eventually(check, message, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(message)
}

function serve() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><title>Extension Test</title><p>hello</p>')
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

export default async function extensions({ store, tabs, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const server = await serve()
  const url = `http://localhost:${server.address().port}/`
  run({ type: 'open', input: 'about:blank', disposition: 'newTab' }, window.id)
  await waitFor((state) => Object.keys(state.runtime.tabs).length > 0)
  const profileSession = session.fromPartition('persist:profile-default')
  const extension = await profileSession.extensions.loadExtension(
    resolve('test/fixtures/extension'),
  )
  assert(extension.name === 'Ante Test Extension', 'the test extension should load')
  run({ type: 'open', input: url, disposition: 'newTab' }, window.id)
  run({ type: 'open', input: url, disposition: 'background' }, window.id)
  await waitFor((state) =>
    Object.values(state.data.items).some((item) => item.title === 'Extension Test'),
  )
  const tabId =
    store.state.data.windows[window.id].activeBySpace[store.state.data.windows[window.id].spaceId]
  const contents = tabs.contents(tabId)

  await eventually(
    async () =>
      (await contents.executeJavaScript('document.documentElement.dataset.anteExtension ?? ""')) ===
      'loaded',
    'the content script should run in the page',
  )
  await eventually(
    async () =>
      Number(
        await contents.executeJavaScript('document.documentElement.dataset.anteTabs ?? "0"'),
      ) >= 1,
    'chrome.tabs.query should see our tabs',
  )

  await eventually(
    () =>
      window.win.webContents.executeJavaScript(
        "(() => { const list = document.querySelector('browser-action-list'); return Boolean(list && list.shadowRoot && list.shadowRoot.querySelector('.action, [part=action], button')) })()",
      ),
    'the extension button should appear in the sidebar',
  )
  server.close()
}
