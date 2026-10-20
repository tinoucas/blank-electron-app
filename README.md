# webapp-shell

Wrap any website in its own desktop app with Electron. A single shared shell is
used by every app, and each app is defined by a config file in `apps/<id>/app.json`.

## Setup

```sh
npm install
```

## Create an app (or clone one for another URL)

```sh
npm run new -- https://app.example.com --name "My App"      # creates apps/app/app.json
npm run new -- https://other.site --name "Other" --id other  # pick the id yourself
```

Add an optional `icon.png` (at least 512×512) to the app folder. You can also use
`icon.icns` (macOS) or `icon.ico` (Windows).

## Run / package

```sh
npm start -- <id>                  # run in dev
npm run build -- <id>              # package for the current OS
npm run build -- <id> --mac --win  # choose platforms (building for macOS requires a Mac)
```

The output goes to `dist/<id>/`. Targets are dmg/zip (macOS), nsis/portable (Windows)
and AppImage/deb (Linux).

## `app.json`

| Key            | Meaning |
|----------------|---------|
| `name`         | Window title and product name. It also names the separate profile folder, so cookies and logins are kept apart for each app |
| `url`          | Start page |
| `appId`        | Unique bundle id, for example `com.yourco.myapp` |
| `width`/`height` | Initial window size. After the first run, the last size and position are remembered |
| `allowedHosts` | Domains (and their subdomains) that stay inside the app. Any other link opens in the default browser. Add your SSO/OAuth domains here, for example `accounts.google.com` |
| `userAgent`    | Optional override, for sites that block Electron's default user agent |

## What the shell does

- Only one instance runs at a time; launching it again focuses the existing window
- Remembers window size, position and maximized state
- Sandboxed renderer with no Node access for the remote site
- Navigate menu: Back (Alt+←), Forward (Alt+→), Home (Ctrl/Cmd+Shift+H)

Edit `author` in `package.json` before you ship Linux `.deb` packages.
