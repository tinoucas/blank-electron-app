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

function createApp(url, { id = idFromUrl(url), name, extraHosts = [] } = {}) {
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

// Extra hosts to allow when the start URL redirects to a domain the app wouldn't otherwise keep in-app.
function redirectHosts(url, finalUrl) {
  const start = baseHost(url);
  const final = baseHost(finalUrl);
  return final === start || final.endsWith('.' + start) ? [] : [final];
}

module.exports = { appsDir, listApps, resolveApp, normalizeUrl, idFromUrl, findAppByUrl, createApp, redirectHosts };
