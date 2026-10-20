const fs = require('fs');
const path = require('path');

const appsDir = path.join(__dirname, '..', 'apps');

function listApps() {
  return fs.readdirSync(appsDir).filter((d) => fs.existsSync(path.join(appsDir, d, 'app.json')));
}

function resolveApp(id) {
  if (!id) {
    console.error(`Usage: npm run <start|build> -- <app-id>\nAvailable apps: ${listApps().join(', ')}`);
    process.exit(1);
  }
  const dir = path.join(appsDir, id);
  const configPath = path.join(dir, 'app.json');
  if (!fs.existsSync(configPath)) {
    console.error(`No app "${id}". Available apps: ${listApps().join(', ')}`);
    process.exit(1);
  }
  return { id, dir, configPath, config: JSON.parse(fs.readFileSync(configPath, 'utf8')) };
}

// Accept "example.com" as well as "https://example.com".
function normalizeUrl(url) {
  return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).href;
}

function baseHost(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function idFromUrl(url) {
  return baseHost(url).split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

// Returns the id of an existing app already pointing at this URL, if any.
function findAppByUrl(url) {
  return listApps().find((id) => {
    const { config } = resolveApp(id);
    return normalizeUrl(config.url) === url;
  });
}

// Display names end up in file and folder names (AppImage, profile folder), so keep them portable.
function validateName(name) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('The name is empty');
  if (n.length > 64) throw new Error('The name is too long (64 characters max)');
  if (/[<>:"/\\|?*\x00-\x1f]/.test(n)) throw new Error(`The name can't contain any of < > : " / \\ | ? * (got "${n}")`);
  if (/^\.+$/.test(n)) throw new Error(`Not a usable name: "${n}"`);
  return n;
}

// "Music Assistant" -> "music-assistant"
function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createApp(url, { name, id = (name && slugify(name)) || idFromUrl(url), extraHosts = [] } = {}) {
  const dir = path.join(appsDir, id);
  if (fs.existsSync(dir)) throw new Error(`apps/${id} already exists; pick another id`);
  fs.mkdirSync(dir, { recursive: true });
  const config = {
    name: name || id.charAt(0).toUpperCase() + id.slice(1),
    url,
    appId: `com.webapp.${id}`,
    width: 1280,
    height: 800,
    allowedHosts: [...new Set([baseHost(url), ...extraHosts])],
    userAgent: null,
  };
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(config, null, 2) + '\n');
  return id;
}

// Changes an app's display name, keeping its profile folder so logins survive.
function renameApp(id, name) {
  const { configPath, config } = resolveApp(id);
  if (config.name === name) return false;
  const updated = { name, profile: config.profile || config.name, ...config };
  updated.name = name;
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n');
  return true;
}

// Extra hosts to allow when the start URL redirects to a domain the app wouldn't otherwise keep in-app.
function redirectHosts(url, finalUrl) {
  const start = baseHost(url);
  const final = baseHost(finalUrl);
  return final === start || final.endsWith('.' + start) ? [] : [final];
}

module.exports = {
  appsDir,
  listApps,
  resolveApp,
  normalizeUrl,
  idFromUrl,
  findAppByUrl,
  validateName,
  createApp,
  renameApp,
  redirectHosts,
};
