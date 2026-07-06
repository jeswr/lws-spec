// AUTHORED-BY Claude Fable 5
//
// RFC 8288 Link-header parsing and RFC 9110 WWW-Authenticate challenge
// parsing — just enough, correctly, for the assertion vocabulary
// (includesLinkRel / includesLinkRelAll / authParams / excludesScheme).

/** Split a header value on top-level commas (commas inside quotes/angle brackets survive). */
function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let cur = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (inQuote) {
      cur += ch;
      if (ch === '\\' && i + 1 < value.length) {
        cur += value[i + 1];
        i += 1;
      } else if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      cur += ch;
    } else if (ch === '<') {
      depth += 1;
      cur += ch;
    } else if (ch === '>') {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

const unquote = (v) => {
  const t = v.trim();
  return t.startsWith('"') && t.endsWith('"') && t.length >= 2
    ? t.slice(1, -1).replace(/\\(.)/g, '$1')
    : t;
};

/**
 * Parse Link header values (array of raw header values) into
 * [{target, params: {rel, …}}]. A link with `rel="a b"` matches both rels —
 * callers use `rels` (the split list).
 */
export function parseLinkHeaders(values) {
  const links = [];
  for (const value of values) {
    for (const part of splitTopLevel(value)) {
      const m = /^<([^>]*)>\s*(.*)$/.exec(part);
      if (!m) continue;
      const [, target, rest] = m;
      const params = {};
      for (const p of rest.split(';')) {
        const kv = /^\s*([^=\s]+)\s*=\s*(.*)$/.exec(p);
        if (kv) params[kv[1].toLowerCase()] = unquote(kv[2]);
      }
      const rels = (params.rel ?? '').split(/\s+/).filter(Boolean);
      links.push({ target, params, rels });
    }
  }
  return links;
}

/**
 * Parse WWW-Authenticate header values into [{scheme, params: {name: value}}].
 * Handles multiple challenges per header value: a new challenge starts at a
 * token that is not followed by `=` (auth-param names always are).
 */
export function parseChallenges(values) {
  const challenges = [];
  for (const value of values) {
    // Tokenise into (token[=value]) segments on top-level commas first.
    const segments = splitTopLevel(value);
    let current = null;
    for (const seg of segments) {
      const schemeThenParam = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s+([^=\s]+)\s*=\s*(.*)$/.exec(seg);
      const paramOnly = /^([^=\s]+)\s*=\s*(.*)$/.exec(seg);
      const schemeOnly = /^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*$/.exec(seg);
      if (schemeThenParam) {
        current = { scheme: schemeThenParam[1], params: {} };
        challenges.push(current);
        current.params[schemeThenParam[2].toLowerCase()] = unquote(schemeThenParam[3]);
      } else if (schemeOnly) {
        current = { scheme: schemeOnly[1], params: {} };
        challenges.push(current);
      } else if (paramOnly && current) {
        current.params[paramOnly[1].toLowerCase()] = unquote(paramOnly[2]);
      }
    }
  }
  return challenges;
}
