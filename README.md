<p align="center"><img src="assets/logo-preview.png" alt="Ante" width="360" /></p>

# Ante

An open source browser that picks up where Arc left off.

Arc is being discontinued. Ante keeps the parts that made it good: a vertical sidebar, spaces, pinned tabs that remember where they belong, tabs that tidy themselves away, and a command bar for everything. It runs on Chromium through Electron, so sites behave the way they do in Chrome.

## Features

- **Bring your Arc sidebar with you.** Ante finds Arc on your Mac and imports your spaces, pinned tabs, folders and favorites in one click.
- **Coming from Chrome, Brave or Edge?** Import your bookmarks as a space and bring your history along.
- **Sidebar with spaces.** Each space has its own pinned tabs, today tabs, color, icon and profile. Swipe sideways or press `Ctrl+1…9` to switch.
- **Favorites, pinned and today tabs.** Pinned tabs remember their home URL. Today tabs archive themselves after 12 hours (configurable). Drag anything anywhere.
- **Folders and split view.** Group pinned tabs into folders. Put up to four tabs side by side.
- **Command bar.** `⌘T` searches open tabs, history, spaces and actions, with inline autocomplete and search suggestions. Type a site like `youtube` and press Tab to search it directly. Pick any search engine, or add your own.
- **Peek and little windows.** Links from pinned tabs open in a floating preview. `⌘⌥N` opens a quick window for one-off links.
- **Boosts.** Restyle any site with CSS, JavaScript, fonts and colors, or zap away parts of a page.
- **Air Traffic Control.** Route links from other apps into the right space.
- **Chrome extensions.** Install from the Chrome Web Store. Extensions get their own button in the sidebar.
- **Built-in ad and tracker blocking**, Global Privacy Control, per-site permission prompts, private windows and per-profile data clearing.
- **Media mini player** for tabs playing in the background, with automatic picture in picture.
- **Sync without an account.** Point Ante at iCloud Drive, Dropbox or any synced folder and your spaces, pinned tabs, favorites, notes and boosts follow you to your other computers. No server, nothing leaves your own storage.
- **Notes and Easels.** Write notes or build freeform boards with text, drawings, links, images and page captures. Both live in the sidebar like tabs.
- **Live folders.** Follow any site with a feed and keep its latest posts in a pinned folder.
- **Capture** (`⌘⇧2`). Drag over any part of a page to copy and save it.
- **Library** with history, downloads and archived tabs (`⌘Y`). A ring on the library button shows download progress.
- **Favorites show unread counts** for sites like Gmail, Slack and Discord.
- **Tabs go to sleep.** Today tabs you haven't touched in an hour free their memory and reload when you come back. Calls, music and anything on screen stay awake.
- **Keyboard friendly.** Move through the sidebar with the arrow keys. Change any shortcut in Settings. `⌘⇧⌥C` copies the page as a Markdown link.
- **Tabs remember where you were.** Back and forward history and scroll position come back after a tab sleeps or Ante restarts.
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
