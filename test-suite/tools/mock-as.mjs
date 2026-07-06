#!/usr/bin/env node
// AUTHORED-BY Claude Fable 5
//
// Mock OIDC authorization server for reproducing the committed
// solid-server-rs JLWS scoreboard (targets/solid-server-rs.json — see that
// config's `notes` and the README's "Reproducing the solid-server-rs
// scoreboard" section for the full recipe).
//
// Serves OIDC discovery + JWKS on 127.0.0.1 (loopback ONLY — never exposed)
// and mints RFC 9068 `at+jwt` Bearer access tokens (ES256, fresh per-boot
// keypair) that solid-server-rs feat/lws's LWS M2 auth chain verifies when
// the server is booted with SOLID_SERVER_TRUSTED_ISSUER pointing here and
// SOLID_SERVER_ALLOW_LOOPBACK=1 (dev/IT-only escape hatch). The minted
// token's `sub` is the seeded alice WebID, so harness storage-controller
// requests are authenticated and WAC-authorized inside /alice/.
//
// LOCAL TEST ONLY. Stdlib-only, self-contained, no persistence: keys are
// ephemeral, nothing is committed, and every token dies with its TTL.
//
// Endpoints:
//   /.well-known/openid-configuration   OIDC discovery (issuer + jwks_uri)
//   /jwks                               the per-boot signing key
//   /token                              mints a fresh token (text/plain)
//
// Env (all optional):
//   MOCK_AS_PORT   listen port                       (default 3999)
//   MOCK_AS_AUD    RFC 9068 `aud` — the server's audience/base URL
//                                                    (default http://127.0.0.1:3000)
//   MOCK_AS_SUB    `sub`/webid — the seeded controller agent
//                                (default http://127.0.0.1:3000/alice/profile/card#me)
//   TOKEN_TTL      token lifetime in seconds         (default 3500)
//   TOKEN_OUT      also write one minted token to this file at boot
//                                                    (default: don't)

import { createServer } from 'node:http';
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.MOCK_AS_PORT ?? 3999);
const ISSUER = `http://127.0.0.1:${PORT}`;
const AUD = process.env.MOCK_AS_AUD ?? 'http://127.0.0.1:3000';
const SUB = process.env.MOCK_AS_SUB ?? 'http://127.0.0.1:3000/alice/profile/card#me';
const TTL = Number(process.env.TOKEN_TTL ?? 3500);

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });
const kid = 'jlws-run-key';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function mint() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'at+jwt', kid };
  const claims = {
    iss: ISSUER,
    sub: SUB,
    aud: AUD,
    iat: now,
    exp: now + TTL,
    client_id: 'https://jlws-harness.invalid/id',
    jti: randomUUID(),
  };
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const sig = createSign('SHA256')
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64u(sig)}`;
}

const discovery = JSON.stringify({ issuer: ISSUER, jwks_uri: `${ISSUER}/jwks` });
const jwks = JSON.stringify({ keys: [{ ...jwk, kid, use: 'sig', alg: 'ES256' }] });

createServer((req, res) => {
  if (req.url === '/.well-known/openid-configuration') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(discovery);
  } else if (req.url === '/jwks') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(jwks);
  } else if (req.url === '/token') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end(mint());
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => {
  if (process.env.TOKEN_OUT) writeFileSync(process.env.TOKEN_OUT, mint());
  console.log(
    `mock AS on ${ISSUER} (aud ${AUD}, sub ${SUB});` +
      ` mint with: curl -s ${ISSUER}/token${process.env.TOKEN_OUT ? `; token written to ${process.env.TOKEN_OUT}` : ''}`,
  );
});
