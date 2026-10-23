import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const directory = resolve('scripts/scenarios')
const scenarios = readdirSync(directory)
  .filter((name) => name.endsWith('.mjs'))
  .sort()
const env = { ...process.env, ANTE_ARC_SIDEBAR: resolve('test/fixtures/arc/StorableSidebar.json') }

const failed = scenarios.filter((name) => {
  console.log(`[e2e] ${name}`)
  const result = spawnSync(process.execPath, ['scripts/smoke.mjs', join(directory, name)], {
    stdio: 'inherit',
    env,
  })
  return result.status !== 0
})

if (failed.length > 0) {
  console.error(`[e2e] failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`[e2e] ${scenarios.length} scenarios passed`)
