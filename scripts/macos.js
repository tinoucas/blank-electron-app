const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveApp } = require('./common');

// macOS: installing means copying the built .app to ~/Applications, where Launchpad,
// Spotlight and the Dock pick it up. Apps built on this Mac are never quarantined, so
// the ad-hoc signature from the build is enough for Gatekeeper to let them run.

const appsFolder = path.join(os.homedir(), 'Applications');

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// Installed .app bundles made by this tool for the app at `url`: they carry its config.
function installedCopies(url) {
  if (!fs.existsSync(appsFolder)) return [];
  return fs
    .readdirSync(appsFolder)
    .filter((f) => f.endsWith('.app'))
    .map((f) => path.join(appsFolder, f))
    .filter((app) => readJson(path.join(app, 'Contents', 'Resources', 'app-config.json'))?.url === url);
}

// Removes installed copies, found by URL so copies under an older name or id go too.
function uninstall(id) {
  const removed = installedCopies(resolveApp(id).config.url);
  removed.forEach((app) => fs.rmSync(app, { recursive: true, force: true }));
  return removed;
}

function install(id, builtApp) {
  const { config } = resolveApp(id);
  uninstall(id);
  const dest = path.join(appsFolder, `${config.name}.app`);
  fs.mkdirSync(appsFolder, { recursive: true });
  // ditto keeps the bundle's symlinks and signature intact.
  execFileSync('ditto', [builtApp, dest]);
  return [dest];
}

function executable(app) {
  const dir = path.join(app, 'Contents', 'MacOS');
  return path.join(dir, fs.readdirSync(dir)[0]);
}

module.exports = {
  place: 'your Applications folder',
  // The "dir" target produces no artifact files; the .app is in dist/<id>/mac*/.
  findBuilt: (built, outDir) =>
    fs
      .readdirSync(outDir)
      .filter((d) => d.startsWith('mac'))
      .flatMap((d) => fs.readdirSync(path.join(outDir, d)).filter((f) => f.endsWith('.app')).map((f) => path.join(outDir, d, f)))[0],
  executable,
  install,
  uninstall,
};
