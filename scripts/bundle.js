const { normalizeUrl, findAppByUrl, createApp } = require('./common');
const { buildApp, report } = require('./build');

// Usage: node scripts/bundle.js <url>
// Reuses the app already configured for this URL, otherwise creates one, then packages it.
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: bundle <url>');
  process.exit(1);
}

let url;
try {
  url = normalizeUrl(args[0]);
} catch {
  console.error(`Not a valid URL: ${args[0]}`);
  process.exit(1);
}

let id = findAppByUrl(url);
if (id) {
  console.log(`Using existing apps/${id}/app.json`);
} else {
  try {
    id = createApp(url);
  } catch (err) {
    console.error(`${err.message} (it points to a different URL; use "npm run new -- ${url} --id <id>")`);
    process.exit(1);
  }
  console.log(`Created apps/${id}/app.json`);
}

report(buildApp(id));
