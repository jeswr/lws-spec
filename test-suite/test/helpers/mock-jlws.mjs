// AUTHORED-BY Claude Fable 5
//
// A minimal in-process JLWS-ish server used ONLY by the harness self-tests:
// strict mode implements just enough of the core protocol for a chosen set
// of vectors to pass (positive control — proves the runner can detect
// conformance), lenient mode deliberately behaves like a legacy LDP server
// (unconditional overwrite, auto-created parents, plain-text errors) so the
// self-tests can prove the runner detects NON-conformance. It is a test
// double, not a reference implementation.

import http from 'node:http';

const PROBLEMS = 'https://w3id.org/jeswr/lws/problems/';
const SD_REL = 'https://w3id.org/jeswr/lws#storageDescription';

export function createMockJlws({ lenient = false, hijackLocation = false } = {}) {
  /** path -> {container, mediaType, body: Buffer, etag: string} */
  const store = new Map();
  /** every request seen, as "METHOD path" — lets tests assert what was (not) sent */
  const requests = [];
  let etagCounter = 0;
  const freshEtag = () => `"v${(etagCounter += 1)}"`;
  store.set('/', { container: true, etag: freshEtag() });

  const parentOf = (path) => {
    const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
    const i = trimmed.lastIndexOf('/');
    return i <= 0 ? '/' : trimmed.slice(0, i + 1);
  };
  const childrenOf = (path) =>
    [...store.keys()].filter((p) => p !== path && parentOf(p) === path);

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => handle(req, res, Buffer.concat(chunks)));
  });

  const baseUrl = (req) => `http://${req.headers.host}`;

  const problem = (res, status, slug, title) => {
    if (lenient) {
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(title);
      return;
    }
    res.writeHead(status, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify({ type: `${PROBLEMS}${slug}`, title, status }));
  };

  const resourceLinks = (req, path, entry) => {
    if (lenient) return [];
    const abs = (p) => `${baseUrl(req)}${p}`;
    const links = [
      `<${abs(path)}.linkset>; rel="linkset"`,
      `<https://w3id.org/jeswr/lws#${entry.container ? 'Container' : 'DataResource'}>; rel="type"`,
      `<${abs('/')}.well-known/jlws>; rel="${SD_REL}"`,
    ];
    if (path !== '/') links.push(`<${abs(parentOf(path))}>; rel="up"`);
    return links;
  };

  function handle(req, res, body) {
    requests.push(`${req.method} ${req.url}`);
    const rawPath = req.url;
    const segments = rawPath.split('/').map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
    if (!lenient && segments.some((s) => s === '..' || s === '.')) {
      return problem(res, 400, 'path-traversal', 'dot segments are rejected');
    }
    const path = rawPath.split('?')[0];
    const entry = store.get(path);
    const h = (name) => req.headers[name.toLowerCase()];

    switch (req.method) {
      case 'GET':
      case 'HEAD': {
        if (!entry) return problem(res, 404, 'not-found', 'no such resource');
        const links = resourceLinks(req, path, entry);
        const baseHeaders = { ETag: entry.etag, ...(links.length ? { Link: links } : {}) };
        if (h('if-none-match') && h('if-none-match') === entry.etag) {
          res.writeHead(304, baseHeaders);
          return res.end();
        }
        let payload;
        let mediaType;
        if (entry.container) {
          const items = childrenOf(path).map((p) => {
            const c = store.get(p);
            return {
              id: `${baseUrl(req)}${p}`,
              type: c.container ? 'Container' : 'DataResource',
              ...(c.container ? {} : { mediaType: c.mediaType }),
            };
          });
          payload = Buffer.from(
            JSON.stringify({
              '@context': 'https://w3id.org/jeswr/lws/context/v1',
              id: `${baseUrl(req)}${path}`,
              type: 'Container',
              items,
              totalItems: items.length,
            }),
          );
          mediaType = 'application/ld+json';
        } else {
          payload = entry.body;
          mediaType = entry.mediaType;
        }
        const range = /^bytes=(\d+)-(\d*)$/.exec(h('range') ?? '');
        if (range && !entry.container) {
          const start = Number(range[1]);
          if (start >= payload.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${payload.length}` });
            return res.end();
          }
          const end = range[2] === '' ? payload.length - 1 : Math.min(Number(range[2]), payload.length - 1);
          res.writeHead(206, {
            ...baseHeaders,
            'Content-Type': mediaType,
            'Content-Range': `bytes ${start}-${end}/${payload.length}`,
          });
          return res.end(req.method === 'HEAD' ? undefined : payload.subarray(start, end + 1));
        }
        res.writeHead(200, { ...baseHeaders, 'Content-Type': mediaType, 'Content-Length': payload.length });
        return res.end(req.method === 'HEAD' ? undefined : payload);
      }

      case 'PUT': {
        const isContainerUri = path.endsWith('/');
        if (entry) {
          if (h('if-none-match') === '*') return problem(res, 412, 'precondition-failed', 'exists');
          if (lenient) {
            store.set(path, { ...entry, body, mediaType: h('content-type') ?? entry.mediaType, etag: freshEtag() });
            res.writeHead(205);
            return res.end();
          }
          if (h('if-match') === entry.etag) {
            store.set(path, { ...entry, body, mediaType: h('content-type') ?? entry.mediaType, etag: freshEtag() });
            res.writeHead(204, { ETag: store.get(path).etag });
            return res.end();
          }
          if (h('if-match')) return problem(res, 412, 'precondition-failed', 'stale If-Match');
          return problem(res, 428, 'precondition-required', 'unconditional write');
        }
        const parent = store.get(parentOf(path));
        if ((!parent || !parent.container) && !lenient) {
          return problem(res, 409, 'missing-parent', 'parent container does not exist');
        }
        if (!lenient && h('if-none-match') !== '*') {
          return problem(res, 428, 'precondition-required', 'creation requires If-None-Match: *');
        }
        if (lenient) {
          // auto-create intermediate containers, CSS-style
          let p = parentOf(path);
          const missing = [];
          while (p !== '/' && !store.get(p)) {
            missing.unshift(p);
            p = parentOf(p);
          }
          for (const m of missing) store.set(m, { container: true, etag: freshEtag() });
        }
        if (isContainerUri && body.length > 0 && !lenient) {
          return problem(res, 400, 'container-content', 'containers carry no client content');
        }
        store.set(path, {
          container: isContainerUri,
          mediaType: isContainerUri ? undefined : (h('content-type') ?? 'application/octet-stream'),
          body: isContainerUri ? undefined : body,
          etag: freshEtag(),
        });
        const links = resourceLinks(req, path, store.get(path));
        res.writeHead(201, { ETag: store.get(path).etag, ...(links.length ? { Link: links } : {}) });
        return res.end();
      }

      case 'POST': {
        if (!entry) return problem(res, 404, 'not-found', 'no such container');
        if (!entry.container) return problem(res, 405, 'method-not-allowed', 'POST targets containers');
        const slugHeader = (h('slug') ?? `r${etagCounter}`).replace(/[^A-Za-z0-9._-]/g, '-');
        let name = slugHeader;
        while (store.get(`${path}${name}`)) name = `${name}-x`;
        const childPath = `${path}${name}`;
        store.set(childPath, {
          container: false,
          mediaType: h('content-type') ?? 'application/octet-stream',
          body,
          etag: freshEtag(),
        });
        const links = resourceLinks(req, childPath, store.get(childPath));
        res.writeHead(201, {
          // hijackLocation simulates a hostile/broken server steering the
          // harness outside its per-run sandbox (same origin, foreign path).
          Location: hijackLocation ? `${baseUrl(req)}/pwned` : `${baseUrl(req)}${childPath}`,
          ETag: store.get(childPath).etag,
          ...(links.length ? { Link: links } : {}),
        });
        return res.end();
      }

      case 'DELETE': {
        if (!entry) return problem(res, 404, 'not-found', 'no such resource');
        if (entry.container && childrenOf(path).length > 0) {
          if ((h('depth') ?? '').toLowerCase() !== 'infinity') {
            return problem(res, 409, 'container-not-empty', 'non-empty container');
          }
          for (const p of [...store.keys()]) {
            if (p.startsWith(path) && p !== path) store.delete(p);
          }
        }
        store.delete(path);
        res.writeHead(204);
        return res.end();
      }

      default:
        return problem(res, 405, 'method-not-allowed', req.method);
    }
  }

  return {
    server,
    store,
    requests,
    async start() {
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      return `http://127.0.0.1:${server.address().port}`;
    },
    async stop() {
      await new Promise((r) => server.close(r));
    },
  };
}
