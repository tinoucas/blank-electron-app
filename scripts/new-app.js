const { normalizeUrl, createApp } = require('./common');

// Usage: npm run new -- <url> [--name "Display Name"] [--id app-id]
const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const name = opt('--name');
const id = opt('--id');

if (!args[0]) {
  console.error('Usage: npm run new -- <url> [--name "Display Name"] [--id app-id]');
  process.exit(1);
}

try {
  const created = createApp(normalizeUrl(args[0]), { id, name });
  console.log(`Created apps/${created}/app.json
Optional: add apps/${created}/icon.png (512x512 or larger)
Try it:   npm start -- ${created}
Package:  npm run build -- ${created}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
