const page = (title) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><body>${title}</body>`)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function rectOf(contents, selector) {
  const rect = await contents.executeJavaScript(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null })()`,
  )
  assert(rect, `missing element ${selector}`)
  return rect
}

async function drag(contents, from, to, delay) {
  const point = (rect, ratio = 0.5) => ({
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height * ratio),
  })
  const start = point(from)
  const end = typeof to === 'function' ? null : point(to.rect, to.ratio)
  contents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 })
  for (let step = 1; step <= 4; step += 1) {
    contents.sendInputEvent({
      type: 'mouseMove',
      x: start.x,
      y: start.y + step * 3,
      modifiers: ['leftButtonDown'],
    })
    await delay(30)
  }
  const target = end ?? point((await to()).rect, 0.5)
  for (let step = 1; step <= 8; step += 1) {
    const x = Math.round(start.x + ((target.x - start.x) * step) / 8)
    const y = Math.round(start.y + ((target.y - start.y) * step) / 8)
    contents.sendInputEvent({ type: 'mouseMove', x, y, modifiers: ['leftButtonDown'] })
    await delay(30)
  }
  await delay(80)
  contents.sendInputEvent({ type: 'mouseUp', ...target, button: 'left', clickCount: 1 })
  await delay(150)
}

export default async function dragScenario({ store, run, waitFor, windows, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const contents = window.win.webContents
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]

  for (const title of ['Alpha', 'Beta', 'Gamma']) {
    run({ type: 'open', input: page(title), disposition: 'newTab' }, window.id)
    await waitFor(() => Object.values(store.state.data.items).some((item) => item.title === title))
  }
  await delay(300)
  const idOf = (title) =>
    Object.values(store.state.data.items).find((item) => item.title === title).id

  const alpha = idOf('Alpha')
  await drag(
    contents,
    await rectOf(contents, `[data-id="${alpha}"]`),
    {
      rect: await rectOf(contents, '[data-drop="zone"]'),
      ratio: 0.5,
    },
    delay,
  )
  await waitFor(() => space().pinned.includes(alpha), 3000)

  const beta = idOf('Beta')
  await drag(
    contents,
    await rectOf(contents, `[data-id="${beta}"]`),
    async () => ({
      rect: await rectOf(contents, '[data-drop="zone"]'),
    }),
    delay,
  )
  await waitFor(() => (store.state.data.favorites.default ?? []).includes(beta), 3000)

  const gamma = idOf('Gamma')
  const before = space().today.indexOf(gamma)
  assert(before === 0, 'gamma should be the only today tab left')
  assert(
    space().pinned.length === 1 && !space().today.includes(alpha),
    'alpha should have moved to pinned',
  )
}
