// AUTHORED-BY Claude Fable 5
//
// Minimal raw HTTP client for the harness. Uses node:http/https directly
// (not fetch) so that:
//   - request paths are sent EXACTLY as mapped (no URL normalisation — the
//     path-traversal vectors depend on `..` segments reaching the server);
//   - redirects are never followed (assertions are about the direct response);
//   - multi-valued headers (Link, WWW-Authenticate) are preserved.

import http from 'node:http';
import https from 'node:https';

/** Split an absolute http(s) URI into connect params + the raw path to send. */
export function splitUri(uri) {
  const m = /^(https?):\/\/([^/?#]+)(.*)$/.exec(uri);
  if (!m) throw new Error(`not an absolute http(s) URI: ${uri}`);
  const [, scheme, authority, rest] = m;
  let host = authority;
  let port = scheme === 'https' ? 443 : 80;
  const colon = authority.lastIndexOf(':');
  if (colon !== -1 && !authority.includes(']', colon)) {
    host = authority.slice(0, colon);
    port = Number(authority.slice(colon + 1));
  }
  return { scheme, host, port, path: rest === '' ? '/' : rest };
}

/**
 * @param {{method: string, url: string, headers?: object, body?: Buffer|string|null, timeoutMs?: number}} req
 * @returns {Promise<{status: number, headers: Map<string, string[]>, body: Buffer}>}
 *   headers: lower-cased name → array of values (in wire order).
 */
export function rawRequest({ method, url, headers = {}, body = null, timeoutMs = 15000 }) {
  const { scheme, host, port, path } = splitUri(url);
  const mod = scheme === 'https' ? https : http;
  const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');

  const outHeaders = { ...headers };
  if (payload != null && !Object.keys(outHeaders).some((h) => h.toLowerCase() === 'content-length')) {
    outHeaders['Content-Length'] = String(payload.length);
  }

  return new Promise((resolve, reject) => {
    const req = mod.request(
      { method, host, port, path, headers: outHeaders, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const map = new Map();
          const raw = res.rawHeaders;
          for (let i = 0; i < raw.length; i += 2) {
            const name = raw[i].toLowerCase();
            if (!map.has(name)) map.set(name, []);
            map.get(name).push(raw[i + 1]);
          }
          resolve({ status: res.statusCode, headers: map, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs}ms: ${method} ${url}`)));
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

/** All values of a header (case-insensitive), [] when absent. */
export const headerValues = (res, name) => res.headers.get(name.toLowerCase()) ?? [];

/** Combined value per RFC 9110 §5.3 (comma-joined), or null when absent. */
export const headerCombined = (res, name) => {
  const v = headerValues(res, name);
  return v.length === 0 ? null : v.join(', ');
};
