import { useEffect, useState, type CSSProperties } from 'react'
import { useAppState, useWindowData } from '../store'
import { onUiEvent } from '../uiEvents'
import styles from './Toasts.module.css'

const TOAST_MS = 4000
const SIDEBAR_INSET = 10
const SPACE_BAR_HEIGHT = 48

interface Toast {
  id: number
  message: string
}

export function Toasts() {
  const [toast, setToast] = useState<Toast | null>(null)
  const window = useWindowData()
  const settings = useAppState((state) => state.data.settings)

  useEffect(() => {
    let counter = 0
    return onUiEvent((event) => {
      if (event.type === 'toast') setToast({ id: ++counter, message: event.message })
    })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  if (!toast) return null

  const inSidebar = window?.kind === 'main' && !window.sidebarHidden
  const style: CSSProperties = inSidebar
    ? {
        bottom: SPACE_BAR_HEIGHT,
        width: settings.sidebarWidth - SIDEBAR_INSET * 2,
        [settings.sidebarSide]: SIDEBAR_INSET,
      }
    : { bottom: 16, left: '50%', transform: 'translateX(-50%)' }

  return (
    <div key={toast.id} role="status" className={styles.toast} style={style}>
      {toast.message}
    </div>
  )
}
