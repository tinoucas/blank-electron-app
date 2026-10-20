const net = require('net');

// Validation and reachability checks, so we never package an app that obviously can't work.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
};

class UrlError extends Error {}

const hasScheme = (input) => /^[a-z][a-z0-9+.-]*:/i.test(input) && !/^[^:/]+:\d+(\/|$)/.test(input);

// Parses user input into a URL, rejecting anything an app can't sensibly wrap.
function parseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new UrlError('No URL given');
  if (/\s/.test(raw)) throw new UrlError(`URL contains spaces: "${raw}"`);

  let url;
  try {
    url = new URL(hasScheme(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UrlError(`Not a valid URL: "${raw}"`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UrlError(`Only http:// and https:// URLs are supported, not "${url.protocol}"`);
  }
  if (url.username || url.password) {
    throw new UrlError('Remove the username/password from the URL: it would be stored in the app config and inside the packaged app');
  }
  const host = url.hostname;
  const isIp = net.isIP(host.replace(/^\[|\]$/g, '')) !== 0;
  // The URL parser expands shorthand like "1.2.3" to "1.2.0.3"; only accept IPs typed in full.
  if (net.isIPv4(host) && !raw.includes(host)) throw new UrlError(`Not a valid IP address: "${raw}"`);
  if (!isIp) {
    const labels = host.split('.');
    const validLabel = (l) => /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/i.test(l) || /^xn--[a-z0-9-]+$/i.test(l);
    if (host.length > 253 || !labels.every(validLabel)) throw new UrlError(`Not a valid host name: "${host}"`);
    if (labels.length > 1 && /^\d+$/.test(labels.at(-1))) throw new UrlError(`Not a valid IP address or host name: "${host}"`);
  }
  return { url, schemeGiven: hasScheme(raw) };
}

// Hosts on the local machine or network, where plain http is normal.
function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes('.') && !net.isIP(host)) return true; // single-label LAN name, "localhost"
  if (/\.(local|lan|home|internal|home\.arpa|localhost)$/.test(host)) return true;
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (net.isIPv6(host)) return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  return false;
}

function describeFetchError(err) {
  const code = err.cause?.code || err.code || err.name;
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'host not found (DNS lookup failed)';
  if (code === 'ECONNREFUSED') return 'connection refused (is the server running, and is the port right?)';
  if (code === 'ECONNRESET') return 'connection reset by the server';
  if (['TimeoutError', 'AbortError', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return 'timed out';
  if (/CERT|SIGNATURE/i.test(code || '')) {
    return `TLS certificate problem (${code}); the app would refuse the page too. If your system trusts this certificate, use --skip-check`;
  }
  if (/SSL|TLS|EPROTO/i.test(code || '')) return `secure connection failed (${code})`;
  return err.cause?.message || err.message;
}

async function probe(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    res.body?.cancel();
    return { res };
  } catch (err) {
    return { error: describeFetchError(err) };
  }
}

// Validates the input and, unless skipCheck, makes sure the page actually loads.
// Returns { url, finalUrl, warnings }. Throws UrlError with a readable reason otherwise.
async function resolveUrl(input, { skipCheck = false } = {}) {
  const { url, schemeGiven } = parseUrl(input);
  const warnings = [];
  if (skipCheck) return { url: url.href, finalUrl: url.href, warnings };

  let { res, error } = await probe(url.href);
  if (error && !schemeGiven) {
    // No scheme typed: fall back to plain http, which is common for self-hosted servers.
    const httpUrl = new URL(url.href);
    httpUrl.protocol = 'http:';
    const second = await probe(httpUrl.href);
    if (second.res) {
      warnings.push(`${url.host} doesn't answer over https://, using http://`);
      ({ res, error } = second);
      url.protocol = 'http:';
    }
  }
  if (error) throw new UrlError(`Can't load ${url.href}: ${error}`);

  const { status } = res;
  if (status === 404 || status === 410) throw new UrlError(`${url.href} returned ${status} (page not found)`);
  if (status >= 500) throw new UrlError(`${url.href} returned ${status} (server error)`);
  if (status >= 400) warnings.push(`${url.href} returned ${status}; fine if the site needs a login, otherwise check the URL`);

  const type = res.headers.get('content-type') || '';
  if (status < 400 && type && !/html/i.test(type)) warnings.push(`${url.href} is not a web page (${type.split(';')[0]})`);

  const finalUrl = new URL(res.url || url.href);
  if (finalUrl.protocol === 'http:' && !isPrivateHost(finalUrl.hostname)) {
    warnings.push(`${finalUrl.host} is served over plain http on a public network; traffic will not be encrypted`);
  }
  return { url: url.href, finalUrl: finalUrl.href, warnings };
}

module.exports = { UrlError, parseUrl, resolveUrl, isPrivateHost };
