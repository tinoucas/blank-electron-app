const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// WebHID, WebUSB and Web Serial (navigator.hid / .usb / .serial). Chrome shows its own device
// picker for requestDevice()/requestPort(); Electron has none and cancels the request unless
// the app picks a device. This adds a small picker and remembers the devices chosen, like
// Chrome does, so the site can reconnect to them later without asking again.

const KINDS = {
  hid: { select: 'select-hid-device', added: 'hid-device-added', removed: 'hid-device-removed', id: 'deviceId' },
  usb: { select: 'select-usb-device', added: 'usb-device-added', removed: 'usb-device-removed', id: 'deviceId' },
  serial: { select: 'select-serial-port', added: 'serial-port-added', removed: 'serial-port-removed', id: 'portId' },
};

const hex = (n) => (typeof n === 'number' ? n.toString(16).padStart(4, '0') : n);

function label(device) {
  const name = device.name || device.productName || device.displayName || device.portName;
  const ids = device.vendorId !== undefined ? `${hex(device.vendorId)}:${hex(device.productId)}` : '';
  return name ? `${name}${device.manufacturerName ? ` (${device.manufacturerName})` : ''}` : `Device ${ids}`;
}

// What identifies a physical device across reconnects (its session id changes every time).
// Built-in serial ports have no USB ids, so their name stands in.
const key = (kind, d) =>
  [kind, hex(d.vendorId), hex(d.productId), d.serialNumber || (d.vendorId === undefined ? d.portName || '' : '')].join(':');

// Asks which device to use. Returns the device, or null when cancelled. `current()` gives the
// up-to-date list, so "Try again" picks up a device plugged in while the dialog was open.
async function choose(win, kind, host, current) {
  for (;;) {
    const devices = current();
    const what = kind === 'serial' ? 'serial port' : `${kind.toUpperCase()} device`;
    if (!devices.length) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        message: `${host} wants to connect to a ${what}`,
        detail: 'No compatible device is connected. Plug it in, then choose Try again.',
        buttons: ['Try again', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 1) return null;
      continue;
    }
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message: `${host} wants to connect to a ${what}`,
      detail: 'Choose the device to use:',
      buttons: [...devices.map(label), 'Try again', 'Cancel'],
      defaultId: 0,
      cancelId: devices.length + 1,
      noLink: true,
    });
    if (response === devices.length + 1) return null;
    if (response < devices.length) return devices[response];
  }
}

const ready = new WeakSet();

// Registers the handlers once per session; getWindow() gives the window to attach the picker to.
function setupDevices(ses, { isAllowed, userData, getWindow, choose: pick = choose }) {
  if (ready.has(ses)) return;
  ready.add(ses);
  const grantsFile = path.join(userData, 'devices.json');
  let grants;
  try {
    grants = new Set(JSON.parse(fs.readFileSync(grantsFile, 'utf8')));
  } catch {
    grants = new Set();
  }
  const grant = (kind, device) => {
    grants.add(key(kind, device));
    fs.writeFileSync(grantsFile, JSON.stringify([...grants]));
  };

  // Device access is only for the site itself (and the hosts it's allowed to use).
  ses.setPermissionCheckHandler((_wc, permission, origin) => (permission in KINDS ? isAllowed(origin) : true));
  ses.setDevicePermissionHandler(({ deviceType, origin, device }) => isAllowed(origin) && grants.has(key(deviceType, device)));

  for (const [kind, k] of Object.entries(KINDS)) {
    // Devices plugged in or out while the picker is open.
    let live = null;
    ses.on(k.added, (_e, a, b) => live?.set((a.device || a)[k.id], a.device || a));
    ses.on(k.removed, (_e, a) => live?.delete((a.device || a)[k.id]));

    ses.on(k.select, async (event, ...args) => {
      event.preventDefault();
      // Serial passes (portList, webContents, callback); HID and USB pass ({ deviceList, frame }, callback).
      const [list, callback, origin] =
        kind === 'serial' ? [args[0], args[2], args[1].getURL()] : [args[0].deviceList, args[1], args[0].frame?.url || getWindow()?.webContents.getURL()];
      if (!isAllowed(origin)) return callback(kind === 'serial' ? '' : undefined);

      live = new Map(list.map((d) => [d[k.id], d]));
      const device = await pick(getWindow(), kind, new URL(origin).host, () => [...live.values()]);
      live = null;
      if (!device) return callback(kind === 'serial' ? '' : undefined);
      grant(kind, device);
      callback(device[k.id]);
    });
  }
}

module.exports = { setupDevices };
