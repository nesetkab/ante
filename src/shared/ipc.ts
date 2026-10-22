import type { Patch } from 'immer'
import type { Command } from './commands'
import type { AppState } from './schema'
import type { UiAction } from './state/actions'

export const IPC = {
  snapshot: 'ante:snapshot',
  patches: 'ante:patches',
  dispatch: 'ante:dispatch',
  command: 'ante:command',
  ui: 'ante:ui',
} as const

export type UiEvent = { type: 'rename'; id: string } | { type: 'toast'; message: string }

export interface Snapshot {
  version: number
  state: AppState
}

export interface PatchBatch {
  from: number
  to: number
  patches: Patch[]
}

export interface AnteApi {
  platform: string
  snapshot(): Promise<Snapshot>
  onPatches(listener: (batch: PatchBatch) => void): () => void
  dispatch(action: UiAction): void
  command(command: Command): void
  onUiEvent(listener: (event: UiEvent) => void): () => void
}
