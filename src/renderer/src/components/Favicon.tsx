import { Globe, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import styles from './Favicon.module.css'

interface FaviconProps {
  src: string | null
  loading?: boolean
  size?: number
}

export function Favicon({ src, loading = false, size = 16 }: FaviconProps) {
  const [failed, setFailed] = useState<string | null>(null)
  if (loading) return <LoaderCircle className={styles.spinner} size={size} strokeWidth={2} />
  if (!src || failed === src)
    return <Globe className={styles.fallback} size={size} strokeWidth={1.75} />
  return (
    <img
      className={styles.icon}
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailed(src)}
    />
  )
}
