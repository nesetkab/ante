export const AUTOFILL_FOCUS = 'ante:autofill:focus'
export const AUTOFILL_BLUR = 'ante:autofill:blur'
export const AUTOFILL_FILL = 'ante:autofill:fill'
export const AUTOFILL_SUBMIT = 'ante:autofill:submit'

export interface FieldRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FillValues {
  username: string
  password: string
}

export function pickPassword(values: readonly string[]): string | null {
  const filled = values.filter(Boolean)
  if (filled.length === 0) return null
  const last = filled.at(-1) ?? null
  if (filled.length >= 2 && filled.at(-2) === last) return last
  return filled.length === 3 ? (filled[1] ?? null) : (filled[0] ?? null)
}
