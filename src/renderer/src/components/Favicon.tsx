import { Globe, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { siteFaviconUrl } from '@shared/url'
import styles from './Favicon.module.css'

interface FaviconProps {
  src: string | null
  pageUrl?: string
  loading?: boolean
  size?: number
}

export function Favicon({ src, pageUrl, loading = false, size = 16 }: FaviconProps) {
  const [failed, setFailed] = useState<readonly string[]>([])
  if (loading) return <LoaderCircle className={styles.spinner} size={size} strokeWidth={2} />
  const candidate = [src, pageUrl ? siteFaviconUrl(pageUrl) : null].find(
    (url): url is string => url !== null && !failed.includes(url),
  )
  if (!candidate) return <Globe className={styles.fallback} size={size} strokeWidth={1.75} />
  return (
    <img
      className={styles.icon}
      src={candidate}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailed((previous) => [...previous, candidate])}
    />
  )
}
