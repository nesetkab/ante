const page = (title) =>
  `data:text/html,${encodeURIComponent(`<title>${title}</title><body style="height:2000px">${title}</body>`)}`

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function swipe({ store, run, waitFor, windows, tabs, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const windowData = () => store.state.data.windows[window.id]
  const space = () => store.state.data.spaces[windowData().spaceId]

  run({ type: 'open', input: page('Start'), disposition: 'newTab' }, window.id)
  await waitFor(() => space().today.length === 1)
  const tabId = space().today[0]
  await waitFor((state) => state.data.items[tabId]?.title === 'Start')
  const contents = tabs.contents(tabId)
  assert(contents, 'tab should be live')
  await contents.loadURL(page('Next'))
  await waitFor((state) => state.data.items[tabId]?.title === 'Next')
  await delay(300)

  const swipeOnce = async (sign) => {
    for (let step = 0; step < 8; step += 1) {
      contents.sendInputEvent({
        type: 'mouseWheel',
        x: 200,
        y: 200,
        deltaX: sign * 40,
        deltaY: 0,
        hasPreciseScrollingDeltas: true,
        canScroll: true,
      })
      await delay(16)
    }
    await delay(500)
  }

  await swipeOnce(1)
  if (store.state.data.items[tabId]?.title !== 'Start') await swipeOnce(-1)
  try {
    await waitFor((state) => state.data.items[tabId]?.title === 'Start', 3000)
  } catch {
    const seen = await contents.executeJavaScript(
      `new Promise((resolve) => {
        const deltas = []
        addEventListener('wheel', (event) => deltas.push(event.deltaX), { once: true })
        setTimeout(() => resolve(deltas), 300)
      })`,
    )
    throw new Error(
      `swiping sideways should go back, title is ${store.state.data.items[tabId]?.title}, wheel ${JSON.stringify(seen)}`,
    )
  }
}
