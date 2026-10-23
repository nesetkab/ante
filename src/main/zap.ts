import type { WebContents } from 'electron'
import { ZAP_WORLD_ID } from '@shared/boosts'
import { selectorCandidates, STABLE_ATTRIBUTES, zapPathSchema } from '@shared/zap'

export type ZapPick = { status: 'cancelled' } | { status: 'picked'; selector: string | null }

const PICKER = `new Promise((resolve) => {
  globalThis.__anteZap?.cancel()
  const ATTRIBUTES = ${JSON.stringify(STABLE_ATTRIBUTES)}
  const root = document.documentElement
  const box = document.createElement('div')
  box.setAttribute('style', 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none; box-sizing: border-box; border: 2px solid #e5484d; background: rgba(229, 72, 77, 0.12); border-radius: 4px; display: none;')
  const label = document.createElement('div')
  label.setAttribute('style', 'all: initial; position: absolute; left: -2px; top: -24px; padding: 2px 6px; border-radius: 4px; background: #e5484d; color: #fff; font: 600 11px/16px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; white-space: nowrap;')
  box.appendChild(label)
  const cursor = document.createElement('style')
  cursor.textContent = '*, *::before, *::after { cursor: crosshair !important; }'
  root.appendChild(cursor)
  root.appendChild(box)
  let current = null

  const targetOf = (element) => {
    let node = element
    while (node && node.getRootNode() instanceof ShadowRoot) node = node.getRootNode().host
    if (node instanceof SVGElement && !(node instanceof SVGSVGElement)) node = node.closest('svg') ?? node
    if (!node || node === root || node === document.body || node === box || box.contains(node)) return null
    return node
  }
  const fromPoint = (event) => targetOf(document.elementFromPoint(event.clientX, event.clientY))
  const place = () => {
    if (!current || !current.isConnected) {
      box.style.display = 'none'
      return
    }
    const rect = current.getBoundingClientRect()
    box.style.display = 'block'
    box.style.left = rect.left + 'px'
    box.style.top = rect.top + 'px'
    box.style.width = rect.width + 'px'
    box.style.height = rect.height + 'px'
    label.style.top = rect.top < 26 ? '2px' : '-24px'
    const first = current.classList[0]
    label.textContent = current.localName + (current.id ? '#' + current.id : first ? '.' + first : '')
  }
  const describe = (element) => {
    const path = []
    for (let node = element; node && node !== root; node = node.parentElement) {
      const parent = node.parentElement
      const siblings = parent ? Array.from(parent.children).filter((child) => child.localName === node.localName) : [node]
      path.push({
        tag: node.localName,
        id: node.id ? node.id.slice(0, 500) : null,
        classes: Array.from(node.classList).slice(0, 20).map((name) => name.slice(0, 500)),
        attributes: ATTRIBUTES.filter((name) => node.hasAttribute(name)).map((name) => ({ name, value: (node.getAttribute(name) ?? '').slice(0, 500) })),
        nth: siblings.indexOf(node) + 1,
        ofType: siblings.length,
      })
      if (node === document.body || path.length >= 200) break
    }
    return path
  }
  const swallow = (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const onMove = (event) => {
    const next = fromPoint(event)
    if (next === current) return
    current = next
    place()
  }
  const onClick = (event) => {
    swallow(event)
    const element = fromPoint(event)
    if (!element) return
    const path = describe(element)
    element.style.setProperty('display', 'none', 'important')
    globalThis.__anteZapTarget = element
    finish(path)
  }
  const onKey = (event) => {
    if (event.key !== 'Escape') return
    swallow(event)
    finish(null)
  }
  const blocked = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend']
  const finish = (result) => {
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place, true)
    for (const type of blocked) window.removeEventListener(type, swallow, true)
    box.remove()
    cursor.remove()
    if (globalThis.__anteZap === handle) delete globalThis.__anteZap
    resolve(result)
  }
  const handle = { cancel: () => finish(null) }
  globalThis.__anteZap = handle
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place, true)
  for (const type of blocked) window.addEventListener(type, swallow, true)
})`

function verifier(candidates: string[]): string {
  return `(() => {
  const target = globalThis.__anteZapTarget
  delete globalThis.__anteZapTarget
  if (!target) return null
  for (const selector of ${JSON.stringify(candidates)}) {
    try {
      const found = document.querySelectorAll(selector)
      if (found.length === 1 && found[0] === target) return selector
    } catch {}
  }
  return null
})()`
}

export async function pickZap(contents: WebContents): Promise<ZapPick> {
  const raw: unknown = await contents.executeJavaScriptInIsolatedWorld(ZAP_WORLD_ID, [
    { code: PICKER },
  ])
  if (raw === null) return { status: 'cancelled' }
  const path = zapPathSchema.safeParse(raw)
  if (!path.success) return { status: 'picked', selector: null }
  const candidates = selectorCandidates(path.data)
  const chosen: unknown = await contents.executeJavaScriptInIsolatedWorld(ZAP_WORLD_ID, [
    { code: verifier(candidates) },
  ])
  const selector = typeof chosen === 'string' && candidates.includes(chosen) ? chosen : null
  return { status: 'picked', selector }
}

export function cancelZap(contents: WebContents): void {
  if (contents.isDestroyed()) return
  contents
    .executeJavaScriptInIsolatedWorld(ZAP_WORLD_ID, [{ code: 'globalThis.__anteZap?.cancel()' }])
    .catch(() => undefined)
}
