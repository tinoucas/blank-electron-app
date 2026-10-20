const fs = require('fs');
const path = require('path');
const builder = require('electron-builder');
// electron-builder's own logger; resolved from it so we hook the instance it uses.
const { log: builderLog } = require(require.resolve('builder-util', { paths: [path.dirname(require.resolve('electron-builder'))] }));
const { distDir, resolveApp } = require('./common');

// Packages the app for the current OS into dist/<id>/ and returns the produced files.
// electron-builder's detailed log is only shown if the build fails.
async function buildApp(id) {
  const output = [];
  const stream = builderLog.stream;
  builderLog.stream = { write: (text) => output.push(text) };
  try {
    return await runBuilder(id);
  } catch (err) {
    stream.write(output.join(''));
    throw err;
  } finally {
    builderLog.stream = stream;
  }
}

function runBuilder(id) {
  // Start from an empty folder so builds left over from an older name can't be picked up.
  fs.rmSync(path.join(distDir, id), { recursive: true, force: true });
  const { dir, configPath, config } = resolveApp(id);

  const icon = ['icon.png', 'icon.icns', 'icon.ico']
    .map((f) => path.join(dir, f))
    .find((f) => fs.existsSync(f));

  return builder.build({
    publish: 'never',
    config: {
      appId: config.appId || `com.webapp.${id}`,
      productName: config.name,
      publish: [],
      directories: { output: path.join(distDir, id) },
      files: ['src/**/*', 'package.json'],
      extraResources: [
        { from: configPath, to: 'app-config.json' },
        ...(fs.existsSync(path.join(dir, 'icon.png')) ? [{ from: path.join(dir, 'icon.png'), to: 'icon.png' }] : []),
      ],
      extraMetadata: { name: id, productName: config.name, homepage: config.url, desktopName: `${id}.desktop` },
      ...(icon && { icon }),
      mac: { target: ['dmg', 'zip'], category: 'public.app-category.productivity' },
      win: { target: ['nsis', 'portable'] },
      linux: { target: ['AppImage'], category: 'Network', syncDesktopName: true },
    },
  });
}

module.exports = { buildApp };
