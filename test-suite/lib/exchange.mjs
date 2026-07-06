// AUTHORED-BY Claude Fable 5
//
// The http-exchange executor: plans which vectors are executable against the
// configured target, realises each case's declared state (setup), plays the
// request sequence with placeholder resolution and case-space -> target-space
// URI mapping, evaluates the response assertions and stateAfter probes, and
// tears the realised state down again (best-effort).
//
// Honesty rules (per test-vectors/README.md):
//   - a case whose `preconditions` name a feature the target does not provide
//     is SKIPPED conformantly;
//   - a case whose declared `state` the harness cannot realise on this target
//     is reported unrealisable (skipped), never guessed at;
//   - only `http-exchange` vectors execute — every other abstract operation
//     is a library-level seam an implementation binds directly (reported as
//     such, not silently dropped).

import { readFileSync } from 'node:fs';
import { rawRequest, headerCombined, headerValues } from './http.mjs';
import { evaluateExpected } from './assert.mjs';
import { parseLinkHeaders, parseChallenges } from './link.mjs';
import { fixturePath } from './vectors.mjs';

// State members the harness knows how to realise on an arbitrary target over
// plain HTTP. Everything else requires an implementation-side injection seam
// the black-box harness does not have (issuer trust, pinned clocks, PoP
// sessions, quota, notification services, capability toggles are matched
// against the config's declarations instead).
const ALWAYS_REALIZABLE = new Set(['storageRoot', 'resources']);
const DECLARATION_MATCHED = new Set(['capabilities', 'conformsTo']);
const ACCESS_KEY = 'access';

const capabilityName = (entry) => (typeof entry === 'string' ? entry : entry?.type ?? null);

function requestsOf(caseRecord) {
  if (caseRecord.exchanges) return caseRecord.exchanges.map((e) => e.request);
  return caseRecord.input?.request ? [caseRecord.input.request] : [];
}

function agentsUsed(caseRecord) {
  const agents = new Set();
  for (const r of requestsOf(caseRecord)) {
    if ('agent' in r && r.agent !== null) agents.add(r.agent);
  }
  return agents;
}

/**
 * Decide how a case runs against this target.
 * @returns {{run: true} | {run: false, reason: string, detail: string}}
 */
export function planCase(caseRecord, config) {
  if (caseRecord.operation !== 'http-exchange') {
    return {
      run: false,
      reason: 'library-vector',
      detail: `operation ${caseRecord.operation} is a library-level seam, not black-box HTTP`,
    };
  }

  const pre = caseRecord.preconditions ?? {};
  for (const f of pre.features ?? []) {
    if (!config.features.includes(f)) {
      return { run: false, reason: 'precondition', detail: `target does not provide feature ${f}` };
    }
  }
  for (const c of pre.capabilities ?? []) {
    if (!config.capabilities.includes(c)) {
      return { run: false, reason: 'precondition', detail: `target does not provide capability ${c}` };
    }
  }

  const state = caseRecord.input?.state ?? {};
  const agents = agentsUsed(caseRecord);
  for (const key of Object.keys(state)) {
    if (ALWAYS_REALIZABLE.has(key)) continue;
    if (DECLARATION_MATCHED.has(key)) {
      const wanted = (state[key] ?? []).map(capabilityName).filter(Boolean);
      const declared = key === 'capabilities' ? config.capabilities : config.conformsTo;
      const missing = wanted.filter((w) => !declared.includes(w));
      if (missing.length > 0) {
        return {
          run: false,
          reason: 'unrealizable-state',
          detail: `state.${key} requires ${missing.join(', ')} which the target does not declare`,
        };
      }
      continue;
    }
    if (key === ACCESS_KEY) {
      // An access map only matters when some request authenticates as a
      // non-controller agent; controller requests are implicitly fully
      // authorised regardless of the map.
      if (agents.size === 0) continue;
      if (config.accessRealizer === 'none') {
        return {
          run: false,
          reason: 'unrealizable-state',
          detail: 'state.access requires an access realizer (config.accessRealizer) — none configured',
        };
      }
      continue;
    }
    return {
      run: false,
      reason: 'unrealizable-state',
      detail: `state.${key} cannot be realised black-box on this target`,
    };
  }

  // A resource-level `modified` pin is advisory decoration EXCEPT when a
  // request compares against it with a literal (non-placeholder) HTTP date —
  // the harness cannot set modification times on a black-box target, so a
  // literal time-conditional can never be made meaningful.
  for (const r of requestsOf(caseRecord)) {
    for (const [name, value] of Object.entries(r.headers ?? {})) {
      if (
        /^if-(un)?modified-since$/i.test(name) &&
        typeof value === 'string' &&
        !value.includes('${')
      ) {
        return {
          run: false,
          reason: 'unrealizable-state',
          detail: `request pins ${name} to a literal date but the harness cannot set modification times`,
        };
      }
    }
  }

  for (const agent of agents) {
    if (!config.agents[agent]) {
      return {
        run: false,
        reason: 'unrealizable-agent',
        detail: `no credential seam configured for agent ${agent} (config.agents)`,
      };
    }
  }

  return { run: true };
}

