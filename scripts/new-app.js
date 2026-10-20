const path = require('path');
const { appsDir, createApp, redirectHosts } = require('./common');
const { resolveUrl } = require('./url');
const { ensureIcon, loadIcon } = require('./icon');

const USAGE = 'Usage: npm run new -- <url> [--name "Display Name"] [--id app-id] [--icon <file|url>] [--skip-check]';

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && !!args.splice(i, 1);
};
const name = opt('--name');
const id = opt('--id');
const icon = opt('--icon');
const skipCheck = flag('--skip-check');

if (args.length !== 1 || args[0].startsWith('-')) {
  console.error(USAGE);
  process.exit(1);
}

(async () => {
  const { url, finalUrl, warnings } = await resolveUrl(args[0], { skipCheck });
  warnings.forEach((w) => console.warn(`Warning: ${w}`));
  const customIcon = icon && (await loadIcon(icon));
  const created = createApp(url, { id, name, extraHosts: redirectHosts(url, finalUrl) });
  console.log(`Created apps/${created}/app.json`);
  const dir = path.join(appsDir, created);
  if (customIcon) await customIcon(dir);
  else await ensureIcon(dir, url);
  console.log(`Try it:   npm start -- ${created}
Package:  npm run build -- ${created}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
