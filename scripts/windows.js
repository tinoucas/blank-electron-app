const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveApp } = require('./common');

// Windows: installing means copying the built app folder to %LOCALAPPDATA%\Programs (no admin
// rights needed) and adding a Start menu shortcut. Windows doesn't require signing, and
// SmartScreen only questions programs downloaded from the internet, not ones built here.

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const roamingAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const programsDir = path.join(localAppData, 'Programs');
const startMenuDir = path.join(roamingAppData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// Reads or writes a .lnk through Electron (see win-shortcut.js).
function shortcut(req) {
  const out = path.join(os.tmpdir(), `webapp-shortcut-${process.pid}.json`);
  const reqFile = `${out}.request`;
  fs.writeFileSync(reqFile, JSON.stringify({ ...req, out }));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    spawnSync(require('electron'), [path.join(__dirname, 'win-shortcut.js'), reqFile], { stdio: 'ignore', windowsHide: true, env });
    const result = readJson(out);
    if (!result?.ok) throw new Error(`Could not ${req.op} the shortcut ${req.path}${result?.error ? `: ${result.error}` : ''}`);
    return result;
  } finally {
    fs.rmSync(out, { force: true });
    fs.rmSync(reqFile, { force: true });
  }
}

const shortcutFor = (folder) => path.join(startMenuDir, `${path.basename(folder)}.lnk`);

function isOurShortcut(lnk, folder) {
  if (!fs.existsSync(lnk)) return false;
  const target = module.exports.shortcut({ op: 'read', path: lnk }).link.target || '';
  return path.dirname(target).toLowerCase() === folder.toLowerCase();
}

// Installed copies made by this tool for the app at `url`: they carry its config.
function installedCopies(url) {
  if (!fs.existsSync(programsDir)) return [];
  return fs
    .readdirSync(programsDir)
    .map((f) => path.join(programsDir, f))
    .filter((dir) => readJson(path.join(dir, 'resources', 'app-config.json'))?.url === url);
}

function removeFolder(dir, name) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    if (['EBUSY', 'EPERM'].includes(err.code)) throw new Error(`"${name}" is running; close it and try again`);
    throw err;
  }
}

// Removes installed copies and their shortcuts, found by URL so copies under an older name or id go too.
function uninstall(id) {
  const { config } = resolveApp(id);
  const removed = [];
  for (const dir of installedCopies(config.url)) {
    const lnk = shortcutFor(dir);
    if (isOurShortcut(lnk, dir)) {
      fs.rmSync(lnk, { force: true });
      removed.push(lnk);
    }
    removeFolder(dir, config.name);
    removed.push(dir);
  }
  return removed;
}

function install(id, builtDir) {
  const { config } = resolveApp(id);
  const dest = path.join(programsDir, config.name);
  const lnk = shortcutFor(dest);
  // Check for conflicts before removing the current install, so a refusal changes nothing.
  if (fs.existsSync(dest) && !installedCopies(config.url).includes(dest)) {
    throw new Error(`${dest} already exists and was not created by this tool; pick another --name`);
  }
  if (fs.existsSync(lnk) && !isOurShortcut(lnk, dest)) {
    throw new Error(`${lnk} already exists and belongs to another program; pick another --name`);
  }
  uninstall(id);

  fs.mkdirSync(programsDir, { recursive: true });
  fs.cpSync(builtDir, dest, { recursive: true });
  const exe = executable(dest);
  module.exports.shortcut({
    op: 'write',
    path: lnk,
    options: { target: exe, cwd: dest, icon: exe, iconIndex: 0, appUserModelId: config.appId, description: config.url },
  });
  return [dest, lnk];
}

function executable(dir) {
  const exe = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.exe') && !/^(squirrel|uninstall)/i.test(f));
  return path.join(dir, exe);
}

module.exports = {
  place: 'your Start menu',
  // The "dir" target produces no artifact files; the app is in dist/<id>/win-*unpacked/.
  findBuilt: (built, outDir) => {
    const dir = fs.readdirSync(outDir).find((d) => /^win-.*unpacked$/.test(d));
    return dir && path.join(outDir, dir);
  },
  executable,
  install,
  uninstall,
  shortcut,
};
