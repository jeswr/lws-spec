#!/usr/bin/env node
// AUTHORED-BY Claude Fable 5
//
// Generator for the JLWS conformance test vectors.
//
//   node test-vectors/tools/generate.mjs
//
// Regenerates every vectors/<suite>/ directory from the case definitions in
// tools/suites/*.mjs, plus the per-suite manifests and the top-level manifest.
// Stdlib-only (Node >= 20). Deterministic: signing keys are loaded from
// tools/keys/ (generated on first run and committed; Ed25519 signatures are
// deterministic, so regeneration is byte-stable).
//
// The expected verdicts are DERIVED FROM THE SPEC TEXT (lws-spec @ 0f6b80f —
// the commit the suite was last reconciled against; bump SPEC_SOURCE + rerun
// a reconciliation pass whenever the spec's normative text changes), not
// extracted from a reference implementation — none exists yet. See
// test-vectors/README.md "Provenance of verdicts".

import {
  mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync,
  randomBytes, sign,
} from 'node:crypto';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const VEC = join(ROOT, 'vectors');
const KEYDIR = join(TOOLS, 'keys');

// ---------------------------------------------------------------------------
// Shared constants (exposed to the suite modules via ctx)
// ---------------------------------------------------------------------------

export const SPEC_SOURCE = 'lws-spec@0f6b80f';
// Companion documents whose anchors are cited in `source`/`notes` (never in
// `clauses`, which pin only core#/rdf# section ids — see README):
export const DPOP_SK_SOURCE = 'dpop-sk-spec@f485855';
export const WEBAUTHN_REAUTH_SOURCE = 'solid-webauthn-reauth@cf81736';
export const A2A_RDF_SOURCE = 'a2a-rdf-extension@d3a2773';
export const DPOP_SK_PROFILE = 'https://w3id.org/jeswr/dpop-sk/v1';
export const A2A_RDF_EXT = 'https://w3id.org/jeswr/a2a-rdf/v1';
export const WEBAUTHN_TOKEN_TYPE = 'urn:solid:token-type:webauthn-assertion';
export const CORE = 'https://w3id.org/jeswr/lws/protocol/core/1.0';
export const RDF1 = 'https://w3id.org/jeswr/lws/transform/rdf-1';
export const PROBLEMS = 'https://w3id.org/jeswr/lws/problems/';
export const NOW = '2026-07-01T12:00:00Z';
export const NOW_EPOCH = Math.floor(Date.parse(NOW) / 1000);

// The one shared example world.
export const STORAGE = 'https://storage.example/alice/';
export const ALICE = 'https://id.example/alice';
export const BOB = 'https://id.example/bob';
export const AS_ISSUER = 'https://as.example';
export const ROGUE_ISSUER = 'https://rogue-as.example';
export const CLIENT = 'https://app.example/id';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function stableStringify(value, indent = 2) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
      return out;
    }
    return v;
  };
  return `${JSON.stringify(norm(value), null, indent)}\n`;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const b64 = (buf) => Buffer.from(buf).toString('base64');

function loadOrCreateEd25519(name) {
  const file = join(KEYDIR, `${name}.TEST-ONLY.private.jwk.json`);
  let privJwk;
  if (existsSync(file)) {
    privJwk = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const { privateKey } = generateKeyPairSync('ed25519');
    privJwk = privateKey.export({ format: 'jwk' });
    mkdirSync(KEYDIR, { recursive: true });
    writeFileSync(file, stableStringify(privJwk));
  }
  const privateKey = createPrivateKey({ key: privJwk, format: 'jwk' });
  const publicKey = createPublicKey(privateKey);
  const publicJwk = publicKey.export({ format: 'jwk' });
  return { privateKey, publicKey, publicJwk };
}

export function signJwt(header, payload, privateKey) {
  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(payload));
  const sig = sign(null, Buffer.from(`${h}.${p}`), privateKey);
  return `${h}.${p}.${b64u(sig)}`;
}

