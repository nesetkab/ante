document.documentElement.dataset.anteExtension = 'loaded'
chrome.runtime.sendMessage('count-tabs').then((count) => {
  document.documentElement.dataset.anteTabs = String(count)
})
