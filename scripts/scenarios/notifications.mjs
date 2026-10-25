export default async function notifications({ store, run, waitFor, windows, tabs, delay }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const window = windows.all()[0]
  const space = () => store.state.data.spaces[store.state.data.windows[window.id].spaceId]
  run(
    { type: 'open', input: 'data:text/html,<title>Note</title>hello', disposition: 'newTab' },
    window.id,
  )
  await waitFor(() => space().today.length === 1)
  const tabId = space().today[0]
  await waitFor((state) => state.data.items[tabId]?.title === 'Note')
  await delay(200)
  const result = await tabs.contents(tabId).executeJavaScript(`(() => {
    const notification = new Notification('hi', { body: 'there' })
    return {
      wrapped: Notification.name,
      instance: notification instanceof Notification,
      permission: typeof Notification.permission,
      request: typeof Notification.requestPermission,
      title: notification.title,
    }
  })()`)
  const ok =
    result.wrapped !== 'Notification' &&
    result.instance &&
    result.permission === 'string' &&
    result.request === 'function' &&
    result.title === 'hi'
  if (!ok) throw new Error(`notifications should keep working: ${JSON.stringify(result)}`)
}
