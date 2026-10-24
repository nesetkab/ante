<p align="center"><img src="assets/logo-preview.png" alt="Ante" width="360" /></p>

# Ante

An open source browser that picks up where Arc left off.

Arc is being discontinued. Ante keeps the parts that made it good: a vertical sidebar, spaces, pinned tabs that remember where they belong, tabs that tidy themselves away, and a command bar for everything. It runs on Chromium through Electron, so sites behave the way they do in Chrome.

## Features

- **Bring your Arc sidebar with you.** Ante finds Arc on your Mac and imports your spaces, pinned tabs, folders and favorites in one click.
- **Sidebar with spaces.** Each space has its own pinned tabs, today tabs, color, icon and profile. Swipe sideways or press `Ctrl+1…9` to switch.
- **Favorites, pinned and today tabs.** Pinned tabs remember their home URL. Today tabs archive themselves after 12 hours (configurable). Drag anything anywhere.
- **Folders and split view.** Group pinned tabs into folders. Put up to four tabs side by side.
- **Command bar.** `⌘T` searches open tabs, history, spaces and actions, with inline autocomplete and search suggestions.
- **Peek and little windows.** Links from pinned tabs open in a floating preview. `⌘⌥N` opens a quick window for one-off links.
- **Boosts.** Restyle any site with CSS, JavaScript, fonts and colors, or zap away parts of a page.
- **Air Traffic Control.** Route links from other apps into the right space.
- **Chrome extensions.** Install from the Chrome Web Store. Extensions get their own button in the sidebar.
- **Built-in ad and tracker blocking**, per-site permission prompts, private windows and per-profile data clearing.
- **Media mini player** for tabs playing in the background, with automatic picture in picture.
- **Library** with history, downloads and archived tabs (`⌘Y`).
- **Developer tools** docked next to the page.

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

GPL-3.0-or-later. See [LICENSE](LICENSE).
