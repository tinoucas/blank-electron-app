const { WebContentsView, clipboard, shell } = require('electron');
const path = require('path');

// Right-click menu, drawn by the app (src/menu/) rather than as a native menu so that Back and
// Forward can sit side by side as icons. It is an overlay inside the window, not a separate
// popup window, because Wayland doesn't let apps position their own windows.

// Turns looping on or off for the video at viewport point (x, y) of the main frame. When the video
// is in an iframe, walks down the frames under the point, converting the point at each level.
async function setVideoLoop(wc, frame, x, y, loop) {
  const zoom = wc.getZoomFactor();
  let point = { x: x / zoom, y: y / zoom };
  const chain = [];
  for (let f = frame || wc.mainFrame; f; f = f.parent) chain.unshift(f);
  for (const parent of chain.slice(0, -1)) {
    // Where the content box of the iframe under the point starts, in this frame's coordinates.
    const offset = await parent.executeJavaScript(`(() => {
      const el = document.elementsFromPoint(${point.x}, ${point.y}).find((e) => e.tagName === 'IFRAME' || e.tagName === 'FRAME');
      if (!el) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { x: r.left + el.clientLeft + parseFloat(cs.paddingLeft), y: r.top + el.clientTop + parseFloat(cs.paddingTop) };
    })()`);
    if (!offset) break;
    point = { x: point.x - offset.x, y: point.y - offset.y };
  }
  // The video under the point (overlays on top of it are skipped), else the frame's only video.
  return chain.at(-1).executeJavaScript(`(() => {
    const videos = document.querySelectorAll('video');
    const v = document.elementsFromPoint(${point.x}, ${point.y}).find((e) => e.tagName === 'VIDEO') || (videos.length === 1 ? videos[0] : null);
    if (v) v.loop = ${loop};
    return !!v;
  })()`);
}

// Space the menu page leaves around the menu for its shadow (body padding in menu.html).
const PAD = { left: 8, top: 8 };

// What the menu shows for this right-click, and what each item does.
function menuModel(wc, params) {
  const history = wc.navigationHistory;
  const actions = {};
  const item = (id, props, action) => {
    actions[id] = action;
    return { id, ...props };
  };
  const nav = [
    item('back', { icon: 'back', title: 'Back', enabled: history.canGoBack() }, () => history.goBack()),
    item('forward', { icon: 'forward', title: 'Forward', enabled: history.canGoForward() }, () => history.goForward()),
  ];
  const items = [
    item('refresh', { icon: 'refresh', label: 'Refresh' }, () => wc.reload()),
    { separator: true },
    item('copy-url', { label: 'Copy URL' }, () => clipboard.writeText(wc.getURL())),
  ];
  const section = (entries) => entries.length && items.push({ separator: true }, ...entries);

  if (params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 5);
    section(
      suggestions.length
        ? suggestions.map((s, i) => item(`spell-${i}`, { label: s }, () => wc.replaceMisspelling(s)))
        : [{ label: 'No spelling suggestions', enabled: false }],
    );
  }
  if (params.isEditable) {
    const f = params.editFlags;
    section([
      item('cut', { label: 'Cut', enabled: f.canCut }, () => wc.cut()),
      item('copy', { label: 'Copy', enabled: f.canCopy }, () => wc.copy()),
      item('paste', { label: 'Paste', enabled: f.canPaste }, () => wc.paste()),
      item('select-all', { label: 'Select All', enabled: f.canSelectAll }, () => wc.selectAll()),
    ]);
  } else if (params.selectionText.trim()) {
    section([item('copy', { label: 'Copy' }, () => wc.copy())]);
  }
  if (params.mediaType === 'video') {
    const looping = params.mediaFlags.isLooping;
    section([
      item('loop', { label: 'Loop', checked: looping, enabled: params.mediaFlags.canLoop }, () =>
        setVideoLoop(wc, params.frame, params.x, params.y, !looping),
      ),
    ]);
  }
  if (params.linkURL) {
    section([
      item('copy-link', { label: 'Copy link address' }, () => clipboard.writeText(params.linkURL)),
      item('open-link', { label: 'Open link in browser' }, () => shell.openExternal(params.linkURL)),
    ]);
  }
  return { nav, items, actions };
}

function setupContextMenu(win) {
  const wc = win.webContents;
  let view = null;
  let shown = false;
  let actions = {};
  let at = { x: 0, y: 0 };

  const hide = () => {
    if (!shown) return;
    shown = false;
    win.contentView.removeChildView(view);
  };
  // Give focus back to the page so Copy/Paste act on what was selected there.
  const closeAndRefocus = () => {
    hide();
    wc.focus();
  };

  function createView() {
    view = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, 'menu', 'preload.js'), sandbox: true, contextIsolation: true },
    });
    view.setBackgroundColor('#00000000');
    view.webContents.loadFile(path.join(__dirname, 'menu', 'menu.html'));
    view.webContents.ipc.on('ready', (_e, width, height) => {
      // Keep the menu inside the window: shift it left, or open it upwards, when it would overflow.
      const { width: winW, height: winH } = win.getContentBounds();
      let x = at.x - PAD.left;
      let y = at.y - PAD.top;
      if (x + width > winW) x = winW - width;
      if (y + height > winH) y = at.y - height + PAD.top;
      x = Math.max(0, Math.min(x, winW - width));
      y = Math.max(0, Math.min(y, winH - height));
      view.setBounds({ x, y, width, height });
      view.webContents.focus();
    });
    view.webContents.ipc.on('choose', (_e, id) => {
      const action = actions[id];
      closeAndRefocus();
      Promise.resolve()
        .then(() => action?.())
        .catch((err) => console.error('Menu action failed:', err));
    });
    view.webContents.ipc.on('close', closeAndRefocus);
    // Clicking anywhere else takes focus away from the menu, which closes it.
    view.webContents.on('blur', hide);
  }

  wc.on('context-menu', (_event, params) => {
    if (!view) createView();
    const model = menuModel(wc, params);
    actions = model.actions;
    at = { x: params.x, y: params.y };
    // Rendered off-screen first; 'ready' reports its size and moves it into place.
    view.setBounds({ x: -2000, y: -2000, width: 600, height: 800 });
    if (!shown) win.contentView.addChildView(view);
    shown = true;
    const send = () => view.webContents.send('show', { nav: model.nav, items: model.items });
    if (view.webContents.isLoading()) view.webContents.once('did-finish-load', send);
    else send();
  });
  // A click in the page closes the menu even when focus didn't move to the page first.
  wc.on('before-mouse-event', (_event, mouse) => {
    if (mouse.type === 'mouseDown' && mouse.button !== 'right') hide();
  });
  for (const event of ['blur', 'resize', 'move']) win.on(event, hide);
  wc.on('did-start-navigation', hide);
}

module.exports = { setupContextMenu, menuModel, setVideoLoop };
