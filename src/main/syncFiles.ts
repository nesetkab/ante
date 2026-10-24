import { randomUUID } from 'node:crypto'
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deviceFileSchema, type DeviceFile } from '@shared/sync'

const MAX_FILE_BYTES = 64 * 1024 * 1024

export const devicesDir = (folder: string): string => join(folder, 'devices')

export const deviceFileName = (deviceId: string): string => `${deviceId}.json`

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

export async function folderExists(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory()
  } catch {
    return false
  }
}

export async function readDeviceFile(path: string): Promise<DeviceFile | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return null
    const parsed = deviceFileSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export interface DeviceFiles {
  files: DeviceFile[]
  broken: string[]
}

export async function readDeviceFiles(folder: string): Promise<DeviceFiles> {
  const dir = devicesDir(folder)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if (isMissing(error)) return { files: [], broken: [] }
    throw error
  }
  const result: DeviceFiles = { files: [], broken: [] }
  for (const name of names.sort()) {
    if (name.startsWith('.') || !name.endsWith('.json')) continue
    const file = await readDeviceFile(join(dir, name))
    if (file && deviceFileName(file.deviceId) === name) result.files.push(file)
    else result.broken.push(name)
  }
  return result
}

const tempPath = (dir: string, deviceId: string): string =>
  join(dir, `.${deviceId}.${randomUUID()}.tmp`)

export async function writeDeviceFile(folder: string, file: DeviceFile): Promise<void> {
  const dir = devicesDir(folder)
  await mkdir(dir, { recursive: true })
  const temp = tempPath(dir, file.deviceId)
  try {
    await writeFile(temp, JSON.stringify(file), 'utf8')
    await rename(temp, join(dir, deviceFileName(file.deviceId)))
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

export function writeDeviceFileSync(folder: string, file: DeviceFile): void {
  const dir = devicesDir(folder)
  const temp = tempPath(dir, file.deviceId)
  try {
    writeFileSync(temp, JSON.stringify(file), 'utf8')
    renameSync(temp, join(dir, deviceFileName(file.deviceId)))
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}
