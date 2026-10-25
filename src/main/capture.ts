import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, clipboard, ClipboardItem, type WebContents } from 'electron'
import { captureFileName, captureTarget } from '@shared/capture'
import type { Rect } from '@shared/schema'
import type { TabManager } from './tabs'
import type { AppWindow } from './windows'

export function capturesDirectory(): string {
  return join(app.getPath('pictures'), 'Ante Captures')
}

export interface CapturedImage {
  png: Buffer
  width: number
  height: number
  sourceUrl: string
}

export async function capturePng(
  window: AppWindow,
  tabs: TabManager,
  region: Rect,
): Promise<CapturedImage | null> {
  const panes = window.layout?.panes ?? []
  const target = captureTarget(panes, region)
  const contents = target ? tabs.contents(target.tabId) : undefined
  if (!target || !contents) return null
  const image = await contents.capturePage(target.rect)
  return { png: image.toPNG(), ...image.getSize(), sourceUrl: contents.getURL() }
}

const MAX_FULL_PAGE_HEIGHT = 16_384

async function saveCapture(png: Buffer): Promise<string> {
  await clipboard.write([
    new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) }),
  ])
  const directory = capturesDirectory()
  await mkdir(directory, { recursive: true })
  const file = join(directory, captureFileName(new Date()))
  await writeFile(file, png)
  return file
}

export async function captureFullPage(contents: WebContents): Promise<string | null> {
  const { debugger: protocol } = contents
  const attached = protocol.isAttached()
  try {
    if (!attached) protocol.attach('1.3')
    const metrics = (await protocol.sendCommand('Page.getLayoutMetrics')) as {
      cssContentSize?: { width: number; height: number }
    }
    const size = metrics.cssContentSize
    if (!size) return null
    const shot = (await protocol.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.ceil(size.width),
        height: Math.min(Math.ceil(size.height), MAX_FULL_PAGE_HEIGHT),
        scale: 1,
      },
    })) as { data?: string }
    if (!shot.data) return null
    return await saveCapture(Buffer.from(shot.data, 'base64'))
  } finally {
    if (!attached && protocol.isAttached()) protocol.detach()
  }
}

export async function captureRegion(
  window: AppWindow,
  tabs: TabManager,
  region: Rect,
): Promise<string | null> {
  const captured = await capturePng(window, tabs, region)
  return captured ? saveCapture(captured.png) : null
}