// Symmetric TEST-ONLY key (32 bytes) for the DPoP-SK attestation fixtures —
// committed deliberately, like the Ed25519 keys, so regeneration is
// byte-stable (HMAC is deterministic). See README "Keyring — TEST KEYS ONLY".
function loadOrCreateHmacKey(name) {
  const file = join(KEYDIR, `${name}.TEST-ONLY.key.json`);
  let jwk;
  if (existsSync(file)) {
    jwk = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    jwk = { k: b64u(randomBytes(32)), kty: 'oct' };
    mkdirSync(KEYDIR, { recursive: true });
    writeFileSync(file, stableStringify(jwk));
  }
  return Buffer.from(jwk.k, 'base64url');
}

// RFC 7638 JWK thumbprint of an OKP (Ed25519) public JWK: SHA-256 of the JSON
// object containing exactly the required members, lexicographically ordered
// (crv, kty, x), with no whitespace.
export function jwkThumbprint(publicJwk) {
  const ordered = { crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x };
  return b64u(createHash('sha256').update(JSON.stringify(ordered)).digest());
}

// RFC 9449 `ath`: base64url(SHA-256(ASCII(access token))).
export const athOf = (token) => b64u(createHash('sha256').update(token, 'ascii').digest());

// DPoP-SK per-request attestation (dpop-sk-spec #attestation-request): an
// RFC 9421 message signature over the REQUIRED covered-component set
// ("@method" "@target-uri" "authorization"), hmac-sha256 under the session
// key K, nonce as a String-typed parameter, tag "dpop-sk". Returns the two
// header field values to inline into an http-exchange request.
export function skAttestationHeaders(opts, key) {
  const {
    method = 'GET', targetUri, token, created = NOW_EPOCH, sessionId,
    nonce, corrupt = false,
  } = opts;
  const paramsStr = `("@method" "@target-uri" "authorization");created=${created};keyid="${sessionId}";alg="hmac-sha256";nonce="${nonce}";tag="dpop-sk"`;
  const base = [
    `"@method": ${method}`,
    `"@target-uri": ${targetUri}`,
    `"authorization": DPoP ${token}`,
    `"@signature-params": ${paramsStr}`,
  ].join('\n');
  let tag = createHmac('sha256', key).update(base, 'utf8').digest();
  if (corrupt) {
    tag = Buffer.from(tag);
    tag[0] ^= 0xff;
  }
  return {
    'Signature-Input': `sig=${paramsStr}`,
    Signature: `sig=:${b64(tag)}:`,
  };
}

export function contentDigest(bodyBytes) {
  return `sha-256=:${b64(createHash('sha256').update(bodyBytes).digest())}:`;
}

// RFC 9421 HTTP Message Signature over a webhook delivery, Ed25519.
// Covered components default to the set the spec requires
// (core#webhook-binding): @method, @target-uri (standing in for
// @scheme/@authority/@path), content-type, content-digest.
export function signWebhookDelivery(opts, key) {
  const {
    method = 'POST',
    targetUri = 'https://receiver.example/inbox',
    contentType = 'application/ld+json',
    bodyBytes,
    keyid,
    components = ['@method', '@target-uri', 'content-type', 'content-digest'],
    created = NOW_EPOCH,
  } = opts;
  const digest = contentDigest(bodyBytes);
  const paramsStr = `(${components.map((c) => `"${c}"`).join(' ')});created=${created};keyid="${keyid}";alg="ed25519"`;
  const componentValue = (c) => {
    switch (c) {
      case '@method': return method;
      case '@target-uri': return targetUri;
      case 'content-type': return contentType;
      case 'content-digest': return digest;
      default: throw new Error(`unsupported covered component ${c}`);
    }
  };
  const base = [...components.map((c) => `"${c}": ${componentValue(c)}`),
    `"@signature-params": ${paramsStr}`].join('\n');
  const sig = sign(null, Buffer.from(base, 'utf8'), key.privateKey);
  return {
    method,
    targetUri,
    headers: {
      'Content-Type': contentType,
      'Content-Digest': digest,
      'Signature-Input': `sig1=${paramsStr}`,
      Signature: `sig1=:${b64(sig)}:`,
    },
    signatureBase: base,
    signature: sig,
  };
}

// ---------------------------------------------------------------------------
// Build the shared crypto context
// ---------------------------------------------------------------------------

