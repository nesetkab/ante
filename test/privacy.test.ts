import { describe, expect, it } from 'vitest'
import { isAllowlisted, toggleAllowlist } from '@shared/adblock'
import {
  clearSitePermission,
  describeRequest,
  evaluate,
  permissionsForRequest,
  setSitePermissions,
} from '@shared/permissions'
import { FIND_BAR_SIZE, POPOVER_INSET, POPOVER_PAD, popoverRect } from '@shared/popover'
import { createInitialData, createAppState } from '@shared/state/initial'
import {
  createPrivateSpace,
  isPrivateProfile,
  removePrivateProfile,
  stripPrivate,
} from '@shared/state/private'

describe('permission decisions', () => {
  it('maps browser permission names to site permissions', () => {
    expect(permissionsForRequest('media', ['video', 'audio'])).toEqual(['camera', 'microphone'])
    expect(permissionsForRequest('geolocation')).toEqual(['location'])
    expect(permissionsForRequest('unknown-thing')).toBeNull()
  })

  it('asks only for what has not been decided and blocks if anything is blocked', () => {
    expect(evaluate({ camera: 'allow' }, ['camera', 'microphone'])).toEqual({
      result: 'ask',
      pending: ['microphone'],
    })
    expect(evaluate({ camera: 'allow', microphone: 'allow' }, ['camera', 'microphone'])).toEqual({
      result: 'allow',
    })
    expect(evaluate({ microphone: 'block' }, ['camera', 'microphone'])).toEqual({ result: 'block' })
  })

  it('stores and clears decisions per profile and origin', () => {
    const data = createInitialData('space')
    setSitePermissions(data, 'default', 'https://meet.example', ['camera', 'microphone'], 'allow')
    expect(data.sitePermissions.default?.['https://meet.example']).toEqual({
      camera: 'allow',
      microphone: 'allow',
    })
    clearSitePermission(data, 'default', 'https://meet.example', 'camera')
    expect(data.sitePermissions.default?.['https://meet.example']).toEqual({ microphone: 'allow' })
    clearSitePermission(data, 'default', 'https://meet.example')
    expect(data.sitePermissions).toEqual({})
  })

  it('ignores unknown profiles', () => {
    const data = createInitialData('space')
    setSitePermissions(data, 'missing', 'https://a.example', ['camera'], 'allow')
    expect(data.sitePermissions).toEqual({})
  })

  it('describes requests in plain words', () => {
    expect(describeRequest(['camera', 'microphone'])).toBe(
      'use your camera and use your microphone',
    )
  })
})

describe('ad block allowlist', () => {
  it('toggles hosts and matches subdomains of allowlisted sites', () => {
    const allowlist = toggleAllowlist([], 'news.example.com')
    expect(isAllowlisted(allowlist, 'https://news.example.com/article')).toBe(true)
    expect(isAllowlisted(allowlist, 'https://example.com')).toBe(false)
    expect(toggleAllowlist(allowlist, 'news.example.com')).toEqual([])
  })
})

describe('private spaces', () => {
  it('creates a private profile and space that never get saved', () => {
    const data = createInitialData('space')
    createPrivateSpace(data, 'private-1', 'secret')
    expect(isPrivateProfile(data.spaces.secret?.profileId)).toBe(true)
    expect(data.spaceOrder).not.toContain('secret')
    const saved = stripPrivate(data)
    expect(saved.spaces.secret).toBeUndefined()
    expect(saved.profiles['private-1']).toBeUndefined()
  })

  it('removes everything a private profile touched', () => {
    const state = createAppState(createInitialData('space'))
    createPrivateSpace(state.data, 'private-1', 'secret')
    state.data.items.tab = {
      kind: 'tab',
      id: 'tab',
      url: 'https://a.example',
      title: 'A',
      favicon: null,
      savedUrl: null,
      savedTitle: null,
      customTitle: null,
      createdAt: 0,
      lastActiveAt: 0,
    }
    state.data.spaces.secret?.today.push('tab')
    expect(removePrivateProfile(state, 'private-1', { closeWindows: true })).toBe(true)
    expect(state.data.items.tab).toBeUndefined()
    expect(state.data.spaces.secret).toBeUndefined()
    expect(state.data.profiles['private-1']).toBeUndefined()
  })
})

describe('popover placement', () => {
  it('pins the find bar to the top right of the pane', () => {
    const pane = { x: 260, y: 8, width: 1000, height: 800 }
    const rect = popoverRect(pane, {
      tabId: 't',
      find: { query: '', matches: 0, active: 0, focus: 1 },
      prompt: null,
    })
    expect(rect.width).toBe(FIND_BAR_SIZE.width + POPOVER_PAD * 2)
    expect(rect.x + rect.width).toBe(pane.x + pane.width - POPOVER_INSET + POPOVER_PAD)
  })
})