// --- URI mapping -------------------------------------------------------------

const mapString = (value, caseRoot, realizedRoot) =>
  typeof value === 'string' ? value.split(caseRoot).join(realizedRoot) : value;

function mapDeep(value, caseRoot, realizedRoot) {
  if (typeof value === 'string') return mapString(value, caseRoot, realizedRoot);
  if (Array.isArray(value)) return value.map((v) => mapDeep(v, caseRoot, realizedRoot));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        mapString(k, caseRoot, realizedRoot),
        mapDeep(v, caseRoot, realizedRoot),
      ]),
    );
  }
  return value;
}

// --- placeholders ------------------------------------------------------------

const PLACEHOLDER = /\$\{(response\[(\d+)\]\.(?:header\.([A-Za-z0-9-]+)|link\(([^)]+)\)|authParam\(([^)]+)\)|body|status|problem\.type)|file:([^}]+))\}/g;

function placeholderValue(match, responses, caseRecord) {
  const [, , idxStr, headerName, linkRel, authParam, filePath] = match;
  if (filePath != null) {
    return readFileSync(fixturePath(caseRecord, filePath), 'utf8').trim();
  }
  const idx = Number(idxStr);
  const res = responses[idx];
  if (!res) throw new Error(`placeholder references response[${idx}] which has not happened`);
  if (headerName != null) {
    const v = headerCombined(res, headerName);
    if (v == null) throw new Error(`placeholder: response[${idx}] has no ${headerName} header`);
    return v;
  }
  if (linkRel != null) {
    const link = parseLinkHeaders(headerValues(res, 'link')).find((l) => l.rels.includes(linkRel));
    if (!link) throw new Error(`placeholder: response[${idx}] has no Link rel=${linkRel}`);
    return link.target;
  }
  if (authParam != null) {
    for (const c of parseChallenges(headerValues(res, 'www-authenticate'))) {
      if (authParam.toLowerCase() in c.params) return c.params[authParam.toLowerCase()];
    }
    throw new Error(`placeholder: response[${idx}] has no auth param ${authParam}`);
  }
  throw new Error(`unsupported placeholder ${match[0]}`);
}

export function resolvePlaceholders(value, responses, caseRecord) {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (...m) => placeholderValue(m, responses, caseRecord));
  }
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, responses, caseRecord));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolvePlaceholders(v, responses, caseRecord)]),
    );
  }
  return value;
}

// --- asserts refs ------------------------------------------------------------

function assertRefValue(ref, responses) {
  const m = /^response\[(\d+)\]\.(header\.([A-Za-z0-9-]+)|body|status|problem\.type)$/.exec(ref);
  if (!m) throw new Error(`unsupported asserts ref ${ref}`);
  const res = responses[Number(m[1])];
  if (!res) throw new Error(`asserts ref ${ref}: no such response`);
  if (m[3] != null) return headerCombined(res, m[3]);
  if (m[2] === 'body') return res.body.toString('utf8');
  if (m[2] === 'status') return res.status;
  try {
    return JSON.parse(res.body.toString('utf8'))?.type ?? null;
  } catch {
    return null;
  }
}

// --- the executor ------------------------------------------------------------

const CONTROLLER = Symbol('controller');

export class ExchangeRunner {
  constructor(config, runId) {
    this.config = config;
    this.runId = runId;
    this.seq = 0;
  }

