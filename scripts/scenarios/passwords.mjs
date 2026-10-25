import { createServer } from 'node:http'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const loginPage = `<!doctype html><title>Sign in</title>
<form action="/done" method="post">
  <input name="u" autocomplete="username">
  <input name="p" type="password">
  <button>Sign in</button>
</form>`

function serve() {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(request.url === '/done' ? '<title>Welcome</title>ok' : loginPage)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

export default async function passwords({ store, run, waitFor, windows, tabs, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  if (!store.state.runtime.passwords?.available) {
    console.log('[passwords] secure storage unavailable, skipping')
    return
  }
  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}`
  const window = windows.all()[0]
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]
  try {
    run({ type: 'open', input: `${base}/login`, disposition: 'newTab' }, window.id)
    await waitFor(() => space().today.length === 1)
    const tabId = space().today[0]
    await waitFor((state) => state.data.items[tabId]?.title === 'Sign in')
    const contents = tabs.contents(tabId)
    await delay(200)
    await contents.executeJavaScript(`
      document.querySelector('[name=u]').value = 'neset'
      document.querySelector('[name=p]').value = 'hunter2'
      document.querySelector('form').requestSubmit()
    `)
    try {
      await waitFor((state) => state.runtime.tabs[tabId]?.prompt?.kind === 'password', 5000)
    } catch {
      throw new Error(
        `signing in should offer to save, title ${store.state.data.items[tabId]?.title} prompt ${JSON.stringify(store.state.runtime.tabs[tabId]?.prompt)}`,
      )
    }
    const prompt = store.state.runtime.tabs[tabId].prompt
    assert(prompt.username === 'neset' && !prompt.update, `prompt ${JSON.stringify(prompt)}`)
    await delay(600)
    run({ type: 'password/respond', tabId, promptId: prompt.id, action: 'save' }, window.id)
    await waitFor((state) => state.runtime.passwords.logins.length === 1)
    assert(store.state.runtime.tabs[tabId].prompt === null, 'the prompt should close')

    await contents.loadURL(`${base}/login`)
    await waitFor((state) => state.data.items[tabId]?.title === 'Sign in')
    contents.focus()
    await contents.executeJavaScript(`document.querySelector('[name=u]').focus()`, true)
    try {
      await waitFor((state) => state.runtime.tabs[tabId]?.autofill?.logins.length === 1, 5000)
    } catch {
      const focused = await contents.executeJavaScript('document.activeElement?.name ?? null')
      throw new Error(`focusing the username should offer the saved login, focused ${focused}`)
    }
    const loginId = store.state.runtime.tabs[tabId].autofill.logins[0].id
    await delay(400)
    run({ type: 'autofill/fill', tabId, loginId }, window.id)
    await waitFor((state) => state.runtime.tabs[tabId]?.autofill === null)
    let values = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      values = await contents.executeJavaScript(
        `[document.querySelector('[name=u]').value, document.querySelector('[name=p]').value]`,
      )
      if (values[1] === 'hunter2') break
      await delay(100)
    }
    assert(values[0] === 'neset' && values[1] === 'hunter2', `filled ${JSON.stringify(values)}`)
  } finally {
    server.close()
  }
}
