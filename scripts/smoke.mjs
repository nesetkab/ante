import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electron from 'electron'

const scenario = resolve(process.argv[2] ?? 'scripts/scenarios/smoke.mjs')
const userData = mkdtempSync(join(tmpdir(), 'ante-smoke-'))
const args = ['.']
if (process.platform === 'linux') args.push('--no-sandbox')

const child = spawn(electron, args, {
  stdio: 'inherit',
  env: { ...process.env, ANTE_AUTOMATION: scenario, ANTE_USER_DATA: userData },
})

const timer = setTimeout(() => {
  console.error('[smoke] timed out')
  child.kill('SIGKILL')
}, 90_000)

child.on('exit', (code) => {
  clearTimeout(timer)
  rmSync(userData, { recursive: true, force: true })
  process.exit(code ?? 1)
})
