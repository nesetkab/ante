import { describe, expect, it } from 'vitest'
import type { UpdateStatus } from '@shared/schema'
import { isNewer, parseRelease, parseVersion } from '@shared/updates'
import { apply, buildState } from './helpers'

describe('parseVersion', () => {
  it('reads plain, prefixed and prerelease versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3, null])
    expect(parseVersion('v0.10.0-beta.1')).toEqual([0, 10, 0, 'beta.1'])
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('latest')).toBeNull()
  })
})

describe('isNewer', () => {
  it.each([
    ['0.2.0', '0.1.0', true],
    ['0.1.10', '0.1.9', true],
    ['1.0.0', '0.99.99', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['0.2.0', '0.2.0-beta.1', true],
    ['0.2.0-beta.2', '0.2.0', false],
    ['nonsense', '0.1.0', false],
  ])('%s is newer than %s: %s', (candidate, current, expected) => {
    expect(isNewer(candidate, current)).toBe(expected)
  })
})

describe('parseRelease', () => {
  const release = {
    tag_name: 'v0.3.1',
    html_url: 'https://github.com/nesetkab/ante/releases/tag/v0.3.1',
  }

  it('reads the version and page of a published release', () => {
    expect(parseRelease(release)).toEqual({ version: '0.3.1', url: release.html_url })
  })

  it('skips drafts, prereleases, odd tags and foreign links', () => {
    expect(parseRelease({ ...release, draft: true })).toBeNull()
    expect(parseRelease({ ...release, prerelease: true })).toBeNull()
    expect(parseRelease({ ...release, tag_name: 'nightly' })).toBeNull()
    expect(parseRelease({ ...release, html_url: 'https://evil.test/ante' })).toBeNull()
    expect(parseRelease(null)).toBeNull()
  })
})

describe('runtime/update', () => {
  const status: UpdateStatus = {
    state: 'available',
    current: '0.1.0',
    version: '0.2.0',
    url: 'https://github.com/nesetkab/ante/releases/tag/v0.2.0',
    checkedAt: 5,
  }

  it('stores the status and keeps the same object when nothing changed', () => {
    const first = apply(buildState(), { type: 'runtime/update', status })
    expect(first.runtime.update).toEqual(status)
    const second = apply(first, { type: 'runtime/update', status: { ...status } })
    expect(second).toBe(first)
  })
})
