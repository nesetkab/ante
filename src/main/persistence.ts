import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dataSchema, type Data } from '@shared/schema'
import { stripPrivate } from '@shared/state/private'

const SAVE_DELAY_MS = 500

export function toPersisted(input: Data): Data {
  const data = stripPrivate(input)
  const windows = Object.fromEntries(
    Object.values(data.windows)
      .filter((window) => window.kind === 'main')
      .map((window) => [window.id, { ...window, peekTabId: null, littleTabId: null }]),
  )
  return { ...data, windows }
}

export class Persistence {
  readonly #file: string
  #timer: NodeJS.Timeout | null = null
  #pending: Data | null = null

  constructor(file: string) {
    this.#file = file
    mkdirSync(dirname(file), { recursive: true })
  }

  load(): Data | null {
    let raw: string
    try {
      raw = readFileSync(this.#file, 'utf8')
    } catch {
      return null
    }
    try {
      const parsed = dataSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
      console.error('[persistence] invalid state file', parsed.error.issues.slice(0, 5))
    } catch (error) {
      console.error('[persistence] unreadable state file', error)
    }
    renameSync(this.#file, `${this.#file}.corrupt-${Date.now()}`)
    return null
  }

  schedule(data: Data): void {
    this.#pending = data
    this.#timer ??= setTimeout(() => {
      this.#timer = null
      this.flush()
    }, SAVE_DELAY_MS)
  }

  flush(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    const data = this.#pending
    this.#pending = null
    if (!data) return
    try {
      const temp = `${this.#file}.tmp`
      writeFileSync(temp, JSON.stringify(toPersisted(data)), 'utf8')
      renameSync(temp, this.#file)
    } catch (error) {
      console.error('[persistence] save failed', error)
    }
  }
}
