import { clipboard } from 'electron'

export function copyText(text: string): void {
  clipboard.writeText(text).catch((error: unknown) => {
    console.error('[clipboard] write failed', error)
  })
}

const SECRET_LIFETIME_MS = 60_000

export function copySecret(secret: string): void {
  copyText(secret)
  setTimeout(() => {
    clipboard
      .readText()
      .then((current) => {
        if (current === secret) clipboard.clear()
      })
      .catch(() => undefined)
  }, SECRET_LIFETIME_MS)
}
