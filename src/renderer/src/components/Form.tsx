import type { ReactNode } from 'react'
import styles from './Form.module.css'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.card}>{children}</div>
    </section>
  )
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {hint && <span className={styles.rowHint}>{hint}</span>}
      </div>
      {children && <div className={styles.rowControl}>{children}</div>}
    </div>
  )
}

export function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={[styles.toggle, checked && styles.toggleOn].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  )
}

interface Option<T extends string> {
  value: T
  label: string
}

export function Select<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T
  options: readonly Option<T>[]
  label: string
  onChange: (value: T) => void
}) {
  return (
    <select
      className={styles.select}
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = options.find((option) => option.value === event.target.value)
        if (next) onChange(next.value)
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={[styles.segment, option.value === value && styles.segmentOn]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Button({
  children,
  tone = 'default',
  onClick,
  disabled,
}: {
  children: ReactNode
  tone?: 'default' | 'primary' | 'danger'
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={[styles.button, styles[tone]].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
