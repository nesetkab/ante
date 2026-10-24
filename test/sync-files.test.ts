import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDeviceFile, syncCycle, type DeviceFile } from '@shared/sync'
import { createInitialData } from '@shared/state/initial'
import {
  devicesDir,
  evictedName,
  folderExists,
  readDeviceFile,
  readDeviceFiles,
  writeDeviceFile,
  writeDeviceFileSync,
} from '../src/main/syncFiles'
import { buildData } from './helpers'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ante-sync-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const sample = (deviceId: string): DeviceFile =>
  createDeviceFile(
    deviceId,
    `Mac ${deviceId}`,
    { 'space:s1': { updatedAt: 5, deleted: false, value: { id: 's1' } } },
    10,
  )

describe('sync folder files', () => {
  it('reports whether the folder exists', async () => {
    expect(await folderExists(root)).toBe(true)
    expect(await folderExists(join(root, 'missing'))).toBe(false)
    writeFileSync(join(root, 'file'), 'x')
    expect(await folderExists(join(root, 'file'))).toBe(false)
  })

  it('reads nothing when no device has written yet', async () => {
    expect(await readDeviceFiles(root)).toEqual({ files: [], broken: [], evicted: [] })
  })

  it('writes atomically and reads the file back', async () => {
    await writeDeviceFile(root, sample('one'))
    await writeDeviceFile(root, sample('one'))
    expect(readdirSync(devicesDir(root))).toEqual(['one.json'])
    expect(await readDeviceFiles(root)).toEqual({ files: [sample('one')], broken: [], evicted: [] })
    expect(await readDeviceFile(join(devicesDir(root), 'one.json'))).toEqual(sample('one'))
  })

  it('writes synchronously for the final save on quit', async () => {
    mkdirSync(devicesDir(root), { recursive: true })
    writeDeviceFileSync(root, sample('two'))
    expect(readdirSync(devicesDir(root))).toEqual(['two.json'])
    expect((await readDeviceFiles(root)).files).toEqual([sample('two')])
  })

  it('skips broken, mismatched and temporary files without failing', async () => {
    await writeDeviceFile(root, sample('good'))
    const dir = devicesDir(root)
    writeFileSync(join(dir, 'broken.json'), '{not json')
    writeFileSync(join(dir, 'invalid.json'), JSON.stringify({ schemaVersion: 1 }))
    writeFileSync(join(dir, 'renamed.json'), JSON.stringify(sample('someone')))
    writeFileSync(join(dir, '.good.123.tmp'), 'partial')
    writeFileSync(join(dir, '.other.json.icloud'), 'placeholder')
    writeFileSync(join(dir, 'notes.txt'), 'hello')
    mkdirSync(join(dir, 'nested.json'))
    const result = await readDeviceFiles(root)
    expect(result.files).toEqual([sample('good')])
    expect(result.broken.sort()).toEqual([
      'broken.json',
      'invalid.json',
      'nested.json',
      'renamed.json',
    ])
    expect(result.evicted).toEqual([join(dir, '.other.json.icloud')])
  })

  it('ignores a placeholder once the real file is back', async () => {
    await writeDeviceFile(root, sample('back'))
    writeFileSync(join(devicesDir(root), '.back.json.icloud'), 'placeholder')
    expect((await readDeviceFiles(root)).evicted).toEqual([])
  })

  it.each([
    ['.abc.json.icloud', 'abc.json'],
    ['abc.json.icloud', null],
    ['.abc.txt.icloud', null],
    ['.abc.json', null],
  ])('reads the real name of %s', (name, expected) => {
    expect(evictedName(name)).toBe(expected)
  })

  it('fails to write when the folder is gone and leaves nothing behind', async () => {
    const gone = join(root, 'gone')
    expect(() => writeDeviceFileSync(gone, sample('x'))).toThrow()
    expect(await folderExists(gone)).toBe(false)
  })

  it('round trips two devices through a real folder', async () => {
    const aData = buildData({ spaces: { s1: { pinned: ['p1'] } } })
    const a = syncCycle({ data: aData, deviceId: 'a', baseline: null, remotes: [], now: 100 })
    await writeDeviceFile(root, createDeviceFile('a', 'A', a.entities, 100))
    const remotes = (await readDeviceFiles(root)).files
    const b = syncCycle({
      data: createInitialData('fresh'),
      deviceId: 'b',
      baseline: null,
      remotes,
      now: 200,
    })
    await writeDeviceFile(root, createDeviceFile('b', 'B', b.entities, 200))
    expect(b.data.spaces.s1?.pinned).toEqual(['p1'])
    expect((await readDeviceFiles(root)).files.map((file) => file.deviceId)).toEqual(['a', 'b'])
  })
})
