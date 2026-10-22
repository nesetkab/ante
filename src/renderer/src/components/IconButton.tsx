import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './IconButton.module.css'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  size?: 'sm' | 'md'
}

export function IconButton({ label, children, size = 'md', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[styles.button, styles[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
