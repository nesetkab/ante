const PNG = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0,
  1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function eventually(check, message) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(message)
}

export default async function easels({ store, run, waitFor, windows }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const contents = window.win.webContents
  run({ type: 'easel/new' }, window.id)
  await waitFor((state) => Object.keys(state.data.easels).length === 1)
  const easelId = Object.keys(store.state.data.easels)[0]

  const asset = await contents.executeJavaScript(
    `window.ante.saveAsset(new Uint8Array(${JSON.stringify(PNG)}))`,
  )
  assert(typeof asset === 'string' && asset.endsWith('.png'), 'the image should be saved')
  const rejected = await contents.executeJavaScript(
    'window.ante.saveAsset(new Uint8Array([60, 115, 118, 103]))',
  )
  assert(rejected === null, 'non-images should be refused')

  store.dispatch({
    type: 'easel/upsert',
    id: easelId,
    element: { kind: 'image', id: 'img', x: 40, y: 80, w: 120, h: 120, asset, sourceUrl: null },
    now: Date.now(),
  })
  store.dispatch({
    type: 'easel/upsert',
    id: easelId,
    element: {
      kind: 'text',
      id: 'txt',
      x: 200,
      y: 80,
      w: 200,
      h: 40,
      text: 'Hello board',
      size: 18,
    },
    now: Date.now(),
  })
  await eventually(
    () => contents.executeJavaScript("document.body.textContent.includes('Hello board')"),
    'text elements should render',
  )
  await eventually(
    () =>
      contents.executeJavaScript(
        '(() => { const img = document.querySelector(\'img[src^="ante-asset:"]\'); return Boolean(img && img.complete && img.naturalWidth === 1) })()',
      ),
    'images should load through the asset scheme',
  )
}
