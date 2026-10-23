import { describe, expect, it } from 'vitest'
import { displayUrl, resolveInput } from '@shared/url'

describe('resolveInput', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['news.ycombinator.com/item?id=1', 'https://news.ycombinator.com/item?id=1'],
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1:8080/path', 'http://127.0.0.1:8080/path'],
    ['https://arc.net', 'https://arc.net'],
    ['about:blank', 'about:blank'],
    ['data:text/html,hello world', 'data:text/html,hello world'],
  ])('treats %s as an address', (input, expected) => {
    expect(resolveInput(input, 'google')).toBe(expected)
  })

  it.each(['how to cook rice', 'typescript', 'javascript:alert(1)', 'file name.txt'])(
    'searches for %s',
    (input) => {
      expect(resolveInput(input, 'duckduckgo')).toBe(
        `https://duckduckgo.com/?q=${encodeURIComponent(input)}`,
      )
    },
  )

  it('opens a blank page for empty input', () => {
    expect(resolveInput('   ', 'google')).toBe('about:blank')
  })
})

describe('displayUrl', () => {
  it('drops the scheme, www and trailing slash', () => {
    expect(displayUrl('https://www.example.com/')).toBe('example.com')
    expect(displayUrl('https://example.com/a?b=1#c')).toBe('example.com/a?b=1#c')
  })

  it('leaves non-web urls untouched', () => {
    expect(displayUrl('about:blank')).toBe('about:blank')
  })
})
