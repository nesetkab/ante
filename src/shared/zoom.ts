const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

export function nextZoom(current: number, delta: -1 | 0 | 1): number {
  if (delta === 0) return 1
  const index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001)
  const base = index < 0 ? ZOOM_STEPS.length - 1 : index
  const next =
    delta > 0 && ZOOM_STEPS[base] !== undefined && ZOOM_STEPS[base] > current + 0.001
      ? base
      : base + delta
  return ZOOM_STEPS[Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1)] ?? 1
}
