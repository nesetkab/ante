import { describe, expect, it } from 'vitest'
import { titleBadge } from '@shared/badges'

describe('titleBadge', () => {
  it.each([
    ['(3) Home / X', '3'],
    ['[12] Discord', '12'],
    ['(1,204) Feed', '99+'],
    ['(20+) Facebook', '20'],
    ['Inbox (7) - me@example.com - Gmail', '7'],
    ['Unread (2) | Mail', '2'],
    ['(0) Nothing', null],
    ['Top songs (2024) - Music', null],
    ['Gmail', null],
    ['', null],
    ['(3)Home', null],
  ])('reads %j as %j', (title, expected) => {
    expect(titleBadge(title)).toBe(expected)
  })
})
