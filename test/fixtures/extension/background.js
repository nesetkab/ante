chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message !== 'count-tabs') return false
  chrome.tabs.query({}).then((tabs) => respond(tabs.length))
  return true
})
