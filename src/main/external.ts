import { resolve } from 'node:path'
import { app, shell } from 'electron'
import { isExternalUrl } from '@shared/routing'

export const BROWSER_PROTOCOLS = ['http', 'https'] as const

type Handler = (url: string) => void

class ExternalLinkQueue {
  #pending: string[] = []
  #handler: Handler | null = null

  listen(): void {
    app.on('open-url', (event, url) => {
      event.preventDefault()
      this.push(url)
    })
  }

  push(url: string): void {
    if (!isExternalUrl(url)) return
    if (this.#handler) this.#handler(url)
    else this.#pending.push(url)
  }

  attach(handler: Handler): void {
    this.#handler = handler
    const pending = this.#pending
    this.#pending = []
    for (const url of pending) handler(url)
  }
}

export const externalLinks = new ExternalLinkQueue()

export function urlArguments(argv: readonly string[]): string[] {
  return argv.slice(1).filter((arg) => isExternalUrl(arg))
}

function protocolClientArgs(): [string, string[]] | [] {
  if (process.platform !== 'win32' || !process.defaultApp) return []
  const entry = process.argv[1]
  return entry ? [process.execPath, [resolve(entry)]] : []
}

export function isDefaultBrowser(): boolean {
  return BROWSER_PROTOCOLS.every((protocol) =>
    app.isDefaultProtocolClient(protocol, ...protocolClientArgs()),
  )
}

export function setDefaultBrowser(): boolean {
  const registered = BROWSER_PROTOCOLS.map((protocol) =>
    app.setAsDefaultProtocolClient(protocol, ...protocolClientArgs()),
  ).every(Boolean)
  if (process.platform === 'win32') {
    shell.openExternal('ms-settings:defaultapps').catch(() => undefined)
  }
  return registered
}