  realizedRootFor(caseId) {
    const slug = caseId.replace(/[^A-Za-z0-9]+/g, '-');
    this.seq += 1;
    return `${this.config.target.replace(/\/+$/, '')}/${this.runId}/${String(this.seq).padStart(3, '0')}-${slug}/`;
  }

  /** Create the per-run scope container once (strict servers refuse orphan-parent PUTs). */
  async ensureRunScope() {
    if (this.scopeReady) return;
    const scope = `${this.config.target.replace(/\/+$/, '')}/${this.runId}/`;
    const res = await this.send({
      method: 'PUT',
      target: scope,
      headers: { 'If-None-Match': '*', 'Content-Type': 'text/turtle' },
      body: '',
    });
    if ((res.status < 200 || res.status >= 300) && res.status !== 412) {
      throw new Error(`cannot create run scope container ${scope}: ${res.status}`);
    }
    this.scopeReady = true;
  }

  authHeadersFor(agent) {
    if (agent === null) return {};
    if (agent === CONTROLLER) {
      return this.config.controllerBearer
        ? { Authorization: `Bearer ${this.config.controllerBearer}` }
        : {};
    }
    const entry = this.config.agents[agent];
    if (!entry?.bearer) throw new Error(`no bearer credential for agent ${agent}`);
    return { Authorization: `Bearer ${entry.bearer}` };
  }

  async send(request, { agent = CONTROLLER } = {}) {
    const headers = { ...this.authHeadersFor(agent), ...(request.headers ?? {}) };
    const body =
      request.bodyBase64 != null
        ? Buffer.from(request.bodyBase64, 'base64')
        : request.body != null
          ? Buffer.from(request.body, 'utf8')
          : null;
    return rawRequest({
      method: request.method,
      url: request.target,
      headers,
      body,
      timeoutMs: this.config.timeoutMs,
    });
  }

  async realizeState(state, caseRoot, realizedRoot, created) {
    const entries = Object.entries(state.resources ?? {}).sort(
      (a, b) => a[0].split('/').length - b[0].split('/').length || a[0].length - b[0].length,
    );
    for (const [uri, resource] of entries) {
      if (!uri.startsWith(caseRoot) && uri !== caseRoot) {
        throw new Error(`state resource ${uri} is outside the case storageRoot ${caseRoot}`);
      }
      const target = mapString(uri, caseRoot, realizedRoot);
      const isContainer = resource.type === 'Container';
      const res = await this.send({
        method: 'PUT',
        target,
        headers: {
          'If-None-Match': '*',
          'Content-Type': isContainer ? 'text/turtle' : (resource.mediaType ?? 'application/octet-stream'),
        },
        ...(isContainer
          ? { body: '' }
          : resource.contentBase64 != null
            ? { bodyBase64: resource.contentBase64 }
            : { body: resource.content ?? '' }),
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`setup: PUT ${target} -> ${res.status} (state realisation refused by target)`);
      }
      created.push(target);
    }
  }

  async probeStateAfter(stateAfter, caseRoot, realizedRoot, originals, failures) {
    for (const uri of stateAfter.exists ?? []) {
      const target = mapString(uri, caseRoot, realizedRoot);
      const res = await this.send({ method: 'GET', target });
      if (res.status < 200 || res.status >= 300) {
        failures.push(`stateAfter.exists: GET ${uri} -> ${res.status}`);
      }
    }
    for (const uri of stateAfter.notExists ?? []) {
      const target = mapString(uri, caseRoot, realizedRoot);
      const res = await this.send({ method: 'GET', target });
      if (res.status !== 404) {
        failures.push(`stateAfter.notExists: GET ${uri} -> ${res.status} (expected 404)`);
      }
    }
    for (const uri of stateAfter.bytesUnchanged ?? []) {
      const target = mapString(uri, caseRoot, realizedRoot);
      const res = await this.send({ method: 'GET', target });
      const original = originals.get(target);
      if (res.status < 200 || res.status >= 300) {
        failures.push(`stateAfter.bytesUnchanged: GET ${uri} -> ${res.status}`);
      } else if (original != null && !res.body.equals(original)) {
        failures.push(`stateAfter.bytesUnchanged: ${uri} bytes changed`);
      }
    }
  }

