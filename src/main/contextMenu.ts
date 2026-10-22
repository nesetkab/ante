import {
  Menu,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron'
import type { Command } from '@shared/commands'
import type { Id } from '@shared/schema'
import { copyText } from './clipboard'

interface ContextMenuDeps {
  contents: WebContents
  tabId: Id
  run: (command: Command) => void
}

export function buildContextMenu(
  params: ContextMenuParams,
  deps: ContextMenuDeps,
): MenuItemConstructorOptions[] {
  const { contents, tabId, run } = deps
  const items: MenuItemConstructorOptions[] = []
  const separator: MenuItemConstructorOptions = { type: 'separator' }

  if (params.linkURL) {
    items.push(
      {
        label: 'Open Link in New Tab',
        click: () => run({ type: 'open', input: params.linkURL, disposition: 'background' }),
      },
      {
        label: 'Open Link in Peek',
        click: () => run({ type: 'open', input: params.linkURL, disposition: 'peek' }),
      },
      {
        label: 'Open Link in Little Window',
        click: () => run({ type: 'open', input: params.linkURL, disposition: 'little' }),
      },
      {
        label: 'Open Link in New Window',
        click: () => run({ type: 'open', input: params.linkURL, disposition: 'window' }),
      },
      { label: 'Copy Link', click: () => copyText(params.linkURL) },
      separator,
    )
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push(
      {
        label: 'Open Image in New Tab',
        click: () => run({ type: 'open', input: params.srcURL, disposition: 'background' }),
      },
      { label: 'Save Image As…', click: () => contents.downloadURL(params.srcURL) },
      { label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) },
      { label: 'Copy Image Address', click: () => copyText(params.srcURL) },
      separator,
    )
  }

  if (params.isEditable) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) })
    }
    if (params.misspelledWord) {
      items.push(
        {
          label: 'Add to Dictionary',
          click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        separator,
      )
    }
    items.push(
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      separator,
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'pasteAndMatchStyle', enabled: params.editFlags.canPaste },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
      separator,
    )
  } else if (params.selectionText.trim()) {
    const text = params.selectionText.trim()
    const preview = text.length > 24 ? `${text.slice(0, 24)}…` : text
    items.push(
      { role: 'copy' },
      {
        label: `Search for “${preview}”`,
        click: () => run({ type: 'open', input: text, disposition: 'background' }),
      },
      separator,
    )
  }

  if (
    !params.linkURL &&
    !params.isEditable &&
    params.mediaType === 'none' &&
    !params.selectionText.trim()
  ) {
    items.push(
      {
        label: 'Back',
        enabled: contents.navigationHistory.canGoBack(),
        click: () => run({ type: 'tab/back', tabId }),
      },
      {
        label: 'Forward',
        enabled: contents.navigationHistory.canGoForward(),
        click: () => run({ type: 'tab/forward', tabId }),
      },
      { label: 'Reload', click: () => run({ type: 'tab/reload', tabId }) },
      separator,
      { label: 'Copy Page URL', click: () => run({ type: 'tab/copyUrl', tabId }) },
      { label: 'Print…', click: () => contents.print() },
      {
        label: 'View Page Source',
        click: () =>
          run({ type: 'open', input: `view-source:${contents.getURL()}`, disposition: 'newTab' }),
      },
      separator,
    )
  }

  items.push({ label: 'Inspect', click: () => contents.inspectElement(params.x, params.y) })
  return items
}

export function showContextMenu(params: ContextMenuParams, deps: ContextMenuDeps): void {
  Menu.buildFromTemplate(buildContextMenu(params, deps)).popup()
}
