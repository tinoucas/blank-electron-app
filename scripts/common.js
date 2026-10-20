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

module.exports = { appsDir, listApps, resolveApp };
