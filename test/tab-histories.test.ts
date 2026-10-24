import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTabHistories, writeTabHistoriesSync } from '../src/main/tabHistories'

let root: string
let file: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ante-histories-'))
  file = join(root, 'tab-histories.json')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const history = {
  profileId: 'default',
  entries: [
    { url: 'https://a.test/', title: 'A' },
    { url: 'https://b.test/', title: 'B', pageState: 'c3RhdGU=' },
  ],
  index: 1,
}

describe('tab histories on disk', () => {
  it('round trips and leaves no temporary files', () => {
    writeTabHistoriesSync(file, { tab1: history })
    expect(readTabHistories(file)).toEqual({ tab1: history })
    expect(readdirSync(root)).toEqual(['tab-histories.json'])
  })

  it('returns nothing for missing, broken or invalid files', () => {
    expect(readTabHistories(file)).toEqual({})
    writeFileSync(file, '{oops')
    expect(readTabHistories(file)).toEqual({})
    writeFileSync(file, '[1, 2]')
    expect(readTabHistories(file)).toEqual({})
  })

  it('drops only the tabs whose saved history is invalid', () => {
    const huge = {
      ...history,
      entries: [{ url: `data:,${'x'.repeat(20_000)}`, title: '' }],
      index: 0,
    }
    writeFileSync(
      file,
      JSON.stringify({ good: history, bad: { ...history, index: 5 }, huge, constructor: history }),
    )
    expect(readTabHistories(file)).toEqual({ good: history })
    writeTabHistoriesSync(file, { good: history, huge })
    expect(readTabHistories(file)).toEqual({ good: history })
  })
})
