const path = require('path');
const readline = require('readline/promises');
const { spawn } = require('child_process');
const { appsDir, normalizeUrl, findAppByUrl, createApp } = require('./common');
const { ensureIcon } = require('./icon');
const { buildApp } = require('./build');
const { installDesktop } = require('./desktop');

// Usage: node scripts/bundle.js <url>
// Reuses the app already configured for this URL, otherwise creates one, fetches the
// site's icon if the app has none, then packages it. On Linux, from a terminal, it then
// launches the AppImage and offers to install it in the app menu.
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: bundle <url>');
  process.exit(1);
}

let url;
try {
  url = normalizeUrl(args[0]);
} catch {
  console.error(`Not a valid URL: ${args[0]}`);
  process.exit(1);
}

let id = findAppByUrl(url);
if (id) {
  console.log(`Using existing apps/${id}/app.json`);
} else {
  try {
    id = createApp(url);
  } catch (err) {
    console.error(`${err.message} (it points to a different URL; use "npm run new -- ${url} --id <id>")`);
    process.exit(1);
  }
  console.log(`Created apps/${id}/app.json`);
}

async function tryAndInstall(appImage) {
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

(async () => {
  await ensureIcon(path.join(appsDir, id), url);
  const built = await buildApp(id);
  console.log('Built:\n' + built.join('\n'));

  const appImage = built.find((f) => f.endsWith('.AppImage'));
  if (process.platform === 'linux' && appImage && process.stdin.isTTY) await tryAndInstall(appImage);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
