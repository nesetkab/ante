import { describe, expect, it } from 'vitest'
import { accentFor, contrast, onAccent, parseHex } from '@shared/color'
import { spaceColors } from '@shared/state/initial'

describe('onAccent', () => {
  it('uses dark text on bright accents and white on deep ones', () => {
    expect(onAccent('#d99a21', false)).toBe('#141414')
    expect(onAccent('#3d6be0', false)).toBe('#ffffff')
  })

  it('keeps button text readable on every palette color in both themes', () => {
    for (const color of spaceColors) {
      for (const dark of [false, true]) {
        const space = parseHex(color)
        const text = parseHex(onAccent(color, dark))
        if (!space || !text) throw new Error(`bad color ${color}`)
        expect(contrast(accentFor(space, dark), text)).toBeGreaterThanOrEqual(3.5)
      }
    }
  })

  it('measures contrast symmetrically', () => {
    const white = { r: 255, g: 255, b: 255 }
    const black = { r: 0, g: 0, b: 0 }
    expect(contrast(white, black)).toBeCloseTo(21)
    expect(contrast(black, white)).toBeCloseTo(21)
  })
})
