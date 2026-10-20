const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');
const { resolveApp } = require('./common');

const { configPath } = resolveApp(process.argv[2]);
const child = spawn(electron, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env: { ...process.env, WEBAPP_CONFIG: configPath },
});
child.on('exit', (code) => process.exit(code ?? 0));
