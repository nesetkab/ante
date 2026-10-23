# Contributing to Ante

## Layout

```
src/
  shared/     Pure TypeScript shared by every process. No Electron imports.
    schema.ts       Zod schemas for all persisted data. Types are inferred from them.
    state/          The reducer, tree helpers, initial data and sanitizing.
    commands.ts     Commands the UI can ask the main process to run.
    layout.ts       Where the sidebar, tabs, splits and peek sit inside a window.
    shortcuts.ts    Every keyboard shortcut. The menu and command bar read from here.
  main/       The Electron main process.
    store.ts        Holds AppState. dispatch() runs the reducer through Immer and emits patches.
    tabs.ts         One WebContentsView per loaded tab. Mirrors page events into the store.
    windows.ts      Window chrome, overlay view and layout of tab views.
    commands.ts     Runs commands that need side effects (navigation, focus, clipboard).
    ipc.ts          Validates everything coming from renderers and streams patches back.
  preload/    Exposes the small `window.ante` API to our own UI surfaces only.
  renderer/   React UI. Two surfaces per window:
    chrome          The sidebar and frames behind the web content.
    overlay         A transparent view above web content for the command bar, peek and floating sidebar.
```

## How state flows

1. All state lives in one `AppState` in the main process: `data` is persisted, `runtime` is not.
2. The UI sends either a **UI action** (pure state change, validated by `uiActionSchema`) or a **command** (needs side effects, validated by `commandSchema`).
3. The main process applies it, Immer produces patches, and every UI surface applies those patches to its copy.
4. `WindowManager.syncNow()` reads the new state and attaches, positions or destroys tab views to match.

Anything that is pure logic belongs in `src/shared` with tests in `test/`.

## Rules

- TypeScript strict mode, no `any`, no non-null assertions.
- No code comments. Name things so they do not need them.
- Validate every message that crosses a process boundary with Zod.
- Tab content runs sandboxed with context isolation and no preload.
- Run `npm run check` and `npm run build && npm run smoke` before opening a pull request.

## Testing

- Unit tests: `test/*.test.ts`, run with `npm test`.
- End to end: `scripts/scenarios/*.mjs` receive an automation context (`store`, `run`, `waitFor`, `windows`) and drive the real app. Run one with `npm run build && node scripts/smoke.mjs scripts/scenarios/<name>.mjs`.
