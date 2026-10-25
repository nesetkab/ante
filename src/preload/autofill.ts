import { ipcRenderer } from 'electron'
import {
  AUTOFILL_BLUR,
  AUTOFILL_FILL,
  AUTOFILL_FOCUS,
  AUTOFILL_PAGE,
  AUTOFILL_PROBE,
  AUTOFILL_SUBMIT,
  AUTOFILL_USERNAME,
  pickPassword,
  type FillValues,
} from '@shared/autofill'

interface LoginFields {
  username: HTMLInputElement | null
  password: HTMLInputElement | null
}

const TEXT_TYPES = new Set(['text', 'email', 'tel', ''])
const SUBMIT_DEDUPE_MS = 3000

let current: LoginFields | null = null
let lastSubmit = { key: '', at: 0 }

const usable = (input: HTMLInputElement) => {
  if (input.disabled || input.readOnly) return false
  const rect = input.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const inputsIn = (scope: ParentNode) => [...scope.querySelectorAll('input')]

const passwordsIn = (scope: ParentNode) =>
  inputsIn(scope).filter((input) => input.type === 'password' && usable(input))

function usernameBefore(password: HTMLInputElement): HTMLInputElement | null {
  const inputs = inputsIn(password.form ?? document)
  for (let index = inputs.indexOf(password) - 1; index >= 0; index -= 1) {
    const input = inputs[index]
    if (input && TEXT_TYPES.has(input.type) && usable(input)) return input
  }
  return null
}

const looksLikeUsername = (input: HTMLInputElement) =>
  input.autocomplete.includes('username') || input.type === 'email'

function loginFieldsFor(target: EventTarget | null): LoginFields | null {
  if (!(target instanceof HTMLInputElement) || !usable(target)) return null
  if (target.type === 'password') {
    if (target.autocomplete === 'new-password') return null
    return { username: usernameBefore(target), password: target }
  }
  if (!TEXT_TYPES.has(target.type)) return null
  const password = passwordsIn(target.form ?? document).find(
    (candidate) => usernameBefore(candidate) === target,
  )
  if (password) return { username: target, password }
  return looksLikeUsername(target) ? { username: target, password: null } : null
}

function setValue(input: HTMLInputElement, value: string): void {
  Reflect.set(HTMLInputElement.prototype, 'value', value, input)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const FILL_QUIET_MS = 1000
let quietUntil = 0

const inViewport = (rect: DOMRect) =>
  rect.width > 0 &&
  rect.height > 0 &&
  rect.left >= 0 &&
  rect.top >= 0 &&
  rect.right <= window.innerWidth &&
  rect.bottom <= window.innerHeight

function offer(target: EventTarget | null): void {
  if (Date.now() < quietUntil || !navigator.userActivation.isActive) return
  const fields = loginFieldsFor(target)
  if (!fields || !(target instanceof HTMLInputElement)) return
  const rect = target.getBoundingClientRect()
  if (!inViewport(rect)) return
  current = fields
  ipcRenderer.send(AUTOFILL_FOCUS, {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  })
}

document.addEventListener(
  'focusin',
  (event) => {
    if (event.isTrusted) offer(event.target)
  },
  true,
)

document.addEventListener(
  'mousedown',
  (event) => {
    if (event.isTrusted && event.target === document.activeElement) offer(event.target)
  },
  true,
)

const isCurrent = (target: EventTarget | null) =>
  current !== null && (target === current.username || target === current.password)

document.addEventListener(
  'focusout',
  (event) => {
    if (isCurrent(event.target)) ipcRenderer.send(AUTOFILL_BLUR)
  },
  true,
)

document.addEventListener(
  'input',
  (event) => {
    if (event.isTrusted && isCurrent(event.target)) ipcRenderer.send(AUTOFILL_BLUR)
  },
  true,
)

ipcRenderer.on(AUTOFILL_FILL, (_event, values: FillValues) => {
  const fields = current
  if (!fields) return
  quietUntil = Date.now() + FILL_QUIET_MS
  if (fields.username && values.username) setValue(fields.username, values.username)
  if (fields.password) {
    setValue(fields.password, values.password)
    fields.password.focus()
  }
})

ipcRenderer.on(AUTOFILL_PROBE, () => {
  ipcRenderer.send(AUTOFILL_PAGE, passwordsIn(document).length > 0)
})

function rememberUsername(scope: ParentNode): void {
  const field = inputsIn(scope).find(
    (input) => usable(input) && looksLikeUsername(input) && input.value.trim(),
  )
  if (field) ipcRenderer.send(AUTOFILL_USERNAME, field.value.trim())
}

function capture(scope: ParentNode): void {
  const fields = passwordsIn(scope)
  if (fields.length === 0) {
    rememberUsername(scope)
    return
  }
  const password = pickPassword(fields.map((field) => field.value))
  if (!password) return
  const field = fields.find((candidate) => candidate.value === password)
  const username = (field && usernameBefore(field)?.value.trim()) ?? ''
  const key = `${username}\n${password}`
  const now = Date.now()
  if (key === lastSubmit.key && now - lastSubmit.at < SUBMIT_DEDUPE_MS) return
  lastSubmit = { key, at: now }
  ipcRenderer.send(AUTOFILL_SUBMIT, { username, password })
}

const scopeOf = (element: Element) => element.closest('form') ?? document

document.addEventListener(
  'submit',
  (event) => {
    if (event.target instanceof HTMLFormElement) capture(event.target)
  },
  true,
)

document.addEventListener(
  'keydown',
  (event) => {
    if (event.isTrusted && event.key === 'Enter' && event.target instanceof HTMLInputElement)
      capture(scopeOf(event.target))
  },
  true,
)

document.addEventListener(
  'click',
  (event) => {
    if (!event.isTrusted) return
    const button =
      event.target instanceof Element
        ? event.target.closest('button, input[type=submit], [role=button]')
        : null
    if (button) capture(scopeOf(button))
  },
  true,
)
