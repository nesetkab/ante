import { createServer } from 'node:http'

export default async function pdf({ store, run, waitFor, windows, tabs, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]

  run(
    {
      type: 'open',
      input: 'data:text/html,<title>Doc</title><h1>Hello PDF</h1>',
      disposition: 'newTab',
    },
    window.id,
  )
  await waitFor(() => space().today.length === 1)
  const sourceId = space().today[0]
  await waitFor((state) => state.data.items[sourceId]?.title === 'Doc')
  const bytes = await tabs.contents(sourceId).printToPDF({})

  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/pdf' })
    response.end(bytes)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const url = `http://127.0.0.1:${server.address().port}/report.pdf`
    run({ type: 'open', input: url, disposition: 'newTab' }, window.id)
    await waitFor(() => space().today.length === 2)
    const tabId = space().today[0]
    await delay(2500)
    const downloads = Object.values(store.state.runtime.downloads)
    const tab = store.state.data.items[tabId]
    if (downloads.length > 0 || tab?.url !== url) {
      throw new Error(
        `PDFs should open in the tab, got ${downloads.length} downloads, url ${tab?.url}, title ${tab?.title}`,
      )
    }
  } finally {
    server.close()
  }
}
