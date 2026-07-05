#!/usr/bin/env node
// AUTHORED-BY Claude Fable 5
//
// Consistency checker for the JLWS conformance test vectors.
//
//   node test-vectors/tools/check.mjs
//
// This is NOT a conformance harness (no implementation exists yet to run one
// against). It verifies the committed vector suite is internally coherent:
//
//   - manifests <-> case files <-> ids all agree;
//   - every case pins clauses whose section ids actually exist in the spec
//     documents (../index.html, ../rdf-transform.html);
//   - every referenced fixture file exists; every JSON fixture parses;
//   - the signed fixtures are cryptographically self-consistent: JWTs verify
//     against the committed JWKS (except the deliberately broken ones, which
//     must FAIL), and the RFC 9421 webhook deliveries verify/fail exactly as
//     their cases expect;
//   - expected.nq graph references are well-formed N-Quads lines;
//   - placeholders only reference earlier exchanges.
//
// Exit 0 = coherent; exit 1 = a finding (printed).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPublicKey, verify } from 'node:crypto';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const REPO = join(ROOT, '..');

const failures = [];
const fail = (msg) => failures.push(msg);

// --- spec section ids ------------------------------------------------------
const sectionIds = (file) => new Set(
  [...readFileSync(join(REPO, file), 'utf8').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
);
const CORE_IDS = sectionIds('index.html');
const RDF_IDS = sectionIds('rdf-transform.html');

const OPERATIONS = new Set([
  'http-exchange', 'validate-access-token', 'evaluate-token-exchange',
  'verify-realm-containment', 'enforce-authorization-details',
  'validate-access-document', 'evaluate-access', 'validate-storage-description',
  'validate-notification-envelope', 'verify-webhook-signature',
  'transform-representation',
]);
const LEVELS = new Set(['MUST', 'SHOULD', 'MAY']);
// The closed set of file-bearing input fields (README "File-reference
// convention"): only these members, plus ${file:...} placeholders, name
// fixture files. Any other string is a literal.
const FILE_FIELDS = new Set([
  'token', 'delivery', 'storageDescription', 'bodyFile', 'isomorphicTo',
]);
// 'source' is a file ref ONLY inside a transform-representation input (its
// sibling sourceMediaType disambiguates it from a ContentNegotiation
// capability entry's source member, which is a media type).
const FILE_MAP_FIELDS = new Set(['issuerJwks']);

// --- manifest walk ---------------------------------------------------------
const top = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
let caseTotal = 0;
const seenIds = new Set();

const collectFileRefs = (value, out, key = null, caseMeta = null) => {
  if (typeof value === 'string') {
    // `source` doubles as a provenance string at the case level and a file
    // ref inside transform inputs — disambiguate by containing spaces.
    const isFileField = FILE_FIELDS.has(key) && !value.includes(' ') && !value.includes('://');
    if (isFileField) out.push(value);
    const m = value.match(/\$\{file:([^}]+)\}/);
    if (m) out.push(m[1]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectFileRefs(v, out, key, caseMeta));
  } else if (value && typeof value === 'object') {
    if (typeof value.source === 'string' && typeof value.sourceMediaType === 'string') {
      out.push(value.source);
    }
    for (const [k, v] of Object.entries(value)) {
      if (FILE_MAP_FIELDS.has(k) && v && typeof v === 'object') {
        Object.values(v).forEach((f) => { if (typeof f === 'string') out.push(f); });
      } else {
        collectFileRefs(v, out, k, caseMeta);
      }
    }
  }
};

const checkPlaceholders = (value, maxIndex, id) => {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\$\{response\[(\d+)\]/g)) {
      if (Number(m[1]) >= maxIndex) fail(`${id}: placeholder references exchange ${m[1]} at/after its own position ${maxIndex}`);
    }
  } else if (Array.isArray(value)) value.forEach((v) => checkPlaceholders(v, maxIndex, id));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => checkPlaceholders(v, maxIndex, id));
};