  async teardown(created, extra, realizedRoot) {
    const targets = [...new Set([...created, ...extra])]
      .filter((u) => u.startsWith(this.config.target))
      .sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length);
    for (const t of targets) {
      try {
        await this.send({ method: 'DELETE', target: t });
      } catch {
        /* best-effort */
      }
    }
    try {
      await this.send({ method: 'DELETE', target: realizedRoot });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Execute one planned http-exchange case.
   * @returns {{disposition: 'pass'|'fail'|'error-setup', failures: string[], realizedRoot: string}}
   */
  async runCase(caseRecord) {
    const state = caseRecord.input?.state ?? {};
    const caseRoot = state.storageRoot;
    const realizedRoot = this.realizedRootFor(caseRecord.id);
    const created = [];
    const extra = [];
    const failures = [];
    const originals = new Map();

    // Record original bytes for bytesUnchanged probes.
    for (const [uri, r] of Object.entries(state.resources ?? {})) {
      if (r.type === 'DataResource') {
        originals.set(
          mapString(uri, caseRoot, realizedRoot),
          r.contentBase64 != null ? Buffer.from(r.contentBase64, 'base64') : Buffer.from(r.content ?? '', 'utf8'),
        );
      }
    }

    try {
      await this.ensureRunScope();
      await this.realizeState(state, caseRoot, realizedRoot, created);
    } catch (e) {
      await this.teardown(created, extra, realizedRoot);
      return { disposition: 'error-setup', failures: [e.message], realizedRoot };
    }

    const steps = caseRecord.exchanges
      ? caseRecord.exchanges.map((e) => ({ request: e.request, expected: e.expected ?? {} }))
      : [{ request: caseRecord.input.request, expected: caseRecord.expected ?? {} }];
    const topExpected = caseRecord.exchanges ? (caseRecord.expected ?? {}) : (caseRecord.expected ?? {});

    const responses = [];
    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        // 1. case-space -> target-space, 2. placeholders (target-space values).
        const mappedRequest = mapDeep(step.request, caseRoot, realizedRoot);
        const request = resolvePlaceholders(mappedRequest, responses, caseRecord);
        if (!request.target.startsWith(this.config.target)) {
          await this.teardown(created, extra, realizedRoot);
          return {
            disposition: 'error-setup',
            failures: [`request ${i} targets ${request.target}, outside the realised storage`],
            realizedRoot,
          };
        }
        const agent = 'agent' in request ? (request.agent === null ? null : request.agent) : CONTROLLER;
        const res = await this.send(request, { agent });
        responses.push(res);
        const loc = headerCombined(res, 'Location');
        if (loc != null) extra.push(loc.startsWith('/') ? this.config.target + loc : loc);
        if (['PUT', 'POST'].includes(request.method)) extra.push(request.target);

        const expected = resolvePlaceholders(
          mapDeep(step.expected, caseRoot, realizedRoot),
          responses.slice(0, i),
          caseRecord,
        );
        const { stateAfter: _sa, asserts: _as, ...responseExpected } = expected;
        for (const f of evaluateExpected(responseExpected, res)) failures.push(`exchange[${i}] ${f}`);
        if (expected.stateAfter) {
          await this.probeStateAfter(expected.stateAfter, caseRoot, realizedRoot, originals, failures);
        }
      }

      // Top-level asserts + stateAfter (multi-exchange form).
      if (topExpected.asserts) {
        for (const a of topExpected.asserts) {
          const values = a.refs.map((r) => assertRefValue(r, responses));
          if (a.kind === 'equal') {
            if (!values.every((v) => v === values[0])) {
              failures.push(`asserts equal: ${a.refs.join(' vs ')} -> ${JSON.stringify(values)}`);
            }
          } else if (a.kind === 'differ') {
            const seen = new Set(values.map((v) => JSON.stringify(v)));
            if (seen.size !== values.length) {
              failures.push(`asserts differ: ${a.refs.join(' vs ')} -> ${JSON.stringify(values)}`);
            }
          } else failures.push(`asserts: unsupported kind ${a.kind}`);
        }
      }
      if (topExpected.stateAfter && caseRecord.exchanges) {
        await this.probeStateAfter(topExpected.stateAfter, caseRoot, realizedRoot, originals, failures);
      }
    } catch (e) {
      failures.push(`harness error: ${e.message}`);
    }

    await this.teardown(created, extra, realizedRoot);
    return { disposition: failures.length === 0 ? 'pass' : 'fail', failures, realizedRoot };
  }
}

export { CONTROLLER };
