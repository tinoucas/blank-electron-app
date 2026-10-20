# webapp-shell

Wrap any website in its own desktop app with Electron. A single shared shell is
used by every app, and each app is defined by a config file in `apps/<id>/app.json`.

## Setup

```sh
npm install
```

## Quick bundle (just a URL)

```sh
./bundle.sh https://app.example.com                      # macOS / Linux
bundle.cmd https://app.example.com                       # Windows
./bundle.sh 192.168.1.10:8095 --name "Music Assistant" --icon ~/Pictures/app.png
./bundle.sh --help
```

The steps it runs:

1. Checks the URL (see below).
2. Installs dependencies if they're missing.
3. Reuses the app already configured for that URL, or creates `apps/<id>/app.json`.
4. Sets the icon: your `--icon` if given, otherwise the site's own icon if the app has none yet.
5. Packages the app for the current OS into `dist/<id>/`.

Without `--name`, the id and name come from the domain: `app.example.com` gives id `app`
and name `App`. With `--name "Music Assistant"`, a new app gets the id `music-assistant`.

To rename an existing app, run the script again with the same URL and a new `--name`.
Only the display name changes. The id stays the same, so the installed `.desktop` entry
is updated in place, and the old profile folder is kept so you stay logged in. Names
can't contain `< > : " / \ | ? *`, because they are used in file names.

### URL checks

Nothing is created unless the URL is usable:

- Only `http://` and `https://` are accepted. A missing scheme means https, with a
  fallback to http for self-hosted servers that have no TLS.
- The URL can't contain a username or password, since it would end up inside the app.
- Host names and IP addresses must be well formed.
- The page must load. A DNS failure, refused connection, timeout, certificate error,
  404/410 or 5xx stops the build and explains why.
- Some problems only print a warning: 401/403 (often just a login page), a URL that
  isn't an HTML page, and plain http to a public host.
- If the URL redirects to another domain, that domain is added to `allowedHosts`.

`--skip-check` skips the load test, for example when the server is offline at build time
or uses a certificate that only your system trusts. The format checks always run.

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

To use your own icon, pass `--icon <file|url>` to `bundle`/`new`, or set it on an existing
app with `npm run icon -- <id> <file|url>`. PNG, JPEG, WebP, GIF, SVG and ICO all work; the
image is converted to `icon.png`. Without an image, `npm run icon -- <id>` downloads the
site's icon again. Apart from that, an existing icon is never replaced.

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
| `profile`      | Name of the profile folder, if it differs from `name`. Set automatically on rename so logins are kept |
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