for (const suiteRef of top.suites) {
  const suiteDir = join(ROOT, dirname(suiteRef.path));
  const manifest = JSON.parse(readFileSync(join(ROOT, suiteRef.path), 'utf8'));
  if (manifest.caseCount !== manifest.cases.length) {
    fail(`${manifest.suite}: caseCount ${manifest.caseCount} != cases.length ${manifest.cases.length}`);
  }
  if (suiteRef.caseCount !== manifest.caseCount) {
    fail(`${manifest.suite}: top-level caseCount disagrees with suite manifest`);
  }
  caseTotal += manifest.caseCount;

  // clauseIndex integrity: every KEY must be a well-formed clause resolving to
  // a real spec section id; every listed ID must be a real case in this
  // manifest; and (checked per-case below) each case must be indexed under
  // EXACTLY the clauses it declares — so a stale/wrong mapping cannot pass.
  const clauseIndex = manifest.clauseIndex ?? {};
  const indexed = new Set(Object.values(clauseIndex).flat());
  const manifestCaseIds = new Set(manifest.cases.map((c) => c.id));
  const indexedUnder = {}; // caseId -> Set of clauses it is listed under
  for (const [clause, ids] of Object.entries(clauseIndex)) {
    const m = clause.match(/^(core|rdf)#([A-Za-z0-9-]+)$/);
    if (!m) fail(`${manifest.suite}: clauseIndex key ${clause} is not a well-formed clause`);
    else {
      const secIds = m[1] === 'core' ? CORE_IDS : RDF_IDS;
      if (!secIds.has(m[2])) fail(`${manifest.suite}: clauseIndex key ${clause} names a section id absent from the spec`);
    }
    if (!Array.isArray(ids)) { fail(`${manifest.suite}: clauseIndex[${clause}] is not an array`); continue; }
    for (const cid of ids) {
      if (!manifestCaseIds.has(cid)) fail(`${manifest.suite}: clauseIndex[${clause}] lists ${cid}, not a case in this manifest`);
      (indexedUnder[cid] ??= new Set()).add(clause);
    }
  }

  for (const { id, path } of manifest.cases) {
    const casePath = join(suiteDir, path);
    const caseDir = dirname(casePath);
    if (!existsSync(casePath)) { fail(`${id}: missing ${path}`); continue; }
    const c = JSON.parse(readFileSync(casePath, 'utf8'));
    if (c.id !== id) fail(`${id}: case.json id is ${c.id}`);
    if (seenIds.has(id)) fail(`${id}: duplicate id`);
    seenIds.add(id);
    if (!indexed.has(id)) fail(`${id}: not present in clauseIndex`);

    for (const field of ['title', 'spec', 'clauses', 'operation', 'level', 'source']) {
      if (!c[field]) fail(`${id}: missing ${field}`);
    }
    if (!OPERATIONS.has(c.operation)) fail(`${id}: unknown operation ${c.operation}`);
    if (!LEVELS.has(c.level)) fail(`${id}: unknown level ${c.level}`);
    if (!c.input && !c.exchanges) fail(`${id}: neither input nor exchanges`);
    if (!c.expected && !c.exchanges) fail(`${id}: no expectations`);

    for (const clause of c.clauses ?? []) {
      const m = clause.match(/^(core|rdf)#([A-Za-z0-9-]+)$/);
      if (!m) { fail(`${id}: malformed clause ${clause}`); continue; }
      const ids = m[1] === 'core' ? CORE_IDS : RDF_IDS;
      if (!ids.has(m[2])) fail(`${id}: clause ${clause} names a section id absent from the spec`);
    }

    // the case must be indexed under EXACTLY the clauses it declares
    const declaredClauses = new Set(c.clauses ?? []);
    const under = indexedUnder[id] ?? new Set();
    for (const cl of declaredClauses) {
      if (!under.has(cl)) fail(`${id}: declares clause ${cl} but is not indexed under it`);
    }
    for (const cl of under) {
      if (!declaredClauses.has(cl)) fail(`${id}: indexed under ${cl} but does not declare it`);
    }

    // file references resolve (case dir, or keyring/ under the suite dir)
    const refs = [];
    collectFileRefs(c, refs);
    for (const ref of refs) {
      const resolved = ref.startsWith('keyring/') ? join(suiteDir, ref) : join(caseDir, ref);
      if (!existsSync(resolved)) fail(`${id}: referenced file ${ref} not found`);
      else if (/\.(json|jsonld)$/.test(ref)) {
        try { JSON.parse(readFileSync(resolved, 'utf8')); } catch { fail(`${id}: ${ref} is not valid JSON`); }
      } else if (ref.endsWith('.nq')) {
        const lines = readFileSync(resolved, 'utf8').split('\n').filter((l) => l.trim());
        for (const line of lines) {
          if (!/^(<[^>]+>|_:[A-Za-z0-9]+) <[^>]+> (<[^>]+>|_:[A-Za-z0-9]+|"(?:[^"\\]|\\.)*"(?:\^\^<[^>]+>|@[A-Za-z-]+)?) \.$/.test(line)) {
            fail(`${id}: ${ref} line is not a well-formed N-Quads statement: ${line}`);
          }
        }
      }
    }

    // exchange placeholder ordering
    (c.exchanges ?? []).forEach((ex, i) => checkPlaceholders(ex.request, i, id));

    // per-exchange expectations carry a status assertion
    for (const ex of c.exchanges ?? []) {
      const e = ex.expected ?? {};
      if (!('status' in e) && !('statusClass' in e) && !('statusOneOf' in e) && !('anyOf' in e)) {
        fail(`${id}: an exchange expectation lacks a status assertion`);
      }
    }
    if (c.operation === 'http-exchange' && !c.exchanges) {
      const e = c.expected ?? {};
      if (!('status' in e) && !('statusClass' in e) && !('statusOneOf' in e) && !('anyOf' in e)) {
        fail(`${id}: expected lacks a status assertion`);
      }
    }
  }
}
if (top.caseCount !== caseTotal) fail(`top manifest caseCount ${top.caseCount} != ${caseTotal}`);

// --- crypto self-consistency: JWT fixtures ----------------------------------
const authKeyring = join(ROOT, 'vectors/auth/keyring');
const jwksKeys = {};
for (const f of ['as.jwks.json', 'rogue-as.jwks.json']) {
  for (const k of JSON.parse(readFileSync(join(authKeyring, f), 'utf8')).keys) {
    jwksKeys[k.kid] = createPublicKey({ key: k, format: 'jwk' });
  }
}
const MUST_FAIL_SIG = new Set(['at-tampered.jwt', 'at-alg-none.jwt']);
for (const f of readdirSync(authKeyring).filter((f) => f.endsWith('.jwt'))) {
  const token = readFileSync(join(authKeyring, f), 'utf8').trim();
  const parts = token.split('.');
  if (parts.length !== 3) { fail(`${f}: not a compact JWS`); continue; }
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (header.alg === 'none') {
    if (!MUST_FAIL_SIG.has(f)) fail(`${f}: unexpected alg none`);
    continue;
  }
  const key = jwksKeys[header.kid];
  if (!key) { fail(`${f}: kid ${header.kid} not in committed JWKS`); continue; }
  const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (MUST_FAIL_SIG.has(f) ? ok : !ok) {
    fail(`${f}: signature ${ok ? 'verifies but must not' : 'must verify but does not'}`);
  }
}

// --- crypto self-consistency: webhook fixtures ------------------------------
const notifDir = join(ROOT, 'vectors/notifications');
const sd = JSON.parse(readFileSync(join(notifDir, 'keyring/storage-description.json'), 'utf8'));
const whKeys = Object.fromEntries(
  sd.verificationMethod.map((vm) => [vm.id, createPublicKey({ key: vm.publicKeyJwk, format: 'jwk' })]),
);
const webhookExpectation = {
  'webhook-signature-valid': 'ok',
  'webhook-body-tampered-rejected': 'digest-mismatch',
  'webhook-unknown-keyid-rejected': 'key-unresolved',
  'webhook-insufficient-coverage-rejected': 'coverage',
  'webhook-bad-signature-rejected': 'bad-signature',
};
for (const [caseName, expectation] of Object.entries(webhookExpectation)) {
  const dir = join(notifDir, 'cases', caseName);
  const delivery = JSON.parse(readFileSync(join(dir, 'delivery.json'), 'utf8'));
  const body = readFileSync(join(dir, delivery.bodyFile));
  const digestOk = delivery.headers['Content-Digest']
    === `sha-256=:${createHash('sha256').update(body).digest('base64')}:`;
  const si = delivery.headers['Signature-Input'].match(/^sig1=\((.*?)\)(;.*)$/);
  if (!si) { fail(`${caseName}: unparseable Signature-Input`); continue; }
  const components = [...si[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const paramsStr = `(${si[1]})${si[2]}`;
  const keyid = paramsStr.match(/keyid="([^"]+)"/)[1];
  const componentValue = (c) => ({
    '@method': delivery.method,
    '@target-uri': delivery.targetUri,
    'content-type': delivery.headers['Content-Type'],
    'content-digest': delivery.headers['Content-Digest'],
  })[c];
  const base = [...components.map((c) => `"${c}": ${componentValue(c)}`),
    `"@signature-params": ${paramsStr}`].join('\n');
  const sigB64 = delivery.headers.Signature.match(/^sig1=:(.*):$/)[1];
  const key = whKeys[keyid];
  const sigOk = key
    ? verify(null, Buffer.from(base, 'utf8'), key, Buffer.from(sigB64, 'base64'))
    : false;
  // Full required-coverage set (core#webhook-binding): @method, the target
  // form (@target-uri OR all of @scheme/@authority/@path), content-type, and
  // content-digest — not content-digest alone.
  const hasTargetForm = components.includes('@target-uri')
    || (components.includes('@scheme') && components.includes('@authority') && components.includes('@path'));
  const covered = components.includes('@method')
    && components.includes('content-type')
    && components.includes('content-digest')
    && hasTargetForm;

  const verdict = !key ? 'key-unresolved'
    : !sigOk ? 'bad-signature'
      : !covered ? 'coverage'
        : !digestOk ? 'digest-mismatch'
          : 'ok';
  if (verdict !== expectation) fail(`${caseName}: fixture self-check verdict ${verdict}, expected ${expectation}`);
}

// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`FAIL — ${failures.length} finding(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK — ${caseTotal} cases across ${top.suites.length} suites are internally coherent (manifests, clause pins, fixtures, signatures).`);
