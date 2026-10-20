const fs = require('fs');
const path = require('path');
const builder = require('electron-builder');
const { resolveApp } = require('./common');

// flags: any of '--mac', '--win', '--linux'; none means the current OS.
function buildApp(id, flags = []) {
  const { dir, configPath, config } = resolveApp(id);

  const icon = ['icon.png', 'icon.icns', 'icon.ico']
    .map((f) => path.join(dir, f))
    .find((f) => fs.existsSync(f));

  const targets = {};
  if (flags.includes('--mac')) targets.mac = [];
  if (flags.includes('--win')) targets.win = [];
  if (flags.includes('--linux')) targets.linux = [];

  return builder.build({
    ...targets,
    publish: 'never',
    config: {
      appId: config.appId || `com.webapp.${id}`,
      productName: config.name,
      publish: [],
      directories: { output: path.join('dist', id) },
      files: ['src/**/*', 'package.json'],
      extraResources: [{ from: configPath, to: 'app-config.json' }],
      extraMetadata: { name: id, productName: config.name, homepage: config.url, desktopName: `${id}.desktop` },
      ...(icon && { icon }),
      mac: { target: ['dmg', 'zip'], category: 'public.app-category.productivity' },
      win: { target: ['nsis', 'portable'] },
      linux: { target: ['AppImage', 'deb'], category: 'Network', syncDesktopName: true },
    },
  });
}

function report(promise) {
  promise
    .then((out) => console.log('Built:\n' + out.join('\n')))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

if (require.main === module) {
  // Usage: npm run build -- <app-id> [--mac] [--win] [--linux]
  const [id, ...flags] = process.argv.slice(2);
  report(buildApp(id, flags));
}

module.exports = { buildApp, report };
