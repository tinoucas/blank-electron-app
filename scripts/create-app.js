const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
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
  --name <name>      App name shown in the window title and the app menu.
                     Default: taken from the domain (app.example.com -> "App").
  --id <id>          Internal id (lowercase letters, digits, dashes) used for file names.
                     Default: derived from the name. Rarely needed.
  --icon <file|url>  Image to use as the app icon (PNG, JPEG, WebP, GIF, SVG or ICO;
                     512x512 or larger looks best). Default: the site's own icon.
  --skip-check       Don't check that the URL loads (e.g. the server is offline right
                     now, or uses a certificate only your system trusts).
  --uninstall        Remove the app from the app menu (Linux).
  -h, --help         Show this help.

Linux: once built, the app is launched so you can check it, and you are asked whether
to add it to your app menu.

Examples:
  ${self} music.example.com
  ${self} 192.168.1.10:8095 --name "Music Assistant" --icon ~/Pictures/music.png
  ${self} 192.168.1.10:8095 --uninstall`;

function parseArgs(argv) {
  const opts = { url: undefined, name: undefined, id: undefined, icon: undefined, skipCheck: false, uninstall: false, help: false };
  const withValue = { '--name': 'name', '--id': 'id', '--icon': 'icon' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (flag === '-h' || flag === '--help') opts.help = true;
    else if (flag === '--skip-check') opts.skipCheck = true;
    else if (flag === '--uninstall') opts.uninstall = true;
    else if (withValue[flag]) {
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
const { appsDir, distDir, resolveApp, findAppByUrl, createApp, renameApp, changeId, redirectHosts } = require('./common');
const { ensureIcon, loadIcon } = require('./icon');
const { buildApp } = require('./build');
const { installDesktop, uninstallDesktop } = require('./desktop');

async function tryAndInstall(id, appImage) {
  console.log(`\nLaunching ${path.basename(appImage)} so you can check it...`);
  const child = spawn(appImage, [], { stdio: 'ignore', detached: true });
  child.on('error', (err) => console.error(`Could not launch it: ${err.message}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Does everything look right? Add it to your app menu? [y/N] ');
  rl.close();
  try {
    process.kill(-child.pid);
  } catch {}

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Not added to the menu. Run the same command again when you want to.');
    return;
  }
  installDesktop(id, appImage);
  console.log(`Added "${resolveApp(id).config.name}" to your app menu.\nTo remove it: ${self} ${resolveApp(id).config.url} --uninstall`);
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

function uninstall() {
  const id = findForUninstall();
  const { config } = resolveApp(id);
  const removed = uninstallDesktop(id);
  fs.rmSync(path.join(distDir, id), { recursive: true, force: true });
  console.log(removed.length ? `Removed "${config.name}" from your app menu.` : `"${config.name}" was not in your app menu.`);
  console.log(`Kept its settings and icon in apps/${id}/ and its login data in your user config folder ("${config.profile || config.name}"), in case you create it again.`);
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
      changeId(id, opts.id);
      // The menu entry is named after the id; the new one is added at the end.
      if (uninstallDesktop(id).length) console.log(`Removed the menu entry for the old id "${id}"`);
      console.log(`Id changed from "${id}" to "${opts.id}"`);
      id = opts.id;
    }
    if (opts.name && renameApp(id, opts.name)) console.log(`Renamed to "${opts.name}"`);
  } else {
    const extraHosts = redirectHosts(url, finalUrl);
    id = createApp(url, { name: opts.name, id: opts.id, extraHosts });
    console.log(`Creating "${resolveApp(id).config.name}" (apps/${id})${extraHosts.length ? `, also allowing ${extraHosts} where ${url} redirects` : ''}`);
  }

  const dir = path.join(appsDir, id);
  if (customIcon) await customIcon(dir);
  else await ensureIcon(dir, url);

  console.log('Building (this takes a minute)...');
  const built = await buildApp(id);
  console.log(`Built:\n  ${built.join('\n  ')}`);

  const appImage = built.find((f) => f.endsWith('.AppImage'));
  if (process.platform !== 'linux' || !appImage) return;
  if (process.stdin.isTTY) await tryAndInstall(id, appImage);
  else console.log(`Run this from a terminal to be offered to add it to your app menu.`);
}

(opts.uninstall ? Promise.resolve().then(uninstall) : create()).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
