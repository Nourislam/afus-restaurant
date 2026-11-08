# Running the app (and renderer-only preview)

## The app runs

```bash
npm run dev      # dev server on :5173 + Electron window
npm run build    # typecheck + production bundles (dist-electron/, dist/renderer/)
npm test         # vitest (DB, security, services, IPC registry)
```

`npm run dev` starts the Vite dev server for the renderer and launches the Electron main process, which
opens the window, migrates/seeds SQLite and registers the IPC channels (`[afus] 35 channels ready, …`).
The database lives in the OS app-data folder (`~/Library/Application Support/AFUS Restaurant/afus.sqlite`
on macOS) next to `backups/`, `logs/`, `reports/` and `webmenu/`.

## The `SMAppService` crash and the Electron version pin

Older builds crashed on launch with:

```
dyld[...]: Symbol not found: (_OBJC_CLASS_$_SMAppService)
  Referenced from: 'Electron Framework.framework/Electron Framework'
  Expected in: '/System/Library/Frameworks/ServiceManagement.framework/ServiceManagement'
```

That is dyld refusing to bind `SMAppService`, a class that only exists in `ServiceManagement.framework` on
**macOS 13 (Ventura) and newer**. Electron 45 (Chromium 139+) is built against that baseline, so on
macOS 12.7.6 the binary cannot load at all — nothing in the app's own code is involved.

The fix is the Electron version, not the app: `devDependencies.electron` is pinned to `^33.4.11`, whose
framework declares `minos 11.0`, so it loads on macOS 11/12 as well as on newer systems. Verified on this
machine (macOS 12.7.6, x64): `./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --version`
prints `v33.4.11` and `npm run dev` opens the window with no dyld error. Leave the pin in place unless you
drop macOS 11/12 support; bumping Electron past 33 will reintroduce this crash on those systems.

## If the Electron binary download fails

`npm install` downloads the binary from GitHub releases. On networks where `github.com` is blocked the
postinstall step times out even though the npm registry works. Point the downloader at a mirror:

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_CUSTOM_DIR="33.4.11" \
node node_modules/electron/install.js
```

That extracts `node_modules/electron/dist` and writes `path.txt`; the version must match
`node_modules/electron/package.json`.

## Renderer-only fallback

Without Electron the renderer bundle can still be inspected visually:

```bash
npm run build
npx vite preview --port 4173 --strictPort   # or: python3 -m http.server 4174 --directory dist/renderer
```

It shows the splash/setup/login shell, the AFUS mark, the boutique palette, RTL and dark mode. It cannot
log in or persist anything: the renderer is a view layer that only calls `window.afus.invoke()`, which
exists solely inside the preload script. For real behaviour (DB, IPC, auth, permissions) use `npm run dev`.
