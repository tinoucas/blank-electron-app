# blank-electron-app

Turn any website into a desktop app with one command.

```sh
git clone https://github.com/tinoucas/blank-electron-app
cd blank-electron-app
./create-app.sh music.example.com --name "Music"
```

On Windows, use `create-app.cmd` instead of `./create-app.sh`. The only thing you need
installed is [Node.js](https://nodejs.org) 20 or newer.

## What it does

1. Checks that the address is valid and that the page loads. If not, it stops and says why.
2. Finds the site's icon.
3. Builds the app. This takes about a minute, plus a one-time setup on the first run.
4. **Linux:** opens the app so you can check it, then asks whether to add it to your app
   menu. Answer `y` and it shows up there with its icon, in the title bar as well.
   **macOS / Windows:** the app or installer is in `dist/<id>/`.

Running the same command again updates the app. For example, add `--icon` or `--name`
to change the icon or the name; you stay logged in.

## Options

| Option | |
|---|---|
| `--name "My App"` | Name shown in the title bar and the app menu. Default: from the domain |
| `--icon <file or URL>` | Your own icon (PNG, JPEG, WebP, GIF, SVG or ICO). Default: the site's icon |
| `--id my-app` | Internal name used for files. Default: from `--name`. Rarely needed |
| `--skip-check` | Build even if the page can't be loaded right now |
| `--uninstall` | Remove the app from the app menu |
| `--help` | Show all of this |

```sh
./create-app.sh 192.168.1.10:8095 --name "Music Assistant" --icon ~/Pictures/music.png
./create-app.sh 192.168.1.10:8095 --uninstall
```

## Good to know

- Links to the site and its subdomains open inside the app; any other link opens in your
  browser. If the site signs you in through another domain (Google, Microsoft…), add that
  domain to `allowedHosts` in `apps/<id>/app.json` and run the command again.
- Each app has its own cookies and logins, separate from your browser and from other apps.
- Without `http://` or `https://`, https is tried first, then http.
- Each app's settings are kept in `apps/<id>/`.
