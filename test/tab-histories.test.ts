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
    writeFileSync(file, JSON.stringify({ tab1: { ...history, index: 5 } }))
    expect(readTabHistories(file)).toEqual({})
    writeFileSync(file, JSON.stringify({ __proto__x: history, constructor: history }))
    expect(readTabHistories(file)).toEqual({})
  })
})
