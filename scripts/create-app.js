const fs = require('fs');
const path = require('path');
const { execSync, spawn, spawnSync } = require('child_process');
const { parseUrl, resolveUrl } = require('./url');
const { validateName, validateId } = require('./common');

const self = process.platform === 'win32' ? 'create-app.cmd' : './create-app.sh';

const USAGE = `Usage: ${self} <url> [options]

Turns the website at <url> into a desktop app for this computer.
Running it again with the same URL updates that app.

Arguments:
  <url>              Address of the site. When https:// or http:// is omitted, https is
                     tried first, then http (handy for self-hosted servers).
                     The page must load, otherwise nothing is created.

Options:
  --name <name>      App name shown in the window title and where the app is installed.
                     Default: taken from the domain (app.example.com -> "App").
  --id <id>          Internal id (lowercase letters, digits, dashes) used for file names.
                     Default: derived from the name. Rarely needed.
  --icon <file|url>  Image to use as the app icon (PNG, JPEG, WebP, GIF, SVG or ICO;
                     512x512 or larger looks best). Default: the site's own icon.
  --no-context-menu  Turn off the right-click menu (Back, Forward, Refresh, Copy URL).
                     --context-menu turns it back on.
  --disable-mpris-controls
                     Turn off the system's media controls for what the site plays (on by
                     default): MPRIS on Linux (e.g. the KDE media widget), Now Playing on
                     macOS, the media overlay on Windows, and the keyboard's media keys.
                     --enable-mpris-controls turns them back on.
  --skip-check       Don't check that the URL loads (e.g. the server is offline right
                     now, or uses a certificate only your system trusts).
  --uninstall        Remove the installed app.
  -h, --help         Show this help.

Settings given with these options are kept when you run the command again.

Once built, the app is launched so you can check it, and you are asked whether to
install it (Linux: app menu, macOS: ~/Applications, Windows: Start menu).

Examples:
  ${self} music.example.com
  ${self} 192.168.1.10:8095 --name "Music Assistant" --icon ~/Pictures/music.png
  ${self} 192.168.1.10:8095 --uninstall`;

function parseArgs(argv) {
  const opts = { url: undefined, name: undefined, id: undefined, icon: undefined, settings: {}, skipCheck: false, uninstall: false, help: false };
  const withValue = { '--name': 'name', '--id': 'id', '--icon': 'icon' };
  // On/off switches stored in app.json, so they stick when the app is rebuilt.
  const switches = {
    '--context-menu': ['contextMenu', true],
    '--no-context-menu': ['contextMenu', false],
    '--enable-mpris-controls': ['mediaControls', true],
    '--disable-mpris-controls': ['mediaControls', false],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (flag === '-h' || flag === '--help') opts.help = true;
    else if (flag === '--skip-check') opts.skipCheck = true;
    else if (flag === '--uninstall') opts.uninstall = true;
    else if (switches[a]) {
      const [setting, value] = switches[a];
      if (opts.settings[setting] === !value) throw new Error(`${a} contradicts an earlier option`);
      opts.settings[setting] = value;
    } else if (withValue[flag]) {
      const v = inline ?? argv[++i];
      if (!v) throw new Error(`${flag} needs a value`);
      opts[withValue[flag]] = v;
    } else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else if (opts.url) throw new Error(`Only one URL is allowed (got "${opts.url}" and "${a}")`);
    else opts.url = a;
  }
  if (opts.help) return opts;
  if (!opts.url && !(opts.uninstall && opts.id)) throw new Error('No URL given');
  if (opts.url) parseUrl(opts.url);
  if (opts.name !== undefined) opts.name = validateName(opts.name);
  if (opts.id !== undefined) opts.id = validateId(opts.id);
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(1);
}
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

// Arguments are checked before installing anything, so mistakes get an instant answer.
const root = path.join(__dirname, '..');
if (!fs.existsSync(path.join(root, 'node_modules'))) {
  console.log('Installing dependencies (first run only)...');
  execSync('npm install', { cwd: root, stdio: 'inherit' });
}

const readline = require('readline/promises');
const { appsDir, distDir, resolveApp, findAppByUrl, createApp, renameApp, updateSettings, changeId, redirectHosts } = require('./common');
const { ensureIcon, loadIcon } = require('./icon');
const { buildApp } = require('./build');
// Where and how the built app gets installed on this OS; null where we only build.
const platform = { linux: './linux', darwin: './macos', win32: './windows' }[process.platform];
const installer = platform && require(platform);

