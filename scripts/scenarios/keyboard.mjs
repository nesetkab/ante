const page = (title) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><body>${title}</body>`)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function keyboard({ store, run, waitFor, windows, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const contents = window.win.webContents
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]

  run({ type: 'open', input: page('First'), disposition: 'newTab' }, window.id)
  await waitFor(() => space()?.today.length === 1)
  run({ type: 'open', input: page('Second'), disposition: 'newTab' }, window.id)
  await waitFor(() => space().today.length === 2)
  const [second, first] = space().today
  await waitFor((state) => state.data.items[first]?.title === 'First')
  await waitFor((state) => state.data.items[second]?.title === 'Second')
  await delay(300)

  const focused = () =>
    contents.executeJavaScript('document.activeElement?.textContent?.trim() ?? ""')
  const press = (key) =>
    contents.executeJavaScript(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`,
    )

  await contents.executeJavaScript(
    `[...document.querySelectorAll('[data-row]')].find((row) => row.textContent.includes('New Tab')).focus()`,
  )
  assert((await focused()).includes('New Tab'), 'the new tab row should take focus')
  await press('ArrowDown')
  assert((await focused()).includes('Second'), 'arrow down should move to the newest tab')
  await press('ArrowDown')
  assert((await focused()).includes('First'), 'arrow down should move to the next tab')
  await press('Home')
  assert((await focused()).includes('New Tab'), 'home should jump to the first row')
  await press('End')
  assert((await focused()).includes('First'), 'end should jump to the last row')
  await press('Enter')
  await waitFor((state) => state.data.windows[window.id].activeBySpace[space().id] === first, 3000)

  run({ type: 'commandBar/open', mode: 'new' }, window.id)
  const overlay = window.overlay.webContents
  const query = (script) => overlay.executeJavaScript(script)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await query(`document.activeElement?.getAttribute('role') === 'combobox'`)) break
    await delay(100)
  }
  overlay.insertText('youtube')
  await delay(200)
  await query(
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))`,
  )
  await delay(200)
  const placeholder = await query('document.activeElement?.placeholder ?? ""')
  assert(placeholder === 'Search YouTube', `tab should start a YouTube search, got ${placeholder}`)
  run({ type: 'overlay/close' }, window.id)
}
