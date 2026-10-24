import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

function writeRemote(folder, name, writtenAt) {
  const devices = join(folder, 'devices')
  mkdirSync(devices, { recursive: true })
  const file = {
    schemaVersion: 1,
    deviceId: 'other-device',
    deviceName: 'Other Mac',
    writtenAt,
    entities: {
      'space:remote-space': {
        updatedAt: writtenAt,
        deleted: false,
        value: {
          id: 'remote-space',
          name,
          icon: null,
          color: '#1f9e8f',
          profileId: 'default',
          pinned: ['remote-tab'],
        },
      },
      'item:remote-tab': {
        updatedAt: 1,
        deleted: false,
        value: {
          kind: 'tab',
          id: 'remote-tab',
          savedUrl: 'https://example.com/',
          savedTitle: 'Example',
          customTitle: null,
          createdAt: 1,
        },
      },
    },
  }
  const temp = join(devices, '.other-device.tmp')
  writeFileSync(temp, JSON.stringify(file))
  writeFileSync(join(devices, 'broken.json'), '{nope')
  renameSync(temp, join(devices, 'other-device.json'))
}

export default async function sync({ store, waitFor }) {
  await waitFor((state) => Object.keys(state.data.windows).length === 1)
  const folder = mkdtempSync(join(tmpdir(), 'ante-sync-e2e-'))
  try {
    const spaceId = store.state.data.spaceOrder[0]
    store.dispatch({
      type: 'tab/create',
      tab: {
        kind: 'tab',
        id: 'local-tab',
        url: 'https://example.org/',
        title: 'Local',
        favicon: null,
        savedUrl: null,
        savedTitle: null,
        customTitle: null,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      },
      to: { type: 'pinned', spaceId },
      index: 0,
    })
    writeRemote(folder, 'From Other Mac', Date.now())

    const { deviceId } = store.state.data.settings.sync
    assert(deviceId, 'the device should get an id on first launch')
    store.dispatch({ type: 'sync/configure', patch: { folder } })

    await waitFor(
      (state) =>
        state.data.spaces['remote-space']?.name === 'From Other Mac' &&
        state.data.items['remote-tab']?.savedUrl === 'https://example.com/',
      20_000,
    )
    assert(store.state.data.spaces[spaceId]?.pinned.includes('local-tab'), 'local tabs stay')
    assert(store.state.data.spaceOrder.includes('remote-space'), 'remote space is listed')
    await waitFor((state) => state.runtime.sync?.state === 'ok', 10_000)
    assert(store.state.runtime.sync?.devices === 1, 'one other device is known')

    const ownFile = join(folder, 'devices', `${deviceId}.json`)
    await waitFor(() => existsSync(ownFile), 10_000)
    const own = JSON.parse(readFileSync(ownFile, 'utf8'))
    assert(own.deviceId === deviceId, 'own file names this device')
    assert(own.entities['space:remote-space'], 'own file carries the merged space')
    assert(own.entities['item:local-tab'], 'own file carries the local pinned tab')

    writeRemote(folder, 'Renamed Elsewhere', Date.now() + 1000)
    await waitFor(
      (state) => state.data.spaces['remote-space']?.name === 'Renamed Elsewhere',
      45_000,
    )

    store.dispatch({ type: 'sync/configure', patch: { folder: null } })
    await waitFor((state) => state.runtime.sync?.state === 'off', 5_000)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}
