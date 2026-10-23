import { createServer } from 'node:http'

const html = '<!doctype html><title>Boost Test</title><body><h1>Heading</h1><p>Body text</p></body>'

function serve() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(html)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function boosts({ store, tabs, run, waitFor, windows, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const server = await serve()
  const url = `http://localhost:${server.address().port}/`
  run({ type: 'open', input: url, disposition: 'newTab' }, window.id)
  await waitFor((state) =>
    Object.values(state.data.items).some((item) => item.title === 'Boost Test'),
  )
  const tabId = Object.values(store.state.data.items).find((item) => item.title === 'Boost Test').id
  const contents = tabs.contents(tabId)
  const background = () =>
    contents.executeJavaScript('getComputedStyle(document.body).backgroundColor')
  const headingHidden = () =>
    contents.executeJavaScript("getComputedStyle(document.querySelector('h1')).display === 'none'")

  store.dispatch({ type: 'boost/create', id: 'b1', name: 'Local', domain: 'localhost' })
  store.dispatch({
    type: 'boost/update',
    id: 'b1',
    patch: { css: 'body { background: rgb(1, 2, 3) !important; }' },
  })
  let applied = false
  for (let attempt = 0; attempt < 40 && !applied; attempt += 1) {
    applied = (await background()) === 'rgb(1, 2, 3)'
    if (!applied) await delay(100)
  }
  assert(applied, 'boost css should apply to the open tab')

  store.dispatch({ type: 'boost/addZap', id: 'b1', selector: 'h1' })
  let zapped = false
  for (let attempt = 0; attempt < 40 && !zapped; attempt += 1) {
    zapped = await headingHidden()
    if (!zapped) await delay(100)
  }
  assert(zapped, 'zapped elements should be hidden')

  store.dispatch({ type: 'boost/update', id: 'b1', patch: { enabled: false } })
  let removed = false
  for (let attempt = 0; attempt < 40 && !removed; attempt += 1) {
    removed = (await background()) !== 'rgb(1, 2, 3)' && !(await headingHidden())
    if (!removed) await delay(100)
  }
  assert(removed, 'disabling a boost should remove its css live')
  server.close()
}
