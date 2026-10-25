import { contextBridge, ipcRenderer } from 'electron'
import { NOTIFICATION_CLICK, NOTIFICATION_EVENT } from '@shared/notifications'

contextBridge.executeInMainWorld({
  func: (eventName: string) => {
    const Native = window.Notification as typeof Notification | undefined
    if (!Native) return
    class PageNotification extends Native {
      constructor(title: string, options?: NotificationOptions) {
        super(title, options)
        this.addEventListener('click', () => window.dispatchEvent(new Event(eventName)))
      }
    }
    Object.defineProperty(window, 'Notification', {
      value: PageNotification,
      writable: true,
      configurable: true,
    })
  },
  args: [NOTIFICATION_EVENT],
})

window.addEventListener(NOTIFICATION_EVENT, () => ipcRenderer.send(NOTIFICATION_CLICK))
