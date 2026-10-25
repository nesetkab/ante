import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, dialog, ShareMenu, type BaseWindow, type WebContents } from 'electron'
import { safeFileName } from '@shared/downloads'

export async function savePage(window: BaseWindow, contents: WebContents): Promise<void> {
  const name = safeFileName(contents.getTitle() || 'Page')
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    defaultPath: join(app.getPath('downloads'), `${name}.html`),
    filters: [
      { name: 'Web Page', extensions: ['html', 'htm'] },
      { name: 'PDF', extensions: ['pdf'] },
    ],
  })
  if (canceled || !filePath || contents.isDestroyed()) return
  if (extname(filePath).toLowerCase() === '.pdf')
    await writeFile(filePath, await contents.printToPDF({}))
  else await contents.savePage(filePath, 'HTMLComplete')
}

export async function pickFiles(window: BaseWindow): Promise<string[]> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ['openFile', 'multiSelections'],
  })
  return canceled ? [] : filePaths.map((path) => pathToFileURL(path).href)
}

export function sharePage(window: BaseWindow, url: string): void {
  if (process.platform !== 'darwin') return
  new ShareMenu({ urls: [url] }).popup({ window })
}

export async function clearAndReload(
  contents: WebContents,
  clear: 'cookies' | 'cache',
): Promise<void> {
  let origin: string
  try {
    origin = new URL(contents.getURL()).origin
  } catch {
    return
  }
  if (origin === 'null') return
  const storages =
    clear === 'cookies'
      ? (['cookies'] as const)
      : (['cachestorage', 'serviceworkers', 'shadercache'] as const)
  await contents.session.clearStorageData({ origin, storages: [...storages] })
  if (clear === 'cache') await contents.session.clearCache()
  if (contents.isDestroyed()) return
  if (clear === 'cache') contents.reloadIgnoringCache()
  else contents.reload()
}