function buildCtx() {
  const asKey = loadOrCreateEd25519('as');
  const rogueKey = loadOrCreateEd25519('rogue-as');
  const storageKey = loadOrCreateEd25519('storage-webhook');
  const skClientKey = loadOrCreateEd25519('sk-client');
  const skSessionKey = loadOrCreateHmacKey('sk-session');
  const skClientJkt = jwkThumbprint(skClientKey.publicJwk);

  const jwks = (k, kid) => stableStringify({
    keys: [{ ...k.publicJwk, alg: 'EdDSA', kid, use: 'sig' }],
  });

  const atClaims = (over = {}) => ({
    sub: ALICE,
    iss: AS_ISSUER,
    client_id: CLIENT,
    aud: STORAGE,
    iat: NOW_EPOCH - 30,
    exp: NOW_EPOCH + 270,
    jti: `jlws-vec-${Object.keys(over).sort().join('-') || 'valid'}`,
    ...over,
  });
  const atHeader = { alg: 'EdDSA', typ: 'at+jwt', kid: 'as-key-1' };
  const at = (claims, header = atHeader, key = asKey) =>
    signJwt(header, claims, key.privateKey);

  const tokens = {
    'at-valid.jwt': at(atClaims()),
    'at-expired.jwt': at(atClaims({ iat: NOW_EPOCH - 4000, exp: NOW_EPOCH - 3600, jti: 'jlws-vec-expired' })),
    'at-nbf-future.jwt': at(atClaims({ nbf: NOW_EPOCH + 600, jti: 'jlws-vec-nbf' })),
    'at-iat-future.jwt': at(atClaims({ iat: NOW_EPOCH + 600, exp: NOW_EPOCH + 900, jti: 'jlws-vec-iat' })),
    'at-exp-too-far.jwt': at(atClaims({ exp: NOW_EPOCH + 7200, jti: 'jlws-vec-far' })),
    'at-multi-aud.jwt': at(atClaims({ aud: [STORAGE, 'https://other-storage.example/carol/'], jti: 'jlws-vec-multiaud' })),
    'at-aud-other-storage.jwt': at(atClaims({ aud: 'https://other-storage.example/carol/', jti: 'jlws-vec-otheraud' })),
    'at-aud-segment-trap.jwt': at(atClaims({ aud: 'https://storage.example/alice', jti: 'jlws-vec-trap' })),
    'at-untrusted-issuer.jwt': at(
      atClaims({ iss: ROGUE_ISSUER, jti: 'jlws-vec-rogue' }),
      { alg: 'EdDSA', typ: 'at+jwt', kid: 'rogue-key-1' },
      rogueKey,
    ),
    'at-cnf-bound.jwt': at(atClaims({ cnf: { jkt: 'x1lFC4tBUpQPvrAkVXfXHWSZgheS2q6uHhOxNAToDXY' }, jti: 'jlws-vec-cnf' })),
    'at-wrong-typ.jwt': at(atClaims({ jti: 'jlws-vec-typ' }), { alg: 'EdDSA', typ: 'JWT', kid: 'as-key-1' }),
    // A token as issued via the WebAuthn suite: the [WEBAUTHN-REAUTH] exchange
    // issues only DPoP-bound tokens, so it always carries cnf.jkt (here: the
    // committed sk-client key's RFC 7638 thumbprint).
    'at-webauthn-cnf.jwt': at(atClaims({ cnf: { jkt: skClientJkt }, jti: 'jlws-vec-webauthn' })),
  };

  // alg=none: unsigned.
  {
    const h = b64u(JSON.stringify({ alg: 'none', typ: 'at+jwt' }));
    const p = b64u(JSON.stringify(atClaims({ jti: 'jlws-vec-none' })));
    tokens['at-alg-none.jwt'] = `${h}.${p}.`;
  }
  // Tampered: valid signature, then the payload is swapped without re-signing.
  {
    const [h, , s] = tokens['at-valid.jwt'].split('.');
    const p = b64u(JSON.stringify(atClaims({ sub: 'https://id.example/mallory', jti: 'jlws-vec-valid' })));
    tokens['at-tampered.jwt'] = `${h}.${p}.${s}`;
  }

  const authKeyring = {
    'as.jwks.json': jwks(asKey, 'as-key-1'),
    'rogue-as.jwks.json': jwks(rogueKey, 'rogue-key-1'),
    ...Object.fromEntries(Object.entries(tokens).map(([n, t]) => [n, `${t}\n`])),
  };

  // -------------------------------------------------------------------------
  // DPoP-SK fixtures (vectors/dpop-sk/keyring/) — dpop-sk-spec, cb=none
  // flavour only (the tls-exporter flavour needs a live TLS exporter and
  // stays in GAPS.md). All deterministic: Ed25519 + HMAC under committed
  // TEST-ONLY keys.
  // -------------------------------------------------------------------------
  const SK_ENDPOINT = `${STORAGE}.pop/session`;
  const SK_SESSION_ID = Buffer.from(Array.from({ length: 16 }, (_, i) => i)).toString('base64url');
  const SK_EXPIRED_SESSION_ID = Buffer.from(Array.from({ length: 16 }, (_, i) => 16 + i)).toString('base64url');

  const skTokens = {
    // The session-bound token: valid, single-aud, cnf.jkt = the sk-client key.
    'at-sk-bound.jwt': at(atClaims({ cnf: { jkt: skClientJkt }, jti: 'jlws-vec-sk-bound' })),
    // A second, equally valid cnf-bound token — for the token-substitution case.
    'at-sk-other.jwt': at(atClaims({ cnf: { jkt: skClientJkt }, jti: 'jlws-vec-sk-other' })),
    // A valid token WITHOUT cnf: establishment from it must be refused.
    'at-sk-nocnf.jwt': at(atClaims({ jti: 'jlws-vec-sk-nocnf' })),
  };

  const dpopProof = (jti, boundToken) => signJwt(
    {
      alg: 'EdDSA',
      typ: 'dpop+jwt',
      jwk: { crv: skClientKey.publicJwk.crv, kty: skClientKey.publicJwk.kty, x: skClientKey.publicJwk.x },
    },
    { ath: athOf(boundToken), htm: 'POST', htu: SK_ENDPOINT, iat: NOW_EPOCH, jti },
    skClientKey.privateKey,
  );

  const skSession = (sessionId, boundToken, expiresAt) => stableStringify({
    alg: 'hmac-sha256',
    cb: 'none',
    expiresAt,
    key: Buffer.from(skSessionKey).toString('base64url'),
    session_id: sessionId,
    tokenHash: athOf(boundToken),
  });

  const skKeyring = {
    'as.jwks.json': jwks(asKey, 'as-key-1'),
    ...Object.fromEntries(Object.entries(skTokens).map(([n, t]) => [n, `${t}\n`])),
    'dpop-establish.jwt': `${dpopProof('jlws-vec-sk-est-1', skTokens['at-sk-bound.jwt'])}\n`,
    'dpop-establish-nocnf.jwt': `${dpopProof('jlws-vec-sk-est-2', skTokens['at-sk-nocnf.jwt'])}\n`,
    'session-valid.json': skSession(SK_SESSION_ID, skTokens['at-sk-bound.jwt'], '2026-07-01T12:02:00Z'),
    'session-expired.json': skSession(SK_EXPIRED_SESSION_ID, skTokens['at-sk-bound.jwt'], '2026-07-01T11:59:00Z'),
  };

  const skAttest = ({ tokenName = 'at-sk-bound.jwt', ...opts }) => skAttestationHeaders({
    sessionId: SK_SESSION_ID,
    token: skTokens[tokenName],
    ...opts,
  }, skSessionKey);

  // -------------------------------------------------------------------------
  // WebAuthn assertion-bundle fixtures ([WEBAUTHN-REAUTH] wire contract:
  // base64url of the UTF-8 JSON envelope {version: 1, credential}).
  // Deterministic bytes; no live authenticator involved — the decode surface
  // is structural (the OP's cryptographic verification is out of vector
  // scope, GAPS.md).
  // -------------------------------------------------------------------------
  const WEBAUTHN_CREDENTIAL_ID = Buffer.from('jlws-vector-credential-01').toString('base64url');
  const webauthnCredential = {
    id: WEBAUTHN_CREDENTIAL_ID,
    rawId: WEBAUTHN_CREDENTIAL_ID,
    type: 'public-key',
    response: {
      clientDataJSON: b64u(JSON.stringify({
        type: 'webauthn.get',
        challenge: b64u('jlws-vector-challenge'),
        origin: 'https://app.example',
      })),
      authenticatorData: b64u(Buffer.from(Array.from({ length: 37 }, (_, i) => i))),
      signature: b64u(Buffer.from(Array.from({ length: 64 }, (_, i) => 64 + i))),
      userHandle: b64u('alice-user-handle'),
    },
    clientExtensionResults: {},
  };
  const encodeBundle = (bundle) => b64u(JSON.stringify(bundle));
  const webauthnBundles = {
    'bundle.b64u': `${encodeBundle({ version: 1, credential: webauthnCredential })}\n`,
    // Alphabet-valid but NON-CANONICAL base64url in a binary field: "AB"
    // decodes to 0x00 yet re-encodes to "AA" — a distinct string aliasing the
    // same bytes (a malleability hazard for string-keyed credential lookups).
    // The wire contract's fail-closed decode must reject it.
    'bundle-noncanonical.b64u': `${encodeBundle({
      version: 1,
      credential: {
        ...webauthnCredential,
        response: { ...webauthnCredential.response, signature: 'AB' },
      },
    })}\n`,
  };

  // Storage description used by the webhook-verification cases (also a valid
  // document under core#discovery-model).
  const webhookKeyId = `${STORAGE}description#whk-1`;
  const webhookStorageDescription = stableStringify({
    '@context': ['https://w3id.org/jeswr/lws/v1', 'https://www.w3.org/ns/cid/v1'],
    id: STORAGE,
    type: 'Storage',
    conformsTo: [CORE],
    verificationMethod: [{
      id: webhookKeyId,
      type: 'JsonWebKey',
      controller: `${STORAGE}description`,
      publicKeyJwk: { ...storageKey.publicJwk, alg: 'EdDSA', use: 'sig' },
    }],
    service: [
      { type: 'StorageDescription', serviceEndpoint: `${STORAGE}description` },
      {
        type: 'NotificationService',
        serviceEndpoint: `${STORAGE}notifications`,
        subscriptionType: ['WebhookSubscription', 'SseSubscription', 'WebSocketSubscription'],
      },
    ],
  });

  const envelope = {
    '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/jeswr/lws/v1'],
    type: ['Notification', 'Update'],
    object: { id: `${STORAGE}notes/a.txt`, type: 'DataResource' },
    published: NOW,
  };
  const envelopeBytes = Buffer.from(stableStringify(envelope, 0));

  const webhookFixture = (opts = {}) => {
    const signed = signWebhookDelivery({
      bodyBytes: envelopeBytes,
      keyid: opts.badKeyid ? `${STORAGE}description#no-such-key` : webhookKeyId,
      components: opts.omitDigestCoverage
        ? ['@method', '@target-uri', 'content-type']
        : undefined,
    }, storageKey);
    if (opts.corruptSignature) {
      const flipped = Buffer.from(signed.signature);
      flipped[0] ^= 0xff;
      signed.headers.Signature = `sig1=:${b64(flipped)}:`;
    }
    const bodyOut = opts.tamperBody
      ? Buffer.from(stableStringify({ ...envelope, published: '2026-07-01T13:00:00Z' }, 0))
      : envelopeBytes;
    return {
      'delivery.json': stableStringify({
        method: signed.method,
        targetUri: signed.targetUri,
        headers: signed.headers,
        bodyFile: 'body.json',
      }),
      'body.json': bodyOut,
    };
  };

  return {
    SPEC_SOURCE, CORE, RDF1, PROBLEMS, NOW, NOW_EPOCH,
    STORAGE, ALICE, BOB, AS_ISSUER, ROGUE_ISSUER, CLIENT,
    DPOP_SK_SOURCE, WEBAUTHN_REAUTH_SOURCE, A2A_RDF_SOURCE,
    DPOP_SK_PROFILE, A2A_RDF_EXT, WEBAUTHN_TOKEN_TYPE,
    SK_ENDPOINT, SK_SESSION_ID, SK_EXPIRED_SESSION_ID,
    WEBAUTHN_CREDENTIAL_ID,
    stableStringify,
    authKeyring,
    skKeyring,
    skAttest,
    webauthnBundles,
    notificationsKeyring: { 'storage-description.json': webhookStorageDescription },
    webhookFixture,
    envelope,
  };
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

