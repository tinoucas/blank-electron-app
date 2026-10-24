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
4. Opens the app so you can check it, then asks whether to install it. Answer `y`:
   - **Linux:** it's added to your app menu, with its icon in the title bar as well.
   - **macOS:** it's copied to `~/Applications`, so it shows up in Launchpad and
     Spotlight and can be kept in the Dock.
   - **Windows:** it's copied to `%LOCALAPPDATA%\Programs` and added to the Start menu,
     from where you can pin it to the taskbar.

Running the same command again updates the app and keeps the options you set before.
Add `--icon` or `--name` to change the icon or the name; you stay logged in.

## Options

| Option | |
|---|---|
| `--name "My App"` | Name shown in the title bar and the app menu. Default: from the domain |
| `--icon <file or URL>` | Your own icon (PNG, JPEG, WebP, GIF, SVG or ICO). Default: the site's icon |
| `--id my-app` | Internal name used for files. Default: from `--name`. Rarely needed |
| `--no-context-menu` | Turn off the right-click menu (`--context-menu` turns it back on) |
| `--disable-mpris-controls` | Turn off your system's media controls (KDE media widget, macOS Now Playing, Windows media overlay, media keys) for the site's audio and video. On by default (`--enable-mpris-controls` turns them back on) |
| `--skip-check` | Build even if the page can't be loaded right now |
| `--uninstall` | Remove the installed app |
| `--help` | Show all of this |

```sh
./create-app.sh 192.168.1.10:8095 --name "Music Assistant" --icon ~/Pictures/music.png
./create-app.sh 192.168.1.10:8095 --uninstall
```

## Good to know

- Links to the site and its subdomains open inside the app; any other link opens in your
  browser. If the site signs you in through another domain (Google, Microsoft…), add that
  domain to `allowedHosts` in `apps/<id>/app.json` and run the command again.
- Right-click anywhere for Back, Forward, Refresh and Copy URL. Links, text fields and
  selected text get the usual copy/paste items too, and videos get a Loop toggle (except
  on sites with their own video menu, like YouTube).
- Media controls (MPRIS etc.) appear while the site plays audio or video itself. Sites that
  remote-control other speakers need to opt in: in Music Assistant, set *Settings → User
  Interface → Browser media controls* to *Any actively selected player*, inside the app.
- Each app has its own cookies and logins, separate from your browser and from other apps.
- Sites that talk to USB, HID or serial devices (WebUSB, WebHID, Web Serial) work: when the
  site asks for a device, the app shows a list to choose from and remembers your choice.
- Without `http://` or `https://`, https is tried first, then http.
- Each app's settings are kept in `apps/<id>/`.
- **Code signing:** none is needed on any OS for apps you build on your own computer.
  Signing only matters if you send a built app to someone else:
  - **macOS:** their Mac blocks it ("unidentified developer" or "damaged"). They can
    unblock it with `xattr -dr com.apple.quarantine "/path/to/App.app"`.
  - **Windows:** SmartScreen warns about it. They click *More info* → *Run anyway*.
- **Windows:** run `create-app.cmd` from Command Prompt or PowerShell. In Git Bash, the
  "install it?" question isn't shown.
