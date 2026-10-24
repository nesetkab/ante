import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { MAX_SAVED_ENTRIES, type SavedHistory } from '@shared/navigation'
import { idSchema, type Id } from '@shared/schema'

const MAX_FILE_BYTES = 32 * 1024 * 1024

const historiesSchema = z.record(
  idSchema,
  z
    .object({
      entries: z
        .array(
          z.object({
            url: z.string().max(10_000),
            title: z.string().max(2_000),
            pageState: z.string().max(2_000_000).optional(),
          }),
        )
        .min(1)
        .max(MAX_SAVED_ENTRIES),
      index: z.number().int().min(0),
    })
    .refine((history) => history.index < history.entries.length),
)

export function readTabHistories(path: string): Record<Id, SavedHistory> {
  try {
    const text = readFileSync(path, 'utf8')
    if (text.length > MAX_FILE_BYTES) return {}
    return historiesSchema.safeParse(JSON.parse(text)).data ?? {}
  } catch {
    return {}
  }
}

export function writeTabHistoriesSync(path: string, histories: Record<Id, SavedHistory>): void {
  const temp = join(dirname(path), `.tab-histories.${randomUUID()}.tmp`)
  try {
    writeFileSync(temp, JSON.stringify(histories), 'utf8')
    renameSync(temp, path)
  } catch (error) {
    rmSync(temp, { force: true })
    console.warn('[tabs] could not save tab histories', error)
  }
}
