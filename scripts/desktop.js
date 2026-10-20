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
const MARKER = 'X-Webapp-Shell=true';

function paths(id, name) {
  return {
    appImage: path.join(home, 'Applications', `${name.replace(/[^\w.-]+/g, '-')}.AppImage`),
    icon: path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps', `${id}.png`),
    desktop: path.join(dataHome, 'applications', `${id}.desktop`),
  };
}

// Refuse to touch a .desktop file this tool did not write.
function assertOwned(desktopPath) {
  if (fs.existsSync(desktopPath) && !fs.readFileSync(desktopPath, 'utf8').includes(MARKER)) {
    throw new Error(`${desktopPath} exists and was not created by this tool; not touching it`);
  }
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

function installDesktop(id, appImageSource) {
  const { dir, config } = resolveApp(id);
  const p = paths(id, config.name);
  assertOwned(p.desktop);

  fs.mkdirSync(path.dirname(p.appImage), { recursive: true });
  fs.copyFileSync(appImageSource, p.appImage);
  fs.chmodSync(p.appImage, 0o755);

  const iconSource = path.join(dir, 'icon.png');
  const hasIcon = fs.existsSync(iconSource);
  if (hasIcon) {
    fs.mkdirSync(path.dirname(p.icon), { recursive: true });
    fs.copyFileSync(iconSource, p.icon);
  }

  fs.mkdirSync(path.dirname(p.desktop), { recursive: true });
  fs.writeFileSync(
    p.desktop,
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${config.name}`,
      `Comment=${config.url}`,
      `Exec=${quoteExec(p.appImage)}`,
      ...(hasIcon ? [`Icon=${p.icon}`] : []),
      'Terminal=false',
      'Categories=Network;',
      `StartupWMClass=${id}`,
      MARKER,
      '',
    ].join('\n'),
  );
  refreshMenus();
  return p;
}

function uninstallDesktop(id) {
  const { config } = resolveApp(id);
  const p = paths(id, config.name);
  assertOwned(p.desktop);
  const removed = Object.values(p).filter((f) => fs.existsSync(f));
  removed.forEach((f) => fs.rmSync(f));
  refreshMenus();
  return removed;
}

function findAppImage(id) {
  const out = path.join(__dirname, '..', 'dist', id);
  const file = fs.existsSync(out) && fs.readdirSync(out).find((f) => f.endsWith('.AppImage'));
  if (!file) throw new Error(`No AppImage in dist/${id}; run the bundle first`);
  return path.join(out, file);
}

if (require.main === module) {
  // Usage: npm run desktop -- <app-id> [--uninstall]
  const [id, flag] = process.argv.slice(2);
  try {
    if (flag === '--uninstall') {
      const removed = uninstallDesktop(id);
      console.log(removed.length ? `Removed:\n${removed.join('\n')}` : 'Nothing installed');
    } else {
      const p = installDesktop(id, findAppImage(id));
      console.log(`Installed:\n${Object.values(p).join('\n')}`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { installDesktop, uninstallDesktop };
