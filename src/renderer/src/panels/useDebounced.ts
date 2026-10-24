import { useEffect, useRef } from 'react'

interface Pending<T> {
  timer: number
  value: T
}

export function useDebouncedCallback<T>(callback: (value: T) => void, delay: number) {
  const pending = useRef<Pending<T> | null>(null)
  const latest = useRef(callback)

  useEffect(() => {
    latest.current = callback
  }, [callback])

  useEffect(() => {
    const flush = () => {
      const current = pending.current
      if (!current) return
      window.clearTimeout(current.timer)
      pending.current = null
      latest.current(current.value)
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  return (value: T) => {
    if (pending.current) window.clearTimeout(pending.current.timer)
    const timer = window.setTimeout(() => {
      pending.current = null
      latest.current(value)
    }, delay)
    pending.current = { timer, value }
  }
}
