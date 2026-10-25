export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
] as const

const EPSILON = 0.001
const MAX_HOST = 253
const MIN_ZOOM = ZOOM_STEPS[0]
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 1

export function nextZoom(current: number, delta: -1 | 0 | 1): number {
  if (delta === 0) return 1
  if (delta > 0) return ZOOM_STEPS.find((step) => step > current + EPSILON) ?? MAX_ZOOM
  return ZOOM_STEPS.findLast((step) => step < current - EPSILON) ?? MIN_ZOOM
}

export function zoomHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const web = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    return web && host.length > 0 && host.length <= MAX_HOST ? host : null
  } catch {
    return null
  }
}
