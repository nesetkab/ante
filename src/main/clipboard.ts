import { clipboard } from 'electron'

export function copyText(text: string): void {
  clipboard.writeText(text).catch((error: unknown) => {
    console.error('[clipboard] write failed', error)
  })
}
