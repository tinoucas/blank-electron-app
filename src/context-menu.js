const { Menu, clipboard, shell } = require('electron');

// Right-click menu. Electron has none by default, so this also brings back the usual
// text, link and spelling actions. Navigation comes first, as requested; the symbols are
// part of the labels because image icons in native menus don't show on every desktop.
function contextMenuTemplate(wc, params) {
  const history = wc.navigationHistory;
  const template = [
    { label: '←  Back', enabled: history.canGoBack(), click: () => history.goBack() },
    { label: '→  Forward', enabled: history.canGoForward(), click: () => history.goForward() },
    { label: '↻  Refresh', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Copy URL', click: () => clipboard.writeText(wc.getURL()) },
  ];
  const section = (items) => items.length && template.push({ type: 'separator' }, ...items);

  if (params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 5);
    section(
      suggestions.length
        ? suggestions.map((s) => ({ label: s, click: () => wc.replaceMisspelling(s) }))
        : [{ label: 'No spelling suggestions', enabled: false }],
    );
  }
  if (params.isEditable) {
    const f = params.editFlags;
    section([
      { role: 'cut', enabled: f.canCut },
      { role: 'copy', enabled: f.canCopy },
      { role: 'paste', enabled: f.canPaste },
      { role: 'selectAll', enabled: f.canSelectAll },
    ]);
  } else if (params.selectionText.trim()) {
    section([{ role: 'copy' }]);
  }
  if (params.linkURL) {
    section([
      { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
      { label: 'Open link in browser', click: () => shell.openExternal(params.linkURL) },
    ]);
  }
  return template;
}

function setupContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate(contextMenuTemplate(win.webContents, params)).popup({ window: win });
  });
}

module.exports = { setupContextMenu, contextMenuTemplate };
