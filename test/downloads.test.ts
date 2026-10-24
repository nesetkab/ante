import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  overallProgress,
  safeFileName,
  splitExtension,
  uniqueFileName,
} from '@shared/downloads'
import type { DownloadRuntime } from '@shared/schema'
import { parseSuggestions } from '@shared/suggest'

describe('download file names', () => {
  it('removes path separators and unsafe characters', () => {
    expect(safeFileName('../../etc/passwd')).toBe('_.._etc_passwd')
    expect(safeFileName('   ')).toBe('download')
  })

  it('keeps compound extensions together', () => {
    expect(splitExtension('archive.tar.gz')).toEqual(['archive', '.tar.gz'])
    expect(splitExtension('.env')).toEqual(['.env', ''])
  })

  it('numbers duplicates before the extension', () => {
    const taken = new Set(['report.pdf', 'report (1).pdf'])
    expect(uniqueFileName('report.pdf', (name) => taken.has(name))).toBe('report (2).pdf')
  })

  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB')
  })
})

describe('parseSuggestions', () => {
  it('reads open search responses and drops the typed query and duplicates', () => {
    expect(
      parseSuggestions(['ante', ['ante', 'Ante browser', 'ante browser', 'antelope']], 'ante'),
    ).toEqual(['Ante browser', 'antelope'])
  })

  it('reads phrase lists', () => {
    expect(parseSuggestions([{ phrase: 'arc browser' }], 'arc')).toEqual(['arc browser'])
  })

  it('ignores unknown shapes', () => {
    expect(parseSuggestions({ nope: true })).toEqual([])
  })
})

describe('overallProgress', () => {
  const download = (patch: Partial<DownloadRuntime>): DownloadRuntime => ({
    id: 'd',
    url: 'https://a.test/file',
    filename: 'file',
    path: '/tmp/file',
    state: 'progressing',
    receivedBytes: 0,
    totalBytes: 100,
    startedAt: 0,
    finishedAt: null,
    profileId: 'default',
    ...patch,
  })

  it('adds up active downloads', () => {
    expect(
      overallProgress([
        download({ receivedBytes: 50 }),
        download({ state: 'paused', receivedBytes: 25 }),
        download({ state: 'completed', receivedBytes: 100 }),
      ]),
    ).toEqual({ active: 2, fraction: 0.375 })
  })

  it('reports unknown progress when a size is missing', () => {
    expect(overallProgress([download({ totalBytes: 0 })])).toEqual({ active: 1, fraction: null })
  })

  it('is idle without active downloads', () => {
    expect(overallProgress([download({ state: 'cancelled' })])).toEqual({
      active: 0,
      fraction: null,
    })
  })
})
