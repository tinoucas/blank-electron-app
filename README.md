# webapp-shell

Wrap any website in its own desktop app with Electron. A single shared shell is
used by every app, and each app is defined by a config file in `apps/<id>/app.json`.

## Setup

```sh
npm install
```

## Quick bundle (just a URL)

```sh
./bundle.sh https://app.example.com     # macOS / Linux
bundle.cmd https://app.example.com      # Windows
```

Given only a URL, this installs dependencies if they're missing. It then reuses the app
already configured for that URL, or creates `apps/<id>/app.json` if there isn't one. If the
app has no icon, it fetches the site's icon. Finally it packages the app for the current OS
into `dist/<id>/`. The id and name come from the
domain, for example `app.example.com` gives id `app` and name `App`. To change the name or
add an icon, edit the app folder and run the script again.

### Linux: try it, then install it

When you run `./bundle.sh` from a terminal on Linux, it launches the new AppImage and asks
whether everything looks right. If you answer `y`, it installs the app:

- `~/Applications/<Name>.AppImage`
- `~/.local/share/icons/hicolor/512x512/apps/<id>.png`
- `~/.local/share/applications/<id>.desktop`

After that the app appears in your app menu. On Wayland, this is also what puts the
right icon in the title bar: KDE and GNOME find a window's icon through the `.desktop`
file named after its app id, and Electron uses `<id>` as that id.

```sh
npm run desktop -- <id>              # install the AppImage already in dist/<id>/
npm run desktop -- <id> --uninstall  # remove all three files
```

Re-running the install replaces the copy in `~/Applications`. A `.desktop` file that this
tool did not create is never overwritten.

## Create an app (or clone one for another URL)

```sh
npm run new -- https://app.example.com --name "My App"      # creates apps/app/app.json
npm run new -- https://other.site --name "Other" --id other  # pick the id yourself
```

## Icons

`bundle` and `new` download the site's icon automatically and save it as
`apps/<id>/icon.png` (512×512). They check every icon the page declares
(`<link rel="icon">`, `apple-touch-icon`, the web app manifest), plus `/favicon.ico`
and `/apple-touch-icon.png`, and keep the largest one. SVG icons are preferred because
they scale without blurring. If the best icon available is small, it is upscaled and a
note is printed, since it may look soft.

To use your own icon, replace `icon.png` (or add `icon.icns`/`icon.ico`). An existing
icon is never overwritten, except by `npm run icon -- <id>`, which downloads it again.

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
