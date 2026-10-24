import { describe, expect, it } from 'vitest'
import { describeLoadError, IGNORED_LOAD_ERRORS } from '@shared/loadErrors'

describe('describeLoadError', () => {
  it('explains common failures in plain words', () => {
    expect(describeLoadError({ code: -106, url: 'https://a.example' }).title).toBe("You're offline")
    expect(describeLoadError({ code: -105, url: 'https://typo.example' }).title).toBe(
      "This site can't be found",
    )
    expect(describeLoadError({ code: -102, url: 'http://localhost:1' }).title).toBe(
      "This site can't be reached",
    )
  })

  it('treats every certificate error as unsafe', () => {
    expect(describeLoadError({ code: -202, url: 'https://bad.example' }).title).toContain(
      'certificate',
    )
    expect(describeLoadError({ code: -201, url: 'https://bad.example' }).title).toContain(
      'certificate',
    )
  })

  it('falls back to the raw code', () => {
    expect(describeLoadError({ code: -999, url: 'https://a.example' }).detail).toBe(
      'Error code -999.',
    )
  })

  it('ignores cancelled loads', () => {
    expect(IGNORED_LOAD_ERRORS.has(-3)).toBe(true)
  })
})
