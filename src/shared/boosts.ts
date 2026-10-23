import type { Boost, Id } from './schema'

export const BOOST_WORLD_ID = 1999
export const ZAP_WORLD_ID = 1998

export const boostFonts = [
  'Inter',
  'Helvetica Neue',
  'Avenir Next',
  'Georgia',
  'Iowan Old Style',
  'Charter',
  'Palatino',
  'Times New Roman',
  'Gill Sans',
  'Futura',
  'Menlo',
  'Courier New',
] as const

export const boostHues = [0, 24, 42, 96, 150, 186, 212, 248, 280, 320] as const

export function normalizeDomain(input: string): string {
  let text = input.trim().toLowerCase()
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  text = text.replace(/[/?#].*$/, '')
  text = text.replace(/^.*@/, '')
  text = text.replace(/:\d+$/, '')
  text = text.replace(/\.+$/, '')
  return text.replace(/^www\./, '')
}

export function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return normalizeDomain(parsed.hostname)
  } catch {
    return null
  }
}

export function domainMatches(host: string, domain: string): boolean {
  const normalizedHost = normalizeDomain(host)
  const normalizedDomain = normalizeDomain(domain)
  if (!normalizedHost || !normalizedDomain) return false
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`)
}

export function boostsForUrl(boosts: Record<Id, Boost>, url: string): Boost[] {
  const host = hostnameOf(url)
  if (!host) return []
  return Object.values(boosts)
    .filter((boost) => boost.enabled && domainMatches(host, boost.domain))
    .sort((a, b) => normalizeDomain(a.domain).length - normalizeDomain(b.domain).length)
}

export function findBoostForHost(boosts: Record<Id, Boost>, host: string): Boost | null {
  const normalized = normalizeDomain(host)
  const exact = Object.values(boosts).find((boost) => normalizeDomain(boost.domain) === normalized)
  if (exact) return exact
  return (
    Object.values(boosts)
      .filter((boost) => domainMatches(normalized, boost.domain))
      .sort((a, b) => b.domain.length - a.domain.length)[0] ?? null
  )
}

const FONT_TARGETS =
  'html body, html body *:not(pre):not(code):not(kbd):not(samp):not(i):not(svg *)' +
  ':not([class*="icon" i]):not([class*="symbol" i]):not([class*="fa-"])'

function fontCss(fontFamily: string): string {
  const family = fontFamily.replace(/["\\]/g, '')
  return `${FONT_TARGETS} { font-family: "${family}", system-ui, sans-serif !important; }`
}

function colorCss(tintHue: number | null, invert: boolean): string {
  const rules: string[] = []
  if (invert) {
    rules.push(
      'html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }',
      'img, video, picture, canvas, iframe, embed, object, [style*="background-image"] ' +
        '{ filter: invert(1) hue-rotate(180deg) !important; }',
    )
  }
  if (tintHue !== null) {
    const hue = Math.round(tintHue)
    rules.push(
      'html::after { content: ""; position: fixed; inset: 0; pointer-events: none; ' +
        `z-index: 2147483646; background: hsl(${hue} 85% 86%); mix-blend-mode: multiply; }`,
    )
  }
  return rules.join('\n')
}

export function zapCss(zaps: readonly string[]): string {
  return zaps.map((selector) => `${selector} { display: none !important; }`).join('\n')
}

export function composeBoostCss(boost: Boost): string {
  return [
    boost.fontFamily ? fontCss(boost.fontFamily) : '',
    colorCss(boost.tintHue, boost.invert),
    zapCss(boost.zaps),
    boost.css.trim(),
  ]
    .filter((part) => part.length > 0)
    .join('\n')
}

export function composeCssForUrl(boosts: Record<Id, Boost>, url: string): string {
  return boostsForUrl(boosts, url)
    .map(composeBoostCss)
    .filter((css) => css.length > 0)
    .join('\n')
}

export function scriptsForUrl(boosts: Record<Id, Boost>, url: string): string[] {
  return boostsForUrl(boosts, url)
    .map((boost) => boost.js.trim())
    .filter((js) => js.length > 0)
}
