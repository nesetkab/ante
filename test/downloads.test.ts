import { describe, expect, it } from 'vitest'
import { formatBytes, safeFileName, splitExtension, uniqueFileName } from '@shared/downloads'
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
