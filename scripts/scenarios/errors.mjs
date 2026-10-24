import { createServer } from 'node:net'

async function closedPort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  await new Promise((done) => server.close(done))
  return port
}

async function eventually(check, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(message)
}

export default async function errors({ store, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const port = await closedPort()
  run({ type: 'open', input: `http://127.0.0.1:${port}/`, disposition: 'newTab' }, window.id)
  await eventually(
    () => Object.values(store.state.runtime.tabs).some((tab) => tab.error?.code === -102),
    'a refused connection should be reported',
  )
  await eventually(
    () =>
      window.win.webContents.executeJavaScript(
        'document.body.textContent.includes("This site can\'t be reached")',
      ),
    'the error screen should replace the blank page',
  )
}
