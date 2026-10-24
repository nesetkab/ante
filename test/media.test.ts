import { describe, expect, it } from 'vitest'
import { nextMedia, pipTransitions, sameMedia, type MediaProbe } from '@shared/media'
import type { Runtime, TabMedia } from '@shared/schema'

const probe = (extra: Partial<NonNullable<MediaProbe>> = {}): MediaProbe => ({
  found: true,
  playing: true,
  video: true,
  pip: false,
  title: 'Song',
  artist: 'Artist',
  artwork: null,
  ...extra,
})

const playing: TabMedia = {
  playing: true,
  controllable: true,
  video: true,
  pip: false,
  title: 'Song',
  artist: 'Artist',
  artwork: null,
  startedAt: 100,
}

describe('nextMedia', () => {
  it('keeps the start time while media keeps playing', () => {
    expect(nextMedia(playing, probe(), true, 500)?.startedAt).toBe(100)
  })

  it('stamps a new start time when playback resumes', () => {
    expect(nextMedia({ ...playing, playing: false }, probe(), true, 500)?.startedAt).toBe(500)
  })

  it('falls back to an uncontrollable entry for audio it cannot find', () => {
    expect(nextMedia(null, probe({ found: false }), true, 10)).toMatchObject({
      controllable: false,
      playing: true,
    })
    expect(nextMedia(playing, null, false, 10)).toBeNull()
  })

  it('compares media by value', () => {
    expect(sameMedia(playing, { ...playing })).toBe(true)
    expect(sameMedia(playing, { ...playing, title: 'Other' })).toBe(false)
    expect(sameMedia(null, null)).toBe(true)
  })
})

describe('pipTransitions', () => {
  const runtime = (media: TabMedia | null) =>
    ({ tabs: { a: { media } }, windows: {}, downloads: {} }) as unknown as Runtime

  it('pops a playing video out when its tab is hidden', () => {
    const result = pipTransitions(new Set(['a']), new Set(), runtime(playing), new Set(), true)
    expect(result.enter).toEqual(['a'])
  })

  it('does nothing when auto picture in picture is off or the media is audio', () => {
    expect(
      pipTransitions(new Set(['a']), new Set(), runtime(playing), new Set(), false).enter,
    ).toEqual([])
    expect(
      pipTransitions(
        new Set(['a']),
        new Set(),
        runtime({ ...playing, video: false }),
        new Set(),
        true,
      ).enter,
    ).toEqual([])
  })

  it('brings automatically popped videos back when their tab returns', () => {
    const result = pipTransitions(new Set(), new Set(['a']), runtime(playing), new Set(['a']), true)
    expect(result.exit).toEqual(['a'])
  })
})