// Closes the test launch, including Electron's helper processes.
function stop(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid);
  } catch {}
}

async function tryAndInstall(id, builtApp) {
  console.log(`\nLaunching ${path.basename(builtApp)} so you can check it...`);
  const child = spawn(installer.executable(builtApp), [], { stdio: 'ignore', detached: true, windowsHide: false });
  child.on('error', (err) => console.error(`Could not launch it: ${err.message}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Does everything look right? Install it in ${installer.place}? [y/N] `);
  rl.close();
  stop(child);

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Not installed. Run the same command again when you want to.');
    return;
  }
  const { config } = resolveApp(id);
  const [where] = installer.install(id, builtApp);
  console.log(`Installed "${config.name}" in ${installer.place} (${where}).\nTo remove it: ${self} ${config.url} --uninstall`);
}

// Finds the app for --uninstall without loading the page: the server may be gone for good.
function findForUninstall() {
  if (opts.id) return opts.id;
  const { url, schemeGiven } = parseUrl(opts.url);
  const candidates = schemeGiven ? [url.href] : [url.href, url.href.replace(/^https:/, 'http:')];
  for (const c of candidates) {
    const id = findAppByUrl(c);
    if (id) return id;
  }
  throw new Error(`No app was created for ${opts.url}`);
}

// Where Electron keeps the app's cookies and logins (see app.getPath('appData') in src/main.js).
function profileDir(config) {
  const home = require('os').homedir();
  const appData = {
    darwin: path.join(home, 'Library', 'Application Support'),
    win32: process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
  }[process.platform] || process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(appData, config.profile || config.name);
}

function uninstall() {
  const id = findForUninstall();
  const { config } = resolveApp(id);
  const removed = installer ? installer.uninstall(id) : [];
  fs.rmSync(path.join(distDir, id), { recursive: true, force: true });
  if (!installer) console.log(`Remove "${config.name}" like any other app on this system.`);
  else console.log(removed.length ? `Removed "${config.name}" from ${installer.place}.` : `"${config.name}" was not installed.`);
  console.log(`Kept its settings and icon in apps/${id}/ and its login data in ${profileDir(config)}, in case you create it again.`);
}

async function create() {
  if (!opts.skipCheck) console.log(`Checking ${opts.url}...`);
  const { url, finalUrl, warnings } = await resolveUrl(opts.url, { skipCheck: opts.skipCheck });
  warnings.forEach((w) => console.warn(`Warning: ${w}`));
  const customIcon = opts.icon && (await loadIcon(opts.icon));

  let id = findAppByUrl(url);
  if (id) {
    console.log(`Updating "${resolveApp(id).config.name}" (apps/${id})`);
    if (opts.id && opts.id !== id) {
      // The installed copy is tied to the old id; the new one is offered at the end.
      if (installer?.uninstall(id).length) console.log(`Removed the installed copy for the old id "${id}"`);
      changeId(id, opts.id);
      console.log(`Id changed from "${id}" to "${opts.id}"`);
      id = opts.id;
    }
    if (opts.name && renameApp(id, opts.name)) console.log(`Renamed to "${opts.name}"`);
    for (const change of updateSettings(id, opts.settings)) console.log(change);
  } else {
    const extraHosts = redirectHosts(url, finalUrl);
    id = createApp(url, { name: opts.name, id: opts.id, extraHosts, settings: opts.settings });
    console.log(`Creating "${resolveApp(id).config.name}" (apps/${id})${extraHosts.length ? `, also allowing ${extraHosts} where ${url} redirects` : ''}`);
  }

  const dir = path.join(appsDir, id);
  if (customIcon) await customIcon(dir);
  else await ensureIcon(dir, url);

  console.log('Building (this takes a minute)...');
  const built = await buildApp(id);
  const outputs = built.length ? built : [path.join(distDir, id)];
  console.log(`Built:\n  ${outputs.join('\n  ')}`);

  const builtApp = installer?.findBuilt(built, path.join(distDir, id));
  if (!builtApp) return;
  if (process.stdin.isTTY) await tryAndInstall(id, builtApp);
  else console.log(`Run this from a terminal to be offered to install it in ${installer.place}.`);
}

(opts.uninstall ? Promise.resolve().then(uninstall) : create()).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
