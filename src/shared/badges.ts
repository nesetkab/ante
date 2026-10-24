const LEADING = /^\s*[([](\d[\d,.]*)\+?[)\]]\s/
const INBOX = /\b(?:inbox|unread|messages|notifications)\s*\((\d[\d,.]*)\+?\)/i
const MAX_SHOWN = 99

function count(match: RegExpExecArray | null): number {
  if (!match?.[1]) return 0
  const value = Number(match[1].replace(/[,.]/g, ''))
  return Number.isSafeInteger(value) ? value : 0
}

export function titleBadge(title: string): string | null {
  const value = count(LEADING.exec(title)) || count(INBOX.exec(title))
  if (value <= 0) return null
  return value > MAX_SHOWN ? `${MAX_SHOWN}+` : String(value)
}
