const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const decodeIco = require('decode-ico');

const ICON_SIZE = 512;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
};

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

function attrs(tag) {
  const out = {};
  for (const [, key, , dq, sq, bare] of tag.matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[key.toLowerCase()] = dq ?? sq ?? bare;
  }
  return out;
}

// Largest dimension in a "sizes" attribute, Infinity for "any" (SVG), 0 if unknown.
function declaredSize(sizes) {
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return Infinity;
  return Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0));
}

// Collect every icon the page declares, plus the conventional fallbacks.
async function findCandidates(pageUrl) {
  const res = await get(pageUrl);
  const base = res.url;
  const html = await res.text();
  const candidates = [];
  const add = (href, size, from) => {
    try {
      candidates.push({ url: new URL(href, base).href, size, from });
    } catch {}
  };

  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(tag);
    const rel = (a.rel || '').toLowerCase();
    if (!a.href) continue;
    if (rel.split(/\s+/).includes('manifest')) {
      try {
        const manifestUrl = new URL(a.href, base).href;
        const manifest = await (await get(manifestUrl)).json();
        for (const icon of manifest.icons || []) {
          if (icon.src && !/monochrome/.test(icon.purpose || '')) {
            candidates.push({ url: new URL(icon.src, manifestUrl).href, size: declaredSize(icon.sizes), from: 'manifest' });
          }
        }
      } catch {}
    } else if (rel.includes('icon')) {
      const size = declaredSize(a.sizes) || (rel.includes('apple-touch-icon') ? 180 : 0);
      add(a.href, /\.svg(\?|$)/i.test(a.href) || a.type === 'image/svg+xml' ? Infinity : size, rel);
    }
  }
  add('/apple-touch-icon.png', 180, 'fallback');
  add('/favicon.ico', 0, 'fallback');

  const seen = new Set();
  return candidates.filter((c) => !seen.has(c.url) && seen.add(c.url));
}

// Turn downloaded bytes (PNG, JPEG, WebP, GIF, SVG or ICO) into a sharp image and its real size.
async function decode(buf) {
  const isIco = buf.length > 4 && buf.readUInt32BE(0) === 0x00000100;
  if (isIco) {
    const best = decodeIco(buf).sort((a, b) => b.width - a.width)[0];
    const img = best.type === 'png'
      ? sharp(Buffer.from(best.data))
      : sharp(Buffer.from(best.data.buffer), { raw: { width: best.width, height: best.height, channels: 4 } });
    return { img, size: best.width, vector: false };
  }
  const meta = await sharp(buf).metadata();
  const vector = meta.format === 'svg';
  // Render vectors at a high density so they come out crisp at ICON_SIZE.
  const img = vector ? sharp(buf, { density: Math.ceil((72 * ICON_SIZE) / Math.min(meta.width, meta.height)) }) : sharp(buf);
  return { img, size: Math.min(meta.width, meta.height), vector };
}

// Downloads the best icon for pageUrl and writes it as a square ICON_SIZE PNG to dest.
async function fetchIcon(pageUrl, dest) {
  const candidates = await findCandidates(pageUrl);
  let best;
  for (const c of candidates) {
    try {
      const buf = Buffer.from(await (await get(c.url)).arrayBuffer());
      const decoded = await decode(buf);
      const score = decoded.vector ? Infinity : decoded.size;
      if (!best || score > best.score) best = { ...decoded, score, url: c.url };
      if (score >= ICON_SIZE) break;
    } catch {}
  }
  if (!best) throw new Error('no usable icon found');

  await best.img
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dest);
  return { source: best.url, size: best.vector ? 'vector' : best.size };
}

// Fetches the icon for an app folder, never failing the caller: a missing icon just means Electron's default.
async function ensureIcon(dir, url, { force = false } = {}) {
  const existing = ['icon.png', 'icon.icns', 'icon.ico'].find((f) => fs.existsSync(path.join(dir, f)));
  if (existing && !force) return;
  try {
    const { source, size } = await fetchIcon(url, path.join(dir, 'icon.png'));
    const note = size !== 'vector' && size < ICON_SIZE ? ` (upscaled from ${size}px, replace it for a sharper icon)` : '';
    console.log(`Icon: ${source}${note}`);
  } catch (err) {
    console.warn(`Could not fetch an icon (${err.message}); the default Electron icon will be used.`);
  }
}

if (require.main === module) {
  // Usage: npm run icon -- <app-id>   (re-downloads, replacing the current icon.png)
  const { resolveApp } = require('./common');
  const { dir, config } = resolveApp(process.argv[2]);
  ensureIcon(dir, config.url, { force: true });
}

module.exports = { fetchIcon, ensureIcon };
