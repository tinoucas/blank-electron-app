const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { parseUrl, resolveUrl } = require('./url');

const USAGE = `Usage: bundle <url> [options]

Wraps the website at <url> in a desktop app and packages it for this OS into dist/<id>/.
Running it again with the same URL rebuilds the existing app in apps/<id>/.

Arguments:
  <url>              http(s) address of the site. When the scheme is omitted, https://
                     is tried first, then http:// (handy for self-hosted servers).
                     The page must load, otherwise nothing is created.

Options:
  --icon <file|url>  Use this image as the app icon instead of the site's own icon
                     (PNG, JPEG, WebP, GIF, SVG or ICO; 512x512 or larger looks best).
                     Replaces the app's current icon.
  --skip-check       Don't check that the URL loads (e.g. the server is offline right
                     now, or uses a certificate only your system trusts).
  -h, --help         Show this help.

On Linux, when run from a terminal, the AppImage is launched afterwards and you are
asked whether to install it in your app menu.

Examples:
  bundle music.example.com
  bundle http://192.168.1.10:8095 --icon ~/Pictures/music.png
  bundle https://app.example.com --icon https://example.com/logo.svg`;

function parseArgs(argv) {
  const opts = { icon: undefined, skipCheck: false, help: false, url: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--skip-check') opts.skipCheck = true;
    else if (a === '--icon' || a.startsWith('--icon=')) {
      opts.icon = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!opts.icon) throw new Error('--icon needs a file or URL');
    } else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else if (opts.url) throw new Error(`Only one URL is allowed (got "${opts.url}" and "${a}")`);
    else opts.url = a;
  }
  if (!opts.help && !opts.url) throw new Error('No URL given');
  if (!opts.help) parseUrl(opts.url);
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
const { appsDir, findAppByUrl, createApp, redirectHosts } = require('./common');
const { ensureIcon, loadIcon } = require('./icon');
const { buildApp } = require('./build');
const { installDesktop } = require('./desktop');

async function tryAndInstall(id, appImage) {
  console.log(`\nLaunching ${path.basename(appImage)} so you can check it...`);
  const child = spawn(appImage, [], { stdio: 'ignore', detached: true });
  child.on('error', (err) => console.error(`Could not launch it: ${err.message}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Does everything look right? Install it in your app menu? [y/N] ');
  rl.close();
  try {
    process.kill(-child.pid);
  } catch {}

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log(`Not installed. Later: npm run desktop -- ${id}`);
    return;
  }
  const p = installDesktop(id, appImage);
  console.log(`Installed:\n  ${Object.values(p).join('\n  ')}\nUninstall: npm run desktop -- ${id} --uninstall`);
}

async function main() {
  if (!opts.skipCheck) console.log(`Checking ${opts.url}...`);
  const { url, finalUrl, warnings } = await resolveUrl(opts.url, { skipCheck: opts.skipCheck });
  warnings.forEach((w) => console.warn(`Warning: ${w}`));
  const customIcon = opts.icon && (await loadIcon(opts.icon));

  let id = findAppByUrl(url);
  if (id) {
    console.log(`Using existing apps/${id}/app.json`);
  } else {
    const extraHosts = redirectHosts(url, finalUrl);
    try {
      id = createApp(url, { extraHosts });
    } catch (err) {
      throw new Error(`${err.message} (it points to a different URL; use "npm run new -- ${url} --id <id>")`);
    }
    console.log(`Created apps/${id}/app.json${extraHosts.length ? ` (also allowing ${extraHosts}, where ${url} redirects)` : ''}`);
  }

  const dir = path.join(appsDir, id);
  if (customIcon) await customIcon(dir);
  else await ensureIcon(dir, url);

  const built = await buildApp(id);
  console.log('Built:\n' + built.join('\n'));

  const appImage = built.find((f) => f.endsWith('.AppImage'));
  if (process.platform === 'linux' && appImage && process.stdin.isTTY) await tryAndInstall(id, appImage);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
