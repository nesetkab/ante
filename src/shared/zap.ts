import { z } from 'zod'

export const zapNodeSchema = z.object({
  tag: z
    .string()
    .max(100)
    .regex(/^[a-z][a-z0-9-]*$/),
  id: z.string().max(500).nullable(),
  classes: z.array(z.string().max(500)).max(100),
  attributes: z.array(z.object({ name: z.string().max(100), value: z.string().max(500) })).max(20),
  nth: z.number().int().min(1).max(100_000),
  ofType: z.number().int().min(1).max(100_000),
})
export type ZapNode = z.infer<typeof zapNodeSchema>

export const zapPathSchema = z.array(zapNodeSchema).min(1).max(200)

export const STABLE_ATTRIBUTES = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-qa',
  'data-cy',
  'aria-label',
  'name',
  'role',
  'alt',
  'title',
] as const

const MAX_CANDIDATES = 80
const ANCESTOR_DEPTH = 4
const HASH_PREFIX = /^(css|sc|jsx|emotion|svelte|tw|chakra|mui|styled)-/i
const IDENTIFIER = /^-?[a-zA-Z_][\w-]*$/

function hex(char: string): string {
  return `\\${(char.codePointAt(0) ?? 0).toString(16)} `
}

export function cssEscape(value: string): string {
  let result = ''
  const chars = Array.from(value)
  chars.forEach((char, index) => {
    const isDigit = /[0-9]/.test(char)
    const leading = index === 0 || (index === 1 && chars[0] === '-')
    if (isDigit && leading) result += hex(char)
    else if (/[a-zA-Z0-9_-]/.test(char) || (char.codePointAt(0) ?? 0) >= 0x80) result += char
    else result += hex(char)
  })
  return result === '-' ? '\\-' : result
}

export function cssString(value: string): string {
  return `"${Array.from(value)
    .map((char) => (/[\w .,:/@#&%=+!?()-]/.test(char) ? char : hex(char)))
    .join('')}"`
}

function letterDigitSwitches(token: string): number {
  let switches = 0
  for (let index = 1; index < token.length; index += 1) {
    const prev = /\d/.test(token[index - 1] ?? '')
    const next = /\d/.test(token[index] ?? '')
    if (prev !== next) switches += 1
  }
  return switches
}

export function isStableToken(token: string): boolean {
  if (token.length < 2 || token.length > 48) return false
  if (!IDENTIFIER.test(token)) return false
  if (HASH_PREFIX.test(token)) return false
  if (/\d{4,}/.test(token)) return false
  if (/__[\w-]{5,}$/.test(token)) return false
  return letterDigitSwitches(token) < 3
}

function idSelector(node: ZapNode): string | null {
  return node.id && isStableToken(node.id) ? `#${cssEscape(node.id)}` : null
}

function attributeSelectors(node: ZapNode): string[] {
  return node.attributes
    .filter(
      (attribute) =>
        (STABLE_ATTRIBUTES as readonly string[]).includes(attribute.name) &&
        attribute.value.trim().length > 0 &&
        attribute.value.length <= 80,
    )
    .map((attribute) => `${node.tag}[${attribute.name}=${cssString(attribute.value)}]`)
}

function classSelectors(node: ZapNode): string[] {
  const stable = [...new Set(node.classes.filter(isStableToken))].slice(0, 4)
  const singles = stable.map((name) => `${node.tag}.${cssEscape(name)}`)
  const pairs: string[] = []
  for (let a = 0; a < stable.length; a += 1) {
    for (let b = a + 1; b < stable.length; b += 1) {
      pairs.push(`${node.tag}.${cssEscape(stable[a] ?? '')}.${cssEscape(stable[b] ?? '')}`)
    }
  }
  return [...singles, ...pairs]
}

function anchorSelectors(node: ZapNode): string[] {
  return [
    idSelector(node),
    ...attributeSelectors(node),
    ...classSelectors(node).slice(0, 3),
  ].filter((selector): selector is string => selector !== null)
}

function nthSelector(node: ZapNode): string {
  return node.ofType > 1 ? `${node.tag}:nth-of-type(${node.nth})` : node.tag
}

export function selectorCandidates(path: readonly ZapNode[]): string[] {
  const [target, ...ancestors] = path
  if (!target) return []
  const own = [idSelector(target), ...attributeSelectors(target), ...classSelectors(target)].filter(
    (selector): selector is string => selector !== null,
  )
  const self = [...own.slice(0, 4), nthSelector(target)]
  const candidates: string[] = [...own]

  ancestors.slice(0, ANCESTOR_DEPTH).forEach((ancestor, depth) => {
    for (const anchor of anchorSelectors(ancestor)) {
      for (const selector of self) {
        candidates.push(depth === 0 ? `${anchor} > ${selector}` : `${anchor} ${selector}`)
      }
    }
  })

  const chain: string[] = []
  for (const node of path) {
    const anchor = idSelector(node)
    if (anchor && chain.length > 0) candidates.push([anchor, ...chain].join(' > '))
    chain.unshift(nthSelector(node))
    if (node.tag === 'body') break
    if (chain.length >= 2 && chain.length <= 3) candidates.push(chain.join(' > '))
  }
  const unique = [...new Set(candidates)].slice(0, MAX_CANDIDATES - 1)
  return [...unique, chain.join(' > ')]
}
