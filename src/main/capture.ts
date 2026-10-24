import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, clipboard, ClipboardItem } from 'electron'
import { captureFileName, captureTarget } from '@shared/capture'
import type { Rect } from '@shared/schema'
import type { TabManager } from './tabs'
import type { AppWindow } from './windows'

export function capturesDirectory(): string {
  return join(app.getPath('pictures'), 'Ante Captures')
}

export async function captureRegion(
  window: AppWindow,
  tabs: TabManager,
  region: Rect,
): Promise<string | null> {
  const panes = window.layout?.panes ?? []
  const target = captureTarget(panes, region)
  const contents = target ? tabs.contents(target.tabId) : undefined
  if (!target || !contents) return null
  const image = await contents.capturePage(target.rect)
  const png = image.toPNG()
  await clipboard.write([
    new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) }),
  ])
  const directory = capturesDirectory()
  await mkdir(directory, { recursive: true })
  const file = join(directory, captureFileName(new Date()))
  await writeFile(file, png)
  return file
}
