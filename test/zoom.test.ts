import { describe, expect, it } from 'vitest'
import { nextZoom } from '@shared/zoom'

describe('nextZoom', () => {
  it.each([
    [1, 1, 1.1],
    [1, -1, 0.9],
    [1.1, 1, 1.25],
    [0.9, -1, 0.8],
    [1.05, 1, 1.1],
    [1.05, -1, 1],
    [0.3, 1, 0.33],
    [0.3, -1, 0.25],
    [0.25, -1, 0.25],
    [0.1, 1, 0.25],
    [0.1, -1, 0.25],
    [5, 1, 5],
    [7, 1, 5],
    [7, -1, 5],
    [1.0000001, 1, 1.1],
    [0.9999999, -1, 0.9],
  ] as const)('steps from %f by %i to %f', (current, delta, expected) => {
    expect(nextZoom(current, delta)).toBe(expected)
  })

  it.each([0.5, 1, 3.7])('resets %f to 1', (current) => {
    expect(nextZoom(current, 0)).toBe(1)
  })

  it('walks the whole range without getting stuck', () => {
    const up: number[] = []
    for (let zoom = 0.25; up.length < 20; zoom = nextZoom(zoom, 1)) up.push(zoom)
    expect(up.at(-1)).toBe(5)
    expect(new Set(up).size).toBe(17)
  })
})
