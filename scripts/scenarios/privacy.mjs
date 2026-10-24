import { createServer } from 'node:http'
import { BrowserWindow } from 'electron'

const html = `<!doctype html><title>Privacy Test</title><body>
<p>Body text for find. Body again.</p>
<img src="https://ib.adnxs.com/pixel.gif" alt="">
</body>`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function eventually(check, message, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(message)
}

function serve() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(html)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

export default async function privacy({ store, tabs, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const overlayText = () =>
    window.overlay.webContents.executeJavaScript("document.getElementById('root').textContent")
  const server = await serve()
  const url = `http://localhost:${server.address().port}/`

  run({ type: 'open', input: url, disposition: 'newTab' }, window.id)
  await waitFor((state) =>
    Object.values(state.data.items).some((item) => item.title === 'Privacy Test'),
  )
  const tabId = Object.values(store.state.data.items).find(
    (item) => item.title === 'Privacy Test',
  ).id
  const contents = tabs.contents(tabId)

  await eventually(
    () => (store.state.runtime.tabs[tabId]?.blocked ?? 0) > 0,
    'the ad pixel should be blocked',
  )

  contents.executeJavaScript('Notification.requestPermission()', true)
  await eventually(
    () => store.state.runtime.tabs[tabId]?.prompt?.kind === 'permission',
    'a notification prompt should appear',
  )
  await eventually(
    async () => (await overlayText()).includes('show notifications'),
    'the prompt should render',
  )
  const prompt = store.state.runtime.tabs[tabId].prompt
  run(
    { type: 'permission/respond', tabId, promptId: prompt.id, allow: false, remember: true },
    window.id,
  )
  await eventually(
    () => store.state.runtime.tabs[tabId]?.prompt === null,
    'the prompt should close',
  )
  const origin = new URL(url).origin
  assert(
    store.state.data.sitePermissions.default?.[origin]?.notifications === 'block',
    'the decision should be remembered',
  )

  run({ type: 'find/open' }, window.id)
  await eventually(() => store.state.runtime.tabs[tabId]?.find !== null, 'find should open')
  run({ type: 'find/query', tabId, query: 'Body' }, window.id)
  await eventually(
    () => store.state.runtime.tabs[tabId]?.find?.matches === 2,
    'find should count both matches',
  )
  run({ type: 'find/close', tabId }, window.id)
  await eventually(() => store.state.runtime.tabs[tabId]?.find === null, 'find should close')

  run({ type: 'window/newPrivate' }, window.id)
  await waitFor((state) => Object.keys(state.data.windows).length === 2)
  const privateWindow = windows.all().find((candidate) => candidate.id !== window.id)
  const privateSpace = store.state.data.windows[privateWindow.id].spaceId
  const privateProfile = store.state.data.spaces[privateSpace].profileId
  assert(privateProfile.startsWith('private-'), 'the new window should use a private profile')
  run({ type: 'open', input: url, disposition: 'newTab' }, privateWindow.id)
  await waitFor((state) => state.data.spaces[privateSpace]?.today.length === 1)
  privateWindow.win.close()
  await waitFor((state) => !state.data.profiles[privateProfile] && !state.data.spaces[privateSpace])

  run({ type: 'settings/open' }, window.id)
  const findSettings = () =>
    BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('panel=settings'))
  await eventually(() => findSettings() !== undefined, 'settings should open')
  const settings = findSettings()
  await eventually(
    async () =>
      (
        await settings.webContents.executeJavaScript(
          "document.getElementById('root')?.textContent ?? ''",
        )
      ).includes('Search engine'),
    'settings should render',
  )
  server.close()
}
