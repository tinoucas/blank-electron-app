const fs = require('fs');
const net = require('net');
const path = require('path');

const root = path.join(__dirname, '..');
const appsDir = path.join(root, 'apps');
const distDir = path.join(root, 'dist');

function listApps() {
  if (!fs.existsSync(appsDir)) return [];
  return fs.readdirSync(appsDir).filter((d) => fs.existsSync(path.join(appsDir, d, 'app.json')));
}

function resolveApp(id) {
  const dir = path.join(appsDir, id);
  const configPath = path.join(dir, 'app.json');
  if (!fs.existsSync(configPath)) throw new Error(`No app with id "${id}"`);
  return { id, dir, configPath, config: JSON.parse(fs.readFileSync(configPath, 'utf8')) };
}

function saveConfig(id, config) {
  fs.writeFileSync(path.join(appsDir, id, 'app.json'), JSON.stringify(config, null, 2) + '\n');
}

// Accept "example.com" as well as "https://example.com".
function normalizeUrl(url) {
  return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).href;
}

function baseHost(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

// "app.example.com" -> "app", "192.168.1.10" -> "192-168-1-10"
function idFromUrl(url) {
  const host = baseHost(url).replace(/^\[|\]$/g, '');
  return slugify(net.isIP(host) ? host : host.split('.')[0]) || 'app';
}

// Returns the id of the app pointing at this URL, if any.
function findAppByUrl(url) {
  return listApps().find((id) => normalizeUrl(resolveApp(id).config.url) === url);
}

// Display names end up in file and folder names (AppImage, profile folder), so keep them portable.
function validateName(name) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('The name is empty');
  if (n.length > 64) throw new Error('The name is too long (64 characters max)');
  if (/[<>:"/\\|?*\x00-\x1f]/.test(n)) throw new Error(`The name can't contain any of < > : " / \\ | ? * (got "${n}")`);
  // Windows can't have a folder named like a device, or ending with a dot.
  if (/^\.+$/.test(n) || /\.$/.test(n) || /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) throw new Error(`Not a usable name: "${n}"`);
  return n;
}

// Ids name the app folder, the Linux package and the .desktop file (which must match the
// Wayland app_id), so they stay simple.
function validateId(id) {
  const v = String(id ?? '').trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) || v.length > 40) {
    throw new Error(`Not a valid id: "${v}" (use lowercase letters, digits and single dashes, 40 characters max)`);
  }
  return v;
}

// "Music Assistant" -> "music-assistant"
function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

function assertIdFree(id) {
  if (fs.existsSync(path.join(appsDir, id))) {
    const other = listApps().includes(id) ? ` (it is used for ${resolveApp(id).config.url})` : '';
    throw new Error(`The id "${id}" is already taken${other}; choose another one with --id`);
  }
}

function createApp(url, { name, id = (name && slugify(name)) || idFromUrl(url), extraHosts = [], settings = {} } = {}) {
  assertIdFree(id);
  fs.mkdirSync(path.join(appsDir, id), { recursive: true });
  saveConfig(id, {
    name: name || id.charAt(0).toUpperCase() + id.slice(1),
    url,
    appId: `com.webapp.${id}`,
    width: 1280,
    height: 800,
    allowedHosts: [...new Set([baseHost(url), ...extraHosts])],
    userAgent: null,
    ...SETTING_DEFAULTS,
    ...settings,
  });
  return id;
}

// On/off features, set with create-app options (see create-app.js) and read by src/main.js.
const SETTING_DEFAULTS = { contextMenu: true, mediaControls: false };
const SETTING_LABELS = { contextMenu: 'Right-click menu', mediaControls: 'Media controls' };

// Applies changed settings to an existing app; returns a line per change.
function updateSettings(id, settings) {
  const { config } = resolveApp(id);
  const changes = Object.entries(settings)
    .filter(([key, value]) => (config[key] ?? SETTING_DEFAULTS[key]) !== value)
    .map(([key, value]) => `${SETTING_LABELS[key]}: ${value ? 'on' : 'off'}`);
  if (changes.length) saveConfig(id, { ...config, ...settings });
  return changes;
}

// Changes an app's display name, keeping its profile folder so logins survive.
function renameApp(id, name) {
  const { config } = resolveApp(id);
  if (config.name === name) return false;
  saveConfig(id, { ...config, name, profile: config.profile || config.name });
  return true;
}

// Moves an app to a new id. The profile folder follows the name, not the id, so logins survive.
function changeId(oldId, newId) {
  assertIdFree(newId);
  const { config } = resolveApp(oldId);
  fs.renameSync(path.join(appsDir, oldId), path.join(appsDir, newId));
  if (config.appId === `com.webapp.${oldId}`) saveConfig(newId, { ...config, appId: `com.webapp.${newId}` });
  fs.rmSync(path.join(distDir, oldId), { recursive: true, force: true });
}

// Extra hosts to allow when the start URL redirects to a domain the app wouldn't otherwise keep in-app.
function redirectHosts(url, finalUrl) {
  const start = baseHost(url);
  const final = baseHost(finalUrl);
  return final === start || final.endsWith('.' + start) ? [] : [final];
}

module.exports = {
  appsDir,
  distDir,
  resolveApp,
  findAppByUrl,
  validateName,
  validateId,
  createApp,
  renameApp,
  updateSettings,
  changeId,
  redirectHosts,
};
