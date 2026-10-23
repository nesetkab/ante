import { startOfDay } from '@shared/history'

const DAY = 24 * 60 * 60 * 1000
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const withYear = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function dayLabel(day: number, now = Date.now()): string {
  const today = startOfDay(now)
  if (day === today) return 'Today'
  if (day === startOfDay(today - DAY / 2)) return 'Yesterday'
  const sameYear = new Date(day).getFullYear() === new Date(now).getFullYear()
  return (sameYear ? weekday : withYear).format(day)
}

export function timeLabel(time: number): string {
  return clock.format(time)
}
