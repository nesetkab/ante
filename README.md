<p align="center"><img src="assets/logo-preview.png" alt="Ante" width="360" /></p>

# Ante

An open source browser that picks up where Arc left off.

Arc is being discontinued. Ante keeps the parts that made it good: a vertical sidebar, spaces, pinned tabs that remember where they belong, tabs that tidy themselves away, and a command bar for everything. It runs on Chromium through Electron, so sites behave the way they do in Chrome.

## Features

- **Sidebar with spaces.** Each space has its own pinned tabs, today tabs, color and icon. Swipe sideways on the sidebar or press `Ctrl+1…9` to switch.
- **Favorites, pinned and today tabs.** Favorites stay at the top for every space. Pinned tabs remember their home URL and can always jump back to it. Today tabs archive themselves after 12 hours (configurable).
- **Folders and split view.** Group pinned tabs into folders. Put up to four tabs side by side.
- **Command bar.** `⌘T` to open anything, `⌘L` to edit the current address. Search tabs, spaces and actions from one place.
- **Peek.** Links from pinned tabs to other sites open in a floating preview you can expand or dismiss.
- **Little windows.** `⌘⌥N` opens a quick window for a one-off link. Move it into a space when you want to keep it.
- **Hide the sidebar.** `⌘S` hides it, hover the edge to bring it back.
- **Profiles.** Spaces can use separate profiles with their own cookies and logins.

## Getting started

Requires Node 22.12 or newer.

```sh
npm install
npm run dev
```

## Scripts

| Command           | What it does                                         |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Run Ante with hot reload                             |
| `npm run build`   | Build the app into `out/`                            |
| `npm run check`   | Typecheck, lint, format check and unit tests         |
| `npm run smoke`   | Launch the built app and drive it through a scenario |
| `npm run package` | Build installers with electron-builder               |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is organized.

## License

MIT
