import type { KeyboardEvent } from 'react'

const ROW = '[data-row]'
const FOLDER = '[data-folder]'

function folderHeader(folder: Element | null | undefined): HTMLElement | null {
  return folder?.querySelector<HTMLElement>(`:scope > ${ROW}`) ?? null
}

function parentRow(row: HTMLElement): HTMLElement | null {
  const folder = row.closest(FOLDER)
  if (!folder) return null
  const header = folderHeader(folder)
  return header === row ? folderHeader(folder.parentElement?.closest(FOLDER)) : header
}

export function onRowKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const row = event.target
  if (!(row instanceof HTMLElement) || !row.matches(ROW)) return
  if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(ROW)]
  const index = rows.indexOf(row)
  const focus = (target: HTMLElement | null | undefined) => {
    if (!target) return
    event.preventDefault()
    target.focus()
  }
  const expanded = row.getAttribute('aria-expanded')
  switch (event.key) {
    case 'ArrowDown':
      focus(rows[index + 1])
      return
    case 'ArrowUp':
      focus(rows[index - 1])
      return
    case 'Home':
      focus(rows[0])
      return
    case 'End':
      focus(rows.at(-1))
      return
    case 'ArrowRight':
      if (expanded === 'false') {
        event.preventDefault()
        row.click()
      } else if (expanded === 'true') focus(rows[index + 1])
      return
    case 'ArrowLeft':
      if (expanded === 'true') {
        event.preventDefault()
        row.click()
      } else focus(parentRow(row))
      return
    case 'Enter':
    case ' ':
      if (row instanceof HTMLButtonElement) return
      event.preventDefault()
      row.click()
  }
}
