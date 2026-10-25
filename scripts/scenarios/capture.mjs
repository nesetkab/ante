import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const page = `data:text/html,${encodeURIComponent('<title>Tall</title><body style="margin:0;height:3000px;background:linear-gradient(red,blue)">tall</body>')}`

const listCaptures = () => {
  try {
    return readdirSync(join(app.getPath('pictures'), 'Ante Captures'))
  } catch {
    return []
  }
}

export default async function capture({ store, run, waitFor, windows, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]
  run({ type: 'open', input: page, disposition: 'newTab' }, window.id)
  await waitFor(() => space().today.length === 1)
  const tabId = space().today[0]
  await waitFor((state) => state.data.items[tabId]?.title === 'Tall')
  await delay(300)
  const before = new Set(listCaptures())
  run({ type: 'capture/fullPage', tabId }, window.id)
  let created = []
  for (let attempt = 0; attempt < 50 && created.length === 0; attempt += 1) {
    await delay(100)
    created = listCaptures().filter((name) => !before.has(name))
  }
  if (created.length !== 1)
    throw new Error(`full page capture should save one file, got ${created}`)
}
