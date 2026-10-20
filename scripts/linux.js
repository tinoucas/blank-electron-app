const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveApp } = require('./common');

// Linux desktop integration for an AppImage. The .desktop file must be named after the
// app id: Electron uses the packaged desktopName (<id>.desktop) as the Wayland app_id,
// and KWin/GNOME look up the window's icon through the matching .desktop file.

const home = os.homedir();
const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
const appImagesDir = path.join(home, 'Applications');
const iconsDir = path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps');
const MARKER = 'X-Webapp-Shell=true';

const desktopFile = (id) => path.join(dataHome, 'applications', `${id}.desktop`);

// Reads an installed entry; null if there is none. Refuses entries this tool did not write.
function readEntry(id) {
  const file = desktopFile(id);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(MARKER)) throw new Error(`${file} exists and was not created by this tool; not touching it`);
  const field = (key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
  const exec = field('Exec')?.replace(/^"(.*)"$/, '$1').replace(/\\(["`$\\])/g, '$1');
  return { file, appImage: exec, icon: field('Icon') };
}

const quoteExec = (p) => `"${p.replace(/(["`$\\])/g, '\\$1')}"`;

function refreshMenus() {
  for (const [cmd, args] of [
    ['update-desktop-database', [path.join(dataHome, 'applications')]],
    ['kbuildsycoca6', []],
    ['kbuildsycoca5', []],
  ]) {
    try {
      execFileSync(cmd, args, { stdio: 'ignore' });
    } catch {}
  }
}

// Removes the menu entry and the files it points to (only those this tool put there).
function uninstall(id) {
  const entry = readEntry(id);
  if (!entry) return [];
  const removed = [entry.file];
  if (entry.appImage && path.dirname(entry.appImage) === appImagesDir && entry.appImage.endsWith('.AppImage')) removed.push(entry.appImage);
  if (entry.icon && path.dirname(entry.icon) === iconsDir) removed.push(entry.icon);
  removed.forEach((f) => fs.rmSync(f, { force: true }));
  refreshMenus();
  return removed;
}

function install(id, appImageSource) {
  const { dir, config } = resolveApp(id);
  // Clears the previous install, including an AppImage copy named after an older name.
  uninstall(id);

  const appImage = path.join(appImagesDir, `${config.name.replace(/[^\w.-]+/g, '-')}.AppImage`);
  fs.mkdirSync(appImagesDir, { recursive: true });
  fs.copyFileSync(appImageSource, appImage);
  fs.chmodSync(appImage, 0o755);

  const iconSource = path.join(dir, 'icon.png');
  const icon = path.join(iconsDir, `${id}.png`);
  const hasIcon = fs.existsSync(iconSource);
  if (hasIcon) {
    fs.mkdirSync(iconsDir, { recursive: true });
    fs.copyFileSync(iconSource, icon);
  }

  const file = desktopFile(id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${config.name}`,
      `Comment=${config.url}`,
      `Exec=${quoteExec(appImage)}`,
      ...(hasIcon ? [`Icon=${icon}`] : []),
      'Terminal=false',
      'Categories=Network;',
      `StartupWMClass=${id}`,
      MARKER,
      '',
    ].join('\n'),
  );
  refreshMenus();
  return [appImage, ...(hasIcon ? [icon] : []), file];
}

module.exports = {
  place: 'your app menu',
  findBuilt: (built) => built.find((f) => f.endsWith('.AppImage')),
  executable: (appImage) => appImage,
  install,
  uninstall,
};
