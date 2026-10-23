import { useEffect, useState } from 'react'

const RESET_MS = 3000

export function useConfirm(action: () => void): [boolean, () => void] {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), RESET_MS)
    return () => clearTimeout(timer)
  }, [armed])
  const trigger = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    action()
  }
  return [armed, trigger]
}
