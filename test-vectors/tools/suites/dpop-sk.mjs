// AUTHORED-BY Claude Fable 5
// Suite: dpop-sk — the DPoP-SK proof-of-possession presentation profile
// composed onto the JLWS auth surface (core#presentation-pop,
// #authz-discovery, #rs-validation), per the alignment verdict in
// docs/alignment/dpop-sk.md: an AUTH-layer PoP profile negotiated via the
// RFC 9728 protected resource metadata (`pop_session`), with
// `dpop_bound_access_tokens_required` covering both PoP profiles.
//
// Only the cb=none (browser) flavour is vectored: it is fully deterministic
// under the committed TEST-ONLY session key. The tls-exporter flavour needs a
// live TLS exporter interface no fixture can supply and stays in GAPS.md.
// Failure signalling is deliberately uniform (dpop-sk-spec
// #attestation-verification (E): the generic DPoP challenge, no
// profile-specific error code), so the reject cases pin only the 401 + the
// challenge scheme; the step expected to fail is recorded in `notes`.

export default function dpopSk(ctx) {
  const {
    STORAGE, CORE, AS_ISSUER, NOW, NOW_EPOCH,
    DPOP_SK_SOURCE, SPEC_SOURCE, DPOP_SK_PROFILE,
    SK_ENDPOINT, SK_SESSION_ID, SK_EXPIRED_SESSION_ID,
    skKeyring, skAttest,
  } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;
  const B = `${NOTES}b.txt`;

  const baseState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: 'alpha' },
      [B]: { type: 'DataResource', mediaType: 'text/plain', content: 'beta' },
    },
    trustedIssuers: [AS_ISSUER],
    issuerJwks: { [AS_ISSUER]: 'keyring/as.jwks.json' },
    now: NOW,
    popProfiles: ['DPoP-SK'],
    popSession: {
      endpoint: SK_ENDPOINT,
      algs: ['hmac-sha256'],
      channelBindings: ['none'],
      profile: DPOP_SK_PROFILE,
    },
  };

  const sessionState = {
    ...baseState,
    popSkSessions: ['keyring/session-valid.json'],
  };

  // A well-formed offer (for the client-negotiation cases).
  const offeredPrm = (popSessionOver = {}) => ({
    resource: STORAGE,
    authorization_servers: [AS_ISSUER],
    jlws_storage_description: `${STORAGE}description`,
    pop_session: {
      endpoint: SK_ENDPOINT,
      algs: ['hmac-sha256'],
      channel_bindings: ['none'],
      profile: DPOP_SK_PROFILE,
      ...popSessionOver,
    },
  });
  const skClient = {
    recognizedProfiles: [DPOP_SK_PROFILE],
    algs: ['hmac-sha256'],
    channelBindings: ['none'],
  };

  const src = (skAnchor, coreClause) =>
    `${SPEC_SOURCE} ${coreClause} + ${DPOP_SK_SOURCE} ${skAnchor} (spec-derived; no reference implementation yet)`;

  return {
    suite: 'dpop-sk',
    spec: CORE,
    keyring: skKeyring,
    description:
      'The DPoP-SK proof-of-possession presentation profile over the JLWS '
      + 'auth surface (cb=none flavour): RFC 9728 pop_session advertisement '
      + 'beside jlws_storage_description, the single '
      + 'dpop_bound_access_tokens_required member covering both PoP profiles, '
      + 'fail-closed client negotiation, session establishment from a '
      + 'DPoP-bound token (and refusal for an unbound one), and per-request '
      + 'RFC 9421 hmac-sha256 attestation with RFC 4303 verify-then-mark '
      + 'anti-replay — accept, tamper, cross-target transplant, token '
      + 'substitution, replay, forged-traffic window integrity, session '
      + 'expiry, and no-bearer-fallback.',
    cases: [
      // ------------------------------------------------------------------
      // Discovery (RFC 9728 PRM surface)
      // ------------------------------------------------------------------
      {
        id: 'prm-carries-pop-session',
        title: 'a DPoP-SK-enabled realm advertises pop_session in its RFC 9728 resource metadata, beside jlws_storage_description',
        clauses: ['core#authz-discovery', 'core#presentation-pop'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#discovery', 'core#authz-discovery'),
        notes: 'The pop_session member set is defined by the DPoP-SK spec '
          + '(#discovery): endpoint (https REQUIRED), algs, channel_bindings, '
          + 'profile. The endpoint value is deployment-specific, so only the '
          + 'negotiation-bearing members are pinned here.',
        exchanges: [
          {
            request: { method: 'GET', target: A, agent: null },
            expected: {
              status: 401,
              headers: {
                'WWW-Authenticate': {
                  authParams: {
                    scheme: 'Bearer',
                    params: { resource_metadata: { present: true } },
                  },
                },
              },
            },
          },
          {
            request: { method: 'GET', target: '${response[0].authParam(resource_metadata)}', agent: null },
            expected: {
              status: 200,
              body: {
                jsonHasMembers: ['resource', 'authorization_servers', 'jlws_storage_description', 'pop_session'],
                jsonContains: {
                  pop_session: {
                    algs: ['hmac-sha256'],
                    channel_bindings: ['none'],
                    profile: DPOP_SK_PROFILE,
                  },
                },
              },
            },
          },
        ],
        input: { state: baseState },
      },
      {
        id: 'pop-required-covers-dpop-sk',
        title: 'a PoP-required realm offering DPoP-SK signals it with the single dpop_bound_access_tokens_required member — no separate DPoP-SK required-member exists — and omits Bearer from its challenges',
        clauses: ['core#presentation-pop', 'core#authz-discovery'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-required-realm', 'pop-profile-dpop-sk'] },
        source: src('#establishment, #discovery', 'core#presentation-pop'),
        notes: 'Normative rule (core#presentation-pop, as corrected on the '
          + 'alignment pass): a DPoP-SK session is established FROM a '
          + 'DPoP-bound access token, so RFC 9728\'s registered '
          + 'dpop_bound_access_tokens_required: true governs DPoP-SK too; '
          + 'DPoP-SK availability is signalled by pop_session\'s presence.',
        exchanges: [
          {
            request: { method: 'GET', target: A, agent: null },
            expected: {
              status: 401,
              headers: { 'WWW-Authenticate': { excludesScheme: 'Bearer' } },
            },
          },
          {
            request: { method: 'GET', target: '${response[0].authParam(resource_metadata)}', agent: null },
            expected: {
              status: 200,
              body: {
                jsonHasMembers: ['pop_session'],
                jsonContains: { dpop_bound_access_tokens_required: true },
              },
            },
          },
        ],
        input: {
          state: { ...baseState, popProfiles: ['DPoP', 'DPoP-SK'], popRequiredRealms: [STORAGE] },
        },
      },
      // ------------------------------------------------------------------
      // Client-side negotiation (fail-closed)
      // ------------------------------------------------------------------
      {
        id: 'client-ignores-unknown-pop-profile',
        title: 'a client MUST ignore a pop_session member whose profile it does not recognise (no establishment attempt)',
        clauses: ['core#presentation-pop'],
        operation: 'evaluate-pop-session-offer',
        source: src('#discovery', 'core#presentation-pop'),
        input: {
          resourceMetadata: offeredPrm({ profile: 'https://profiles.example/other-pop/v9' }),
          client: skClient,
        },
        expected: { establish: false },
      },
      {
        id: 'client-fail-closed-unsupported-binding',
        title: 'a client MUST NOT attempt establishment unless the metadata offers an algorithm AND a channel-binding flavour it supports (exact-match, fail-closed)',
        clauses: ['core#presentation-pop'],
        operation: 'evaluate-pop-session-offer',
        source: src('#discovery, #downgrade', 'core#presentation-pop'),
        input: {
          resourceMetadata: offeredPrm({ channel_bindings: ['tls-exporter'] }),
          client: skClient,
        },
        expected: { establish: false },
      },
      // ------------------------------------------------------------------
      // Session establishment (cb=none)
      // ------------------------------------------------------------------
      {
        id: 'establish-ok-none-binding',
        title: 'a full-DPoP-verified establishment request with cb=none creates a session: 201, no-store, session_id/cb/alg/expires_in/key present, confirm absent, expires_in bounded by the token lifetime',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#establishment-request, #establishment-response, #kd-none, #lifetime', 'core#presentation-pop'),
        notes: 'The DPoP proof fixture binds htm=POST/htu=the establishment '
          + 'endpoint/iat=state.now/ath=hash of the presented token, under the '
          + 'key whose RFC 7638 thumbprint is the token\'s cnf.jkt. Under '
          + 'cb=none the key is server-generated CSPRNG output (dpop-sk-spec '
          + '#kd-none), so only the response SHAPE is pinned: key REQUIRED '
          + '(base64url), confirm MUST be absent, Cache-Control: no-store '
          + 'REQUIRED, and expires_in MUST NOT exceed the remaining token '
          + 'lifetime (the fixture token has 270 s left at state.now).',
        input: {
          state: baseState,
          request: {
            method: 'POST',
            target: SK_ENDPOINT,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
              DPoP: '${file:keyring/dpop-establish.jwt}',
              'Content-Type': 'application/json',
            },
            body: '{"cb":"none"}',
          },
        },
        expected: {
          status: 201,
          headers: { 'Cache-Control': { includesToken: 'no-store' } },
          body: {
            jsonHasMembers: ['session_id', 'cb', 'alg', 'expires_in', 'key'],
            jsonLacksMembers: ['confirm'],
            jsonContains: { alg: 'hmac-sha256', cb: 'none' },
            jsonMemberMatches: { expires_in: { atMost: 270 } },
          },
        },
      },
      {
        id: 'establish-requires-pop-bound-token',
        title: 'establishment presenting a token WITHOUT cnf (an unbound session would result) is refused — a session MUST NOT be created if any DPoP check fails',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#establishment-request', 'core#presentation-pop'),
        notes: 'The proof itself is valid (correct htm/htu/iat/ath) but the '
          + 'presented access token carries no cnf, so the RFC 9449 §4.3 '
          + 'binding check fails and, per RFC 9449 §7.1, the request under '
          + 'the DPoP scheme is rejected 401. dpop-sk-spec '
          + '#establishment-request: "A session MUST NOT be created if any '
          + 'check fails."',
        input: {
          state: baseState,
          request: {
            method: 'POST',
            target: SK_ENDPOINT,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-nocnf.jwt}',
              DPoP: '${file:keyring/dpop-establish-nocnf.jwt}',
              'Content-Type': 'application/json',
            },
            body: '{"cb":"none"}',
          },
        },
        expected: {
          status: 401,
          headers: { 'WWW-Authenticate': { authParams: { scheme: 'DPoP', params: {} } } },
        },
      },
      // ------------------------------------------------------------------
      // Per-request attestation
      // ------------------------------------------------------------------
      {
        id: 'attest-ok',
        title: 'a valid hmac-sha256 attestation under a live session, bound to the realm\'s single-aud token, is accepted (no DPoP header on the request)',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#attestation-request, #attestation-verification', 'core#presentation-pop'),
        notes: 'The signature covers the REQUIRED component set ("@method" '
          + '"@target-uri" "authorization") under the committed TEST-ONLY '
          + 'session key; the harness realises the session from '
          + 'keyring/session-valid.json. The attestation satisfies '
          + 'rs-validation step 5 for the cnf-bound token; inside a session '
          + 'the client MUST NOT send a DPoP proof header.',
        input: {
          state: sessionState,
          request: {
            method: 'GET',
            target: A,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
              ...skAttest({ targetUri: A, nonce: '1' }),
            },
          },
        },
        expected: { status: 200, body: { byteEquals: 'alpha' } },
      },
      {
        id: 'attest-bad-signature-standard-challenge',
        title: 'a tampered attestation draws 401 with the STANDARD DPoP challenge — no DPoP-SK-specific error code, and never bearer processing',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#attestation-verification (step 6, failure signalling E)', 'core#presentation-pop'),
        notes: 'Fails verification step 6 (HMAC mismatch). Servers MUST NOT '
          + 'emit any DPoP-SK-specific error code; the generic DPoP challenge '
          + 'keeps the failure path identical to plain DPoP.',
        input: {
          state: sessionState,
          request: {
            method: 'GET',
            target: A,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
              ...skAttest({ targetUri: A, nonce: '1', corrupt: true }),
            },
          },
        },
        expected: {
          status: 401,
          headers: { 'WWW-Authenticate': { authParams: { scheme: 'DPoP', params: {} } } },
        },
      },
      {
        id: 'attest-cross-target-transplant-rejected',
        title: 'an attestation captured for one target replayed against another is rejected: the server recomputes @target-uri from the ACTUAL request',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#attestation-verification (step 6; adversarial review A10)', 'core#presentation-pop'),
        notes: 'The Signature/Signature-Input headers were computed for '
          + '…/notes/a.txt; the request targets …/notes/b.txt. Verification '
          + 'derives @method/@target-uri server-side from the request itself '
          + '(strictly stronger than DPoP\'s client-asserted htm/htu), so the '
          + 'recomputed base differs and step 6 fails.',
        input: {
          state: sessionState,
          request: {
            method: 'GET',
            target: B,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
              ...skAttest({ targetUri: A, nonce: '1' }),
            },
          },
        },
        expected: {
          status: 401,
          headers: { 'WWW-Authenticate': { authParams: { scheme: 'DPoP', params: {} } } },
        },
      },
      {
        id: 'attest-token-substitution-rejected',
        title: 'a session cannot be ridden with a different token: a valid attestation presenting another (equally valid, cnf-bound) token fails the token-binding check',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#attestation-verification (step 4; adversarial review A9)', 'core#presentation-pop'),
        notes: 'The signature is computed correctly under the session key '
          + 'over the presented request (including its Authorization value), '
          + 'but SHA-256 of the presented token differs from the session\'s '
          + 'token_hash — the ath-equivalent check (step 4) rejects before '
          + 'any window mutation.',
        input: {
          state: sessionState,
          request: {
            method: 'GET',
            target: A,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-other.jwt}',
              ...skAttest({ targetUri: A, nonce: '1', tokenName: 'at-sk-other.jwt' }),
            },
          },
        },
        expected: {
          status: 401,
          headers: { 'WWW-Authenticate': { authParams: { scheme: 'DPoP', params: {} } } },
        },
      },
      {
        id: 'attest-replay-rejected',
        title: 'replaying an already-accepted nonce inside the window is rejected (duplicate bit in the RFC 4303 receive window)',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#anti-replay', 'core#presentation-pop'),
        notes: 'Two byte-identical attested requests: the first verifies and '
          + 'marks nonce 1; the second is a duplicate and MUST be rejected.',
        exchanges: [
          {
            request: {
              method: 'GET',
              target: A,
              headers: {
                Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
                ...skAttest({ targetUri: A, nonce: '1' }),
              },
            },
            expected: { status: 200 },
          },
          {
            request: {
              method: 'GET',
              target: A,
              headers: {
                Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
                ...skAttest({ targetUri: A, nonce: '1' }),
              },
            },
            expected: {
              status: 401,
              headers: { 'WWW-Authenticate': { authParams: { scheme: 'DPoP', params: {} } } },
            },
          },
        ],
        input: { state: sessionState },
      },
      {
        id: 'attest-forged-cannot-burn-counter',
        title: 'verify-then-mark is normative: a forged request can neither burn a counter value nor advance the window — the same nonce then verifies',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#anti-replay ("the receive window is updated only if the integrity verification succeeds")', 'core#presentation-pop'),
        notes: 'Exchange 0 presents nonce 2 with a corrupted HMAC and MUST '
          + 'NOT mutate the window (401). Exchange 1 presents the SAME nonce '
          + 'with a valid HMAC and MUST be accepted — a server that '
          + 'consulted-and-mutated the window on the forged request would '
          + 'wrongly reject it.',
        exchanges: [
          {
            request: {
              method: 'GET',
              target: A,
              headers: {
                Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
                ...skAttest({ targetUri: A, nonce: '2', corrupt: true }),
              },
            },
            expected: { status: 401 },
          },
          {
            request: {
              method: 'GET',
              target: A,
              headers: {
                Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
                ...skAttest({ targetUri: A, nonce: '2' }),
              },
            },
            expected: { status: 200, body: { byteEquals: 'alpha' } },
          },
        ],
        input: { state: sessionState },
      },
      {
        id: 'attest-expired-session-rechallenge',
        title: 'an attestation under an expired session draws the standard challenge — the client re-establishes or falls back to per-request DPoP',
        clauses: ['core#presentation-pop', 'core#rs-validation'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#attestation-verification (step 2), #lifetime', 'core#presentation-pop'),
        notes: 'keyring/session-expired.json expired at 11:59:00Z, before '
          + 'state.now. Session lookup (step 2) misses → challenge (E). Both '
          + 'the session expiry and the token expiry are enforced on every '
          + 'request.',
        input: {
          state: { ...baseState, popSkSessions: ['keyring/session-expired.json'] },
          request: {
            method: 'GET',
            target: A,
            headers: {
              Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}',
              ...skAttest({ targetUri: A, nonce: '1', sessionId: SK_EXPIRED_SESSION_ID }),
            },
          },
        },
        expected: {
          status: 401,
          headers: { 'WWW-Authenticate': { authParams: { scheme: 'DPoP', params: {} } } },
        },
      },
      {
        id: 'attest-stripped-signature-no-bearer-fallback',
        title: 'the Bearer baseline is not weakened: stripping the attestation leaves a cnf-bound token with no proof of possession at all, which is refused',
        clauses: ['core#rs-validation', 'core#presentation-pop'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop-sk'] },
        source: src('#downgrade (rule 1)', 'core#rs-validation'),
        notes: 'core#rs-validation step 5: a cnf-bound token MUST NOT be '
          + 'accepted bare. dpop-sk-spec #downgrade rule 1: there is no '
          + 'bearer fallback under any failure mode — removing '
          + 'Signature/Signature-Input yields a request with no PoP, which is '
          + 'rejected. Adopting DPoP-SK therefore cannot weaken the realm\'s '
          + 'baseline.',
        input: {
          state: sessionState,
          request: {
            method: 'GET',
            target: A,
            headers: { Authorization: 'DPoP ${file:keyring/at-sk-bound.jwt}' },
          },
        },
        expected: {
          status: 401,
          headers: { 'WWW-Authenticate': { present: true } },
        },
      },
    ],
  };
}
