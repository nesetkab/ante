import { z } from 'zod'
import type { HistoryQuery, HistoryResult } from './history'
import { idSchema } from './schema'

export { LIBRARY_IPC } from './libraryChannels'

export const downloadCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['open', 'show', 'cancel', 'retry', 'pause', 'resume', 'remove']),
    id: idSchema,
  }),
  z.object({ type: z.literal('clear') }),
])
export type DownloadCommand = z.infer<typeof downloadCommandSchema>

export interface LibraryApi {
  searchHistory(query: HistoryQuery): Promise<HistoryResult>
  deleteHistory(ids: number[]): Promise<void>
  clearHistory(): Promise<void>
  suggest(query: string): Promise<string[]>
  download(command: DownloadCommand): void
}
