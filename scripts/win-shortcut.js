// Runs under Electron, not Node: `electron win-shortcut.js <request.json>`.
// Electron can write the AppUserModelID into a Windows shortcut, which ties the Start menu
// entry to the running window (taskbar icon, pinning). The result goes to request.out.
const fs = require('fs');
const { app, shell } = require('electron');

const req = JSON.parse(fs.readFileSync(process.argv.at(-1), 'utf8'));

app.whenReady().then(() => {
  let result;
  try {
    if (req.op === 'write') result = { ok: shell.writeShortcutLink(req.path, 'replace', req.options) };
    else result = { ok: true, link: shell.readShortcutLink(req.path) };
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  fs.writeFileSync(req.out, JSON.stringify(result));
  app.exit(0);
});
