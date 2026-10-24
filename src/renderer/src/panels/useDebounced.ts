import { useEffect, useMemo, useRef } from 'react'

interface Pending<T> {
  timer: number
  value: T
}

export type DebouncedCallback<T> = ((value: T) => void) & { flush: () => void }

export function useDebouncedCallback<T>(
  callback: (value: T) => void,
  delay: number,
): DebouncedCallback<T> {
  const pending = useRef<Pending<T> | null>(null)
  const latest = useRef(callback)

  useEffect(() => {
    latest.current = callback
  }, [callback])

  useEffect(() => {
    const onHide = () => {
      const current = pending.current
      if (!current) return
      window.clearTimeout(current.timer)
      pending.current = null
      latest.current(current.value)
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [])

  return useMemo(() => {
    const flush = () => {
      const current = pending.current
      if (!current) return
      window.clearTimeout(current.timer)
      pending.current = null
      latest.current(current.value)
    }
    function debounced(value: T) {
      if (pending.current) window.clearTimeout(pending.current.timer)
      const timer = window.setTimeout(() => {
        pending.current = null
        latest.current(value)
      }, delay)
      pending.current = { timer, value }
    }
    debounced.flush = flush
    return debounced
  }, [delay])
}
