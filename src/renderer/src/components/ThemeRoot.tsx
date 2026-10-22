import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useAppState, useWindowData } from '../store'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const subscribeDark = (listener: () => void) => {
  darkQuery.addEventListener('change', listener)
  return () => darkQuery.removeEventListener('change', listener)
}

export function ThemeRoot({ children }: { children: ReactNode }) {
  const window = useWindowData()
  const theme = useAppState((state) => state.data.settings.theme)
  const color = useAppState((state) =>
    window ? state.data.spaces[window.spaceId]?.color : undefined,
  )
  const systemDark = useSyncExternalStore(subscribeDark, () => darkQuery.matches)
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  useEffect(() => {
    if (color) document.documentElement.style.setProperty('--space', color)
  }, [color])

  return children
}
