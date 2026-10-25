import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  copyExtensionData,
  profileExtensions,
  webStoreExtensions,
} from '../src/main/importers/extensions'

const a = 'a'.repeat(32)
const b = 'b'.repeat(32)
const c = 'c'.repeat(32)
const d = 'd'.repeat(32)

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ante-ext-test-'))
  dirs.push(dir)
  return dir
}

describe('extension import', () => {
  it('keeps enabled web store extensions only', () => {
    expect(
      webStoreExtensions([a, b, c, d, 'Temp', 'not-an-id'], {
        [a]: { location: 1, from_webstore: true, disable_reasons: [] },
        [b]: { location: 1, from_webstore: true, disable_reasons: [1] },
        [c]: { location: 5, from_webstore: false },
      }),
    ).toEqual([a, d])
  })

  it('reads the profile folder and both preference files', async () => {
    const profile = tempDir()
    for (const id of [a, b]) mkdirSync(join(profile, 'Extensions', id), { recursive: true })
    writeFileSync(
      join(profile, 'Secure Preferences'),
      JSON.stringify({ extensions: { settings: { [b]: { location: 1, state: 0 } } } }),
    )
    writeFileSync(join(profile, 'Preferences'), '{ not json')
    expect(await profileExtensions(profile)).toEqual([a])
    expect(await profileExtensions(join(profile, 'missing'))).toEqual([])
  })

  it('copies saved extension data without the lock file and never overwrites', async () => {
    const profile = tempDir()
    const storage = tempDir()
    const settings = join(profile, 'Local Extension Settings', a)
    mkdirSync(settings, { recursive: true })
    writeFileSync(join(settings, '000003.log'), 'data')
    writeFileSync(join(settings, 'LOCK'), '')
    await copyExtensionData(a, profile, storage)
    const copied = join(storage, 'Local Extension Settings', a)
    expect(existsSync(join(copied, '000003.log'))).toBe(true)
    expect(existsSync(join(copied, 'LOCK'))).toBe(false)
    writeFileSync(join(settings, 'new.log'), 'more')
    await copyExtensionData(a, profile, storage)
    expect(existsSync(join(copied, 'new.log'))).toBe(false)
  })
})
