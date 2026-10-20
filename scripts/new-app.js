const fs = require('fs');
const path = require('path');
const { appsDir } = require('./common');

// Usage: npm run new -- <url> [--name "Display Name"] [--id app-id]
const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const name = opt('--name');
const idArg = opt('--id');
const url = args[0];

if (!url) {
  console.error('Usage: npm run new -- <url> [--name "Display Name"] [--id app-id]');
  process.exit(1);
}

const { hostname } = new URL(url);
const base = hostname.replace(/^www\./, '');
const id = idArg || base.split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
const displayName = name || id.charAt(0).toUpperCase() + id.slice(1);
const dir = path.join(appsDir, id);

if (fs.existsSync(dir)) {
  console.error(`apps/${id} already exists; pick another --id`);
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
const config = {
  name: displayName,
  url,
  appId: `com.webapp.${id}`,
  width: 1280,
  height: 800,
  allowedHosts: [base],
  userAgent: null,
};
fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`Created apps/${id}/app.json
Optional: add apps/${id}/icon.png (512x512 or larger)
Try it:   npm start -- ${id}
Package:  npm run build -- ${id}`);
