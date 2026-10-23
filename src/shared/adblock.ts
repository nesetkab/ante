export function siteHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}

const covers = (entry: string, host: string) => host === entry || host.endsWith(`.${entry}`)

export function isAllowlisted(allowlist: readonly string[], url: string | null | undefined): boolean {
  const host = siteHost(url)
  return host !== null && allowlist.some((entry) => covers(entry, host))
}

export function toggleAllowlist(allowlist: readonly string[], host: string): string[] {
  const remaining = allowlist.filter((entry) => !covers(entry, host))
  return remaining.length === allowlist.length ? [...allowlist, host].sort() : remaining
}
