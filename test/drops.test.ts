import { describe, expect, it } from 'vitest'
import { droppedUrls } from '@shared/drops'

describe('droppedUrls', () => {
  it('reads web links from a uri list and skips comments and other schemes', () => {
    expect(
      droppedUrls('# comment\r\nhttps://a.test/\nfile:///etc/passwd\nhttp://b.test/x', ''),
    ).toEqual(['https://a.test/', 'http://b.test/x'])
  })

  it('falls back to plain text that is a link', () => {
    expect(droppedUrls('', ' https://c.test/ ')).toEqual(['https://c.test/'])
    expect(droppedUrls('', 'just words')).toEqual([])
    expect(droppedUrls('', 'javascript:alert(1)')).toEqual([])
  })
})
