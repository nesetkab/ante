const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

export default async function notes({ store, run, waitFor, windows, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  run({ type: 'note/new' }, window.id)
  await waitFor((state) => Object.keys(state.data.notes).length === 1)
  const noteId = Object.keys(store.state.data.notes)[0]
  await delay(500)
  const contents = window.win.webContents
  const editable = await contents.executeJavaScript(
    "Boolean(document.querySelector('textarea')) && document.activeElement?.tagName === 'TEXTAREA'",
  )
  assert(editable, 'the note editor should render and take focus')
  contents.insertText('Buy milk')
  await waitFor((state) => state.data.notes[noteId]?.body === 'Buy milk', 3000)
  const tab = Object.values(store.state.data.items).find(
    (item) => item.url === `ante:note/${noteId}`,
  )
  assert(tab, 'the note should live in the sidebar as a tab')
  assert(!store.state.runtime.tabs[tab.id], 'notes should not create a web view')
}
