import { useEffect, useRef } from 'react'

export function useDebouncedCallback<T>(callback: (value: T) => void, delay: number) {
  const timer = useRef<number | null>(null)
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  }, [callback])
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  return (value: T) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      latest.current(value)
    }, delay)
  }
}
