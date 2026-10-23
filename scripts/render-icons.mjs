import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

const jobs = [
  { source: 'build/icon.svg', output: 'build/icon.png', width: 1024, height: 1024 },
  {
    source: 'assets/logo.svg',
    output: 'assets/logo-preview.png',
    width: 900,
    height: 336,
    color: '#ffffff',
    background: '#4d4662',
  },
]

async function render(window, directory, job) {
  const { source, output, width, height, color = '#000', background = 'transparent' } = job
  const svg = readFileSync(resolve(source), 'utf8').replace(
    '<svg ',
    `<svg width="${width}" height="${height}" `,
  )
  const page = join(directory, 'index.html')
  writeFileSync(
    page,
    `<!doctype html><html><body style="margin:0;background:${background};color:${color}">${svg}</body></html>`,
  )
  window.setContentSize(width, height)
  await window.loadFile(page)
  await new Promise((done) => setTimeout(done, 300))
  const image = await window.webContents.capturePage({ x: 0, y: 0, width, height })
  writeFileSync(resolve(output), image.resize({ width, height }).toPNG())
}

app
  .whenReady()
  .then(async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ante-icon-'))
    const window = new BrowserWindow({
      show: false,
      transparent: true,
      frame: false,
      useContentSize: true,
      paintWhenInitiallyHidden: true,
      enableLargerThanScreen: true,
      webPreferences: { sandbox: true },
    })
    for (const job of jobs) await render(window, directory, job)
    rmSync(directory, { recursive: true, force: true })
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
