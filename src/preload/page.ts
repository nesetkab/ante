import { contextBridge } from 'electron'

contextBridge.executeInMainWorld({
  func: () => {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
      get: () => true,
      configurable: true,
      enumerable: true,
    })
  },
})
