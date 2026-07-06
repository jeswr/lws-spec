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
import {
  createHash, createHmac, createPublicKey, timingSafeEqual, verify,
} from 'node:crypto';

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
  'transform-representation', 'evaluate-pop-session-offer', 'discover-service',
  'evaluate-transform-offer', 'decode-webauthn-assertion-bundle',
  'validate-as-metadata',
]);
const LEVELS = new Set(['MUST', 'SHOULD', 'MAY']);
// The closed set of file-bearing input fields (README "File-reference
// convention"): only these members, plus ${file:...} placeholders, name
// fixture files. Any other string is a literal.
const FILE_FIELDS = new Set([
  'token', 'delivery', 'bodyFile', 'isomorphicTo', 'popSkSessions',
]);
// 'storageDescription' is a file ref in verify-webhook-signature inputs but
// an inline document in evaluate-transform-offer inputs — the string-shape
// test below (no spaces, no '://', and for these fields no '@context'
// object) already disambiguates because inline documents are objects, not
// strings.
FILE_FIELDS.add('storageDescription');
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

// --- crypto self-consistency: DPoP-SK fixtures -------------------------------
// The signed dpop-sk fixtures must verify (or deliberately fail) exactly as
// their cases claim: tokens against the committed JWKS, establishment DPoP
// proofs against their embedded JWK (with the ath and cnf.jkt bindings), the
// session records against the tokens they claim to bind, and every
// attestation header pair recomputed under the committed TEST-ONLY session
// key against the ACTUAL request it is played on.
{
  const skDir = join(ROOT, 'vectors/dpop-sk');
  const b64u = (buf) => Buffer.from(buf).toString('base64url');
  const sha256 = (data, enc) => createHash('sha256').update(data, enc).digest();
  const readKeyring = (f) => readFileSync(join(skDir, 'keyring', f), 'utf8').trim();
  const decodePart = (t, i) => JSON.parse(Buffer.from(t.split('.')[i], 'base64url').toString());

  const skTokens = Object.fromEntries(
    ['at-sk-bound.jwt', 'at-sk-other.jwt', 'at-sk-nocnf.jwt'].map((f) => [f, readKeyring(f)]),
  );
  const skJwks = JSON.parse(readKeyring('as.jwks.json'));
  const skAsKey = createPublicKey({ key: skJwks.keys[0], format: 'jwk' });
  for (const [f, t] of Object.entries(skTokens)) {
    const [h, p, s] = t.split('.');
    if (!verify(null, Buffer.from(`${h}.${p}`), skAsKey, Buffer.from(s, 'base64url'))) {
      fail(`dpop-sk keyring ${f}: signature must verify against as.jwks.json`);
    }
  }
  if (!decodePart(skTokens['at-sk-bound.jwt'], 1).cnf?.jkt) fail('at-sk-bound.jwt: missing cnf.jkt');
  if (!decodePart(skTokens['at-sk-other.jwt'], 1).cnf?.jkt) fail('at-sk-other.jwt: missing cnf.jkt');
  if (decodePart(skTokens['at-sk-nocnf.jwt'], 1).cnf) fail('at-sk-nocnf.jwt: must NOT carry cnf (the deliberate unbound-token fixture)');

  // Establishment proofs: EdDSA under the embedded JWK; typ dpop+jwt; ath
  // binds the named token; the bound token's cnf.jkt is the proof key's
  // RFC 7638 thumbprint.
  const proofChecks = [
    ['dpop-establish.jwt', 'at-sk-bound.jwt', true],
    ['dpop-establish-nocnf.jwt', 'at-sk-nocnf.jwt', false],
  ];
  for (const [proofFile, tokenFile, expectCnfBinding] of proofChecks) {
    const proof = readKeyring(proofFile);
    const [h, p, s] = proof.split('.');
    const header = decodePart(proof, 0);
    const payload = decodePart(proof, 1);
    if (header.typ !== 'dpop+jwt') fail(`${proofFile}: typ must be dpop+jwt`);
    const proofKey = createPublicKey({ key: header.jwk, format: 'jwk' });
    if (!verify(null, Buffer.from(`${h}.${p}`), proofKey, Buffer.from(s, 'base64url'))) {
      fail(`${proofFile}: signature must verify against the embedded jwk`);
    }
    if (payload.htm !== 'POST') fail(`${proofFile}: htm must be POST`);
    if (payload.ath !== b64u(sha256(skTokens[tokenFile], 'ascii'))) {
      fail(`${proofFile}: ath must hash ${tokenFile}`);
    }
    const jkt = b64u(sha256(JSON.stringify({ crv: header.jwk.crv, kty: header.jwk.kty, x: header.jwk.x })));
    const cnf = decodePart(skTokens[tokenFile], 1).cnf;
    if (expectCnfBinding && cnf?.jkt !== jkt) {
      fail(`${proofFile}: ${tokenFile} cnf.jkt must equal the proof key thumbprint`);
    }
  }

  // Session records: key present, tokenHash binds at-sk-bound, expiry sides.
  const evalInstant = Date.parse(top.evaluationInstant);
  const sessions = {};
  for (const [f, expectLive] of [['session-valid.json', true], ['session-expired.json', false]]) {
    const s = JSON.parse(readKeyring(f));
    sessions[s.session_id] = s;
    if (s.tokenHash !== b64u(sha256(skTokens['at-sk-bound.jwt'], 'ascii'))) {
      fail(`${f}: tokenHash must be SHA-256 of at-sk-bound.jwt`);
    }
    const live = Date.parse(s.expiresAt) > evalInstant;
    if (live !== expectLive) fail(`${f}: expiresAt must be ${expectLive ? 'after' : 'before'} the evaluation instant`);
    if (Buffer.from(s.key, 'base64url').length !== 32) fail(`${f}: key must be 32 bytes`);
  }

  // Attestation fixtures, per case: recompute the RFC 9421 base from the
  // ACTUAL request in the case file and the committed session key, then
  // compare against the case's claim (sig valid? token bound? session live?).
  const attestExpectation = {
    'attest-ok': [{ sig: true, token: true, live: true }],
    'attest-bad-signature-standard-challenge': [{ sig: false }],
    'attest-cross-target-transplant-rejected': [{ sig: false }],
    'attest-token-substitution-rejected': [{ sig: true, token: false, live: true }],
    'attest-replay-rejected': [
      { sig: true, token: true, live: true },
      { sig: true, token: true, live: true },
    ],
    'attest-forged-cannot-burn-counter': [{ sig: false }, { sig: true, token: true, live: true }],
    'attest-expired-session-rechallenge': [{ sig: true, token: true, live: false }],
    'attest-stripped-signature-no-bearer-fallback': [{ stripped: true }],
  };
  for (const [caseName, perRequest] of Object.entries(attestExpectation)) {
    const c = JSON.parse(readFileSync(join(skDir, 'cases', caseName, 'case.json'), 'utf8'));
    const requests = c.exchanges ? c.exchanges.map((e) => e.request) : [c.input.request];
    const sessionFixture = JSON.parse(readKeyring(c.input.state.popSkSessions[0].replace(/^keyring\//, '')));
    const key = Buffer.from(sessionFixture.key, 'base64url');
    requests.forEach((req, i) => {
      const want = perRequest[i];
      if (!want) { fail(`${caseName}: more requests than expectations`); return; }
      const si = req.headers['Signature-Input'];
      const sig = req.headers.Signature;
      if (want.stripped) {
        if (si || sig) fail(`${caseName}[${i}]: must carry no attestation headers`);
        return;
      }
      if (!si || !sig) { fail(`${caseName}[${i}]: missing attestation headers`); return; }
      const authz = req.headers.Authorization.replace(
        /\$\{file:([^}]+)\}/,
        (_, ref) => readKeyring(ref.replace(/^keyring\//, '')),
      );
      const paramsStr = si.replace(/^sig=/, '');
      const keyid = paramsStr.match(/keyid="([^"]+)"/)?.[1];
      const base = [
        `"@method": ${req.method}`,
        `"@target-uri": ${req.target}`,
        `"authorization": ${authz}`,
        `"@signature-params": ${paramsStr}`,
      ].join('\n');
      const expectTag = createHmac('sha256', key).update(base, 'utf8').digest();
      const gotTag = Buffer.from(sig.match(/^sig=:(.*):$/)?.[1] ?? '', 'base64');
      const sigOk = gotTag.length === expectTag.length && timingSafeEqual(gotTag, expectTag);
      if (sigOk !== want.sig) {
        fail(`${caseName}[${i}]: HMAC ${sigOk ? 'verifies but must not' : 'must verify but does not'}`);
      }
      if (want.sig && keyid !== sessionFixture.session_id) {
        fail(`${caseName}[${i}]: keyid must name the realised session`);
      }
      if (want.token !== undefined) {
        const presented = authz.replace(/^DPoP /, '');
        const bound = b64u(sha256(presented, 'ascii')) === sessionFixture.tokenHash;
        if (bound !== want.token) fail(`${caseName}[${i}]: token binding is ${bound}, case claims ${want.token}`);
      }
      if (want.live !== undefined) {
        const live = Date.parse(sessionFixture.expiresAt) > evalInstant;
        if (live !== want.live) fail(`${caseName}[${i}]: session liveness is ${live}, case claims ${want.live}`);
      }
    });
  }
}

// --- fixture self-consistency: WebAuthn assertion bundles --------------------
// Reimplements the wire contract's fail-closed decode (canonical unpadded
// base64url; version-1 envelope; required credential fields) and checks each
// bundle fixture decodes — or deliberately fails — exactly as its case claims.
{
  const casesDir = join(ROOT, 'vectors/auth/cases');
  const isCanonicalB64u = (v) => {
    if (typeof v !== 'string' || v.length === 0 || v.length % 4 === 1) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(v)) return false;
    return Buffer.from(v, 'base64url').toString('base64url') === v;
  };
  const decodeBundle = (token) => {
    if (!/^[A-Za-z0-9_-]*$/.test(token)) return { ok: false, at: 'outer-b64u' };
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, at: 'json' };
    }
    if (parsed?.version !== 1) return { ok: false, at: 'version' };
    const cred = parsed.credential;
    if (typeof cred !== 'object' || cred === null) return { ok: false, at: 'credential' };
    for (const f of ['id', 'rawId']) {
      if (!isCanonicalB64u(cred[f])) return { ok: false, at: f };
    }
    if (cred.type !== 'public-key') return { ok: false, at: 'type' };
    const r = cred.response;
    if (typeof r !== 'object' || r === null) return { ok: false, at: 'response' };
    for (const f of ['clientDataJSON', 'authenticatorData', 'signature']) {
      if (!isCanonicalB64u(r[f])) return { ok: false, at: `response.${f}` };
    }
    if (r.userHandle !== undefined && r.userHandle !== null && !isCanonicalB64u(r.userHandle)) {
      return { ok: false, at: 'response.userHandle' };
    }
    return { ok: true, credentialId: cred.id };
  };
  const bundleExpectation = {
    'webauthn-bundle-decode-ok': { ok: true },
    'webauthn-bundle-noncanonical-b64url-rejected': { ok: false, at: 'response.signature' },
  };
  for (const [caseName, expectation] of Object.entries(bundleExpectation)) {
    const c = JSON.parse(readFileSync(join(casesDir, caseName, 'case.json'), 'utf8'));
    const token = readFileSync(join(casesDir, caseName, c.input.token), 'utf8').trim();
    const result = decodeBundle(token);
    if (result.ok !== expectation.ok) {
      fail(`${caseName}: bundle fixture decode ok=${result.ok}, case claims ok=${expectation.ok}`);
    }
    if (!expectation.ok && result.at !== expectation.at) {
      fail(`${caseName}: bundle must fail at ${expectation.at}, failed at ${result.at}`);
    }
    if (expectation.ok && result.credentialId !== c.expected.credentialId) {
      fail(`${caseName}: fixture credential id ${result.credentialId} != expected.credentialId`);
    }
  }
}

// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`FAIL — ${failures.length} finding(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK — ${caseTotal} cases across ${top.suites.length} suites are internally coherent (manifests, clause pins, fixtures, signatures).`);
