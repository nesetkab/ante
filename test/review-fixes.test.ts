import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { describeExtensionAccess } from '@shared/extensions'
import type { AppState, DownloadRuntime } from '@shared/schema'
import type { Action } from '@shared/state/actions'
import { reduce } from '@shared/state/reducer'
import { buildState, makeTab } from './helpers'

const apply = (state: AppState, ...actions: Action[]) =>
  actions.reduce((current, action) => produce(current, (draft) => reduce(draft, action)), state)

describe('describeExtensionAccess', () => {
  it('summarizes broad host access and sensitive permissions', () => {
    expect(
      describeExtensionAccess({
        permissions: ['tabs', 'storage', 'cookies'],
        host_permissions: ['<all_urls>'],
      }),
    ).toEqual([
      'Read and change data on all websites',
      'See your open tabs and their addresses',
      'Read and change cookies',
    ])
  })

  it('counts narrower site access from content scripts', () => {
    expect(
      describeExtensionAccess({
        content_scripts: [{ matches: ['https://a.example/*', 'https://b.example/*'] }],
      }),
    ).toEqual(['Read and change data on 2 site patterns'])
  })

  it('says nothing for extensions that ask for nothing notable', () => {
    expect(describeExtensionAccess({ permissions: ['storage'] })).toEqual([])
  })
})

describe('private data stays private', () => {
  const privateState = () =>
    apply(
      buildState({ spaces: { s1: {} } }),
      { type: 'private/create', profileId: 'private-1', spaceId: 'secret' },
      { type: 'tab/create', tab: makeTab('t'), to: { type: 'today', spaceId: 'secret' }, index: 0 },
    )

  it('deletes private tabs instead of archiving them', () => {
    const cleared = apply(privateState(), { type: 'today/clear', spaceId: 'secret', now: 5 })
    expect(cleared.data.items.t).toBeUndefined()
    expect(cleared.data.archive).toEqual([])
  })

  it('forgets private downloads when the private profile goes away', () => {
    const download: DownloadRuntime = {
      id: 'd',
      url: 'https://a.example/file.zip',
      filename: 'file.zip',
      path: '/tmp/file.zip',
      state: 'completed',
      receivedBytes: 1,
      totalBytes: 1,
      startedAt: 0,
      finishedAt: 1,
      profileId: 'private-1',
    }
    const state = apply(privateState(), { type: 'download/add', download })
    expect(state.runtime.downloads.d).toBeDefined()
    const removed = apply(state, { type: 'private/remove', profileId: 'private-1' })
    expect(removed.runtime.downloads.d).toBeUndefined()
  })
})