async function main() {
  const ctx = buildCtx();
  const suiteModules = [
    'resources', 'containers', 'metadata', 'discovery', 'auth',
    'dpop-sk', 'access-grants', 'notifications', 'rdf-transform', 'errors',
  ];

  const topIndex = [];
  let totalCases = 0;
  const allIds = new Set();

  for (const name of suiteModules) {
    const mod = await import(`./suites/${name}.mjs`);
    const suite = mod.default(ctx);
    const suiteDir = join(VEC, suite.suite);
    rmSync(suiteDir, { recursive: true, force: true });
    mkdirSync(join(suiteDir, 'cases'), { recursive: true });

    if (suite.keyring) {
      const kd = join(suiteDir, 'keyring');
      mkdirSync(kd, { recursive: true });
      for (const [file, content] of Object.entries(suite.keyring)) {
        writeFileSync(join(kd, file), content);
      }
    }

    const manifestCases = [];
    const clauseIndex = {};
    for (const c of suite.cases) {
      const fullId = `${suite.suite}/${c.id}`;
      if (allIds.has(fullId)) throw new Error(`duplicate case id ${fullId}`);
      allIds.add(fullId);
      if (!Array.isArray(c.clauses) || c.clauses.length === 0) {
        throw new Error(`${fullId}: clauses required`);
      }
      if (!c.operation || !c.title) throw new Error(`${fullId}: operation/title required`);
      if (!c.input && !c.exchanges) throw new Error(`${fullId}: input or exchanges required`);
      const caseDir = join(suiteDir, 'cases', c.id);
      mkdirSync(caseDir, { recursive: true });
      const emitted = {
        id: fullId,
        title: c.title,
        spec: suite.spec,
        clauses: c.clauses,
        level: c.level ?? 'MUST',
        operation: c.operation,
        source: c.source
          ?? `${SPEC_SOURCE} ${c.clauses[0]} (spec-derived; no reference implementation yet)`,
      };
      if (c.preconditions) emitted.preconditions = c.preconditions;
      if (c.notes) emitted.notes = c.notes;
      if (c.input) emitted.input = c.input;
      if (c.exchanges) emitted.exchanges = c.exchanges;
      if (c.expected) emitted.expected = c.expected;
      writeFileSync(join(caseDir, 'case.json'), stableStringify(emitted));
      for (const [file, content] of Object.entries(c.files ?? {})) {
        writeFileSync(join(caseDir, file), content);
      }
      manifestCases.push({ id: fullId, path: `cases/${c.id}/case.json` });
      for (const clause of c.clauses) {
        (clauseIndex[clause] ??= []).push(fullId);
      }
    }

    writeFileSync(join(suiteDir, 'manifest.json'), stableStringify({
      suite: suite.suite,
      spec: suite.spec,
      description: suite.description,
      schemaVersion: 1,
      caseCount: manifestCases.length,
      cases: manifestCases,
      clauseIndex,
    }));
    topIndex.push({
      suite: suite.suite,
      path: `vectors/${suite.suite}/manifest.json`,
      spec: suite.spec,
      caseCount: manifestCases.length,
      description: suite.description,
    });
    totalCases += manifestCases.length;
  }

  writeFileSync(join(ROOT, 'manifest.json'), stableStringify({
    name: 'jlws-conformance-test-vectors',
    schemaVersion: 1,
    specSource: SPEC_SOURCE,
    specs: {
      core: { uri: CORE, document: '../index.html' },
      'rdf-transform': { uri: RDF1, document: '../rdf-transform.html' },
    },
    evaluationInstant: NOW,
    suiteCount: topIndex.length,
    caseCount: totalCases,
    suites: topIndex,
  }));

  // Leftover-suite guard: no stale directories.
  for (const entry of readdirSync(VEC)) {
    if (!suiteModules.includes(entry)) {
      throw new Error(`stale suite directory vectors/${entry} — remove it or register it`);
    }
  }

  console.log(`generated ${totalCases} cases across ${topIndex.length} suites`);
}

await main();
