// AUTHORED-BY Claude Fable 5
// Suite: auth — the authorization chain: RFC 9728 challenge discovery, the
// client realm-containment rule, RFC 8693 token exchange, RFC 9068 at+jwt
// validation by the storage server (signed Ed25519/EdDSA fixtures in
// keyring/), Bearer-baseline vs negotiated PoP presentation, RFC 9396
// authorization_details narrowing, and the WebAuthn authentication suite's
// composition surface (assertion-bundle decode, RFC 8414 suite
// advertisement, DPoP-bound-only issuance) (core#authz-discovery,
// #token-exchange, #access-token, #presentation, #rs-validation,
// #client-rules, #rar, #credential-model, #suite-webauthn).

export default function auth(ctx) {
  const {
    STORAGE, CORE, ALICE, AS_ISSUER, ROGUE_ISSUER, NOW, authKeyring,
    SPEC_SOURCE, WEBAUTHN_REAUTH_SOURCE, WEBAUTHN_TOKEN_TYPE,
    WEBAUTHN_CREDENTIAL_ID, webauthnBundles,
  } = ctx;
  const NOTES = `${STORAGE}notes/`;
  const A = `${NOTES}a.txt`;

  const protectedState = {
    storageRoot: STORAGE,
    resources: {
      [STORAGE]: { type: 'Container' },
      [NOTES]: { type: 'Container' },
      [A]: { type: 'DataResource', mediaType: 'text/plain', content: 'alpha' },
    },
    trustedIssuers: [AS_ISSUER],
    issuerJwks: { [AS_ISSUER]: 'keyring/as.jwks.json' },
    now: NOW,
  };

  const tokenInput = (token, over = {}) => ({
    token: `keyring/${token}`,
    issuerJwks: {
      [AS_ISSUER]: 'keyring/as.jwks.json',
      [ROGUE_ISSUER]: 'keyring/rogue-as.jwks.json',
    },
    trustedIssuers: [AS_ISSUER],
    targetResource: A,
    now: NOW,
    maxClockSkewSeconds: 60,
    ...over,
  });

  const exchangeBase = {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: '«a valid authentication credential accepted by the harness AS»',
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  };

  return {
    suite: 'auth',
    spec: CORE,
    description:
      'The authorization chain end to end: 401 challenges carrying RFC 9728 '
      + 'resource_metadata + realm (no error parameter without presented '
      + 'credentials), client-side realm containment verification, RFC 8693 '
      + 'token exchange with the REQUIRED absolute-URI resource parameter, '
      + 'single-audience RFC 9068 at+jwt validation (14 signed fixtures), the '
      + 'Bearer-baseline / negotiated-PoP presentation rules, narrowing-only '
      + 'RFC 9396 authorization_details enforcement, and the WebAuthn '
      + 'suite\'s composition surface (fail-closed assertion-bundle decode, '
      + 'RFC 8414 suite advertisement, DPoP-bound-only issuance).',
    keyring: authKeyring,
    cases: [
      // ------------------------------------------------------------------
      // Challenges (RFC 9728 discovery surface)
      // ------------------------------------------------------------------
      {
        id: 'challenge-401-shape',
        title: 'a credential-less request draws 401 with resource_metadata + absolute-URI realm and NO error parameter',
        clauses: ['core#authz-discovery'],
        operation: 'http-exchange',
        input: {
          state: protectedState,
          request: { method: 'GET', target: A, agent: null },
        },
        expected: {
          status: 401,
          headers: {
            'WWW-Authenticate': {
              authParams: {
                scheme: 'Bearer',
                params: {
                  realm: { present: true, absoluteUri: true },
                  resource_metadata: { present: true, absoluteUri: true },
                  error: { absent: true },
                },
              },
            },
          },
        },
      },
      {
        id: 'challenge-rejected-token-error',
        title: 'a request presenting a rejected access token draws 401 with error="invalid_token"',
        clauses: ['core#authz-discovery', 'core#rs-validation'],
        operation: 'http-exchange',
        input: {
          state: protectedState,
          request: {
            method: 'GET',
            target: A,
            headers: { Authorization: 'Bearer this-is-not-a-valid-token' },
          },
        },
        expected: {
          status: 401,
          headers: {
            'WWW-Authenticate': {
              authParams: {
                scheme: 'Bearer',
                params: { error: { equals: 'invalid_token' } },
              },
            },
          },
        },
      },
      {
        id: 'bearer-accepted-baseline',
        title: 'a JLWS server MUST accept Bearer presentation of a valid audience-restricted at+jwt (the PoP-off baseline)',
        clauses: ['core#presentation-bearer', 'core#rs-validation'],
        operation: 'http-exchange',
        notes: 'Full-stack: the fixture token is time-pinned; the harness evaluates '
          + 'token temporal claims against state.now, not the wall clock.',
        input: {
          state: protectedState,
          request: {
            method: 'GET',
            target: A,
            headers: { Authorization: 'Bearer ${file:keyring/at-valid.jwt}' },
          },
        },
        expected: { status: 200, body: { byteEquals: 'alpha' } },
      },
      {
        id: 'pop-required-realm-rejects-bearer',
        title: 'a PoP-required realm rejects bare Bearer presentation, omits the Bearer scheme from its challenges, and sets dpop_bound_access_tokens_required',
        clauses: ['core#presentation-pop', 'core#presentation-bearer'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-required-realm'] },
        notes: 'The PoP-required signal is concrete on both discovery surfaces: the '
          + "realm's resource metadata MUST set dpop_bound_access_tokens_required: "
          + 'true (RFC 9728 §2) and its 401 challenges MUST list only the required '
          + "profile's scheme(s), omitting Bearer.",
        exchanges: [
          {
            request: {
              method: 'GET',
              target: A,
              headers: { Authorization: 'Bearer ${file:keyring/at-valid.jwt}' },
            },
            expected: {
              status: 401,
              headers: { 'WWW-Authenticate': { excludesScheme: 'Bearer' } },
            },
          },
          {
            request: { method: 'GET', target: '${response[0].authParam(resource_metadata)}', agent: null },
            expected: {
              status: 200,
              body: { jsonContains: { dpop_bound_access_tokens_required: true } },
            },
          },
        ],
        input: {
          state: { ...protectedState, popRequiredRealms: [STORAGE], popProfiles: ['DPoP'] },
        },
      },
      {
        id: 'pop-advertised-in-resource-metadata',
        title: 'an offered DPoP profile is advertised through RFC 9728 resource metadata (dpop_signing_alg_values_supported)',
        clauses: ['core#presentation-pop', 'core#authz-discovery'],
        operation: 'http-exchange',
        preconditions: { features: ['pop-profile-dpop'] },
        exchanges: [
          {
            request: { method: 'GET', target: A, agent: null },
            expected: { status: 401 },
          },
          {
            request: { method: 'GET', target: '${response[0].authParam(resource_metadata)}', agent: null },
            expected: {
              status: 200,
              body: { jsonHasMembers: ['dpop_signing_alg_values_supported'] },
            },
          },
        ],
        input: {
          state: { ...protectedState, popProfiles: ['DPoP'] },
        },
      },
      // ------------------------------------------------------------------
      // Client rule: realm containment (core#authz-discovery, #client-rules)
      // ------------------------------------------------------------------
      {
        id: 'realm-contains-request',
        title: 'realm containment: the originating request URI inside the presented realm verifies',
        clauses: ['core#authz-discovery', 'core#client-rules'],
        operation: 'verify-realm-containment',
        input: { requestUri: A, realm: STORAGE },
        expected: { ok: true },
      },
      {
        id: 'realm-disjoint-rejected',
        title: 'realm containment: a realm not containing the originating request URI is rejected (colluding-AS probe defence)',
        clauses: ['core#client-rules', 'core#sec-collusion'],
        operation: 'verify-realm-containment',
        input: { requestUri: A, realm: 'https://other-storage.example/carol/' },
        expected: { ok: false },
      },
      {
        id: 'realm-segment-prefix-trap-rejected',
        title: 'realm containment is logical (path-segment) containment, not naive string prefixing',
        clauses: ['core#client-rules', 'core#authz-discovery'],
        operation: 'verify-realm-containment',
        notes: 'Logical containment is normatively defined (rs-validation) over '
          + 'parsed, normalized URIs: same origin plus complete /-delimited '
          + 'path-segment-boundary ancestry — never raw string prefixing. '
          + '"https://storage.example/alice" is a string prefix of '
          + '"https://storage.example/aliceevil/…" but does not logically contain it.',
        input: {
          requestUri: 'https://storage.example/aliceevil/notes/a.txt',
          realm: 'https://storage.example/alice',
        },
        expected: { ok: false },
      },
      // ------------------------------------------------------------------
      // Token exchange (RFC 8693, core#token-exchange, #access-token)
      // ------------------------------------------------------------------
      {
        id: 'exchange-issues-single-audience-at-jwt',
        title: 'a valid exchange issues an at+jwt whose aud is exactly the resource value, with the REQUIRED claims',
        clauses: ['core#token-exchange', 'core#access-token'],
        operation: 'evaluate-token-exchange',
        input: {
          request: { ...exchangeBase, resource: STORAGE },
          trustedStorages: [STORAGE],
          now: NOW,
        },
        expected: {
          issued: true,
          tokenClaims: {
            aud: [STORAGE],
            requiredMembers: ['sub', 'iss', 'client_id', 'aud', 'exp', 'iat', 'jti'],
          },
        },
      },
      {
        id: 'exchange-lifetime-recommended',
        title: 'issued access tokens have lifetimes of 300 seconds or less (RECOMMENDED)',
        clauses: ['core#access-token'],
        level: 'SHOULD',
        operation: 'evaluate-token-exchange',
        input: {
          request: { ...exchangeBase, resource: STORAGE },
          trustedStorages: [STORAGE],
          now: NOW,
        },
        expected: {
          issued: true,
          tokenClaims: { lifetimeAtMostSeconds: 300 },
        },
      },
      {
        id: 'exchange-missing-resource-rejected',
        title: 'an exchange without the REQUIRED resource parameter is rejected',
        clauses: ['core#token-exchange'],
        operation: 'evaluate-token-exchange',
        input: {
          request: { ...exchangeBase },
          trustedStorages: [STORAGE],
          now: NOW,
        },
        expected: { issued: false, error: 'invalid_request' },
      },
      {
        id: 'exchange-relative-resource-rejected',
        title: 'an exchange whose resource parameter is not an absolute URI is rejected',
        clauses: ['core#token-exchange'],
        operation: 'evaluate-token-exchange',
        input: {
          request: { ...exchangeBase, resource: '/alice/' },
          trustedStorages: [STORAGE],
          now: NOW,
        },
        expected: { issued: false, errorOneOf: ['invalid_request', 'invalid_target'] },
      },
      {
        id: 'exchange-untrusted-storage-rejected',
        title: 'an exchange whose resource identifies an unknown or untrusted storage is rejected (invalid_target)',
        clauses: ['core#token-exchange'],
        operation: 'evaluate-token-exchange',
        notes: 'Error code per RFC 8693 §2.2.2 (invalid_target), within the RFC 6749 '
          + '§5.2 error frame the spec mandates.',
        input: {
          request: { ...exchangeBase, resource: 'https://unknown-storage.example/mallory/' },
          trustedStorages: [STORAGE],
          now: NOW,
        },
        expected: { issued: false, error: 'invalid_target' },
      },
      // ------------------------------------------------------------------
      // Access-token validation by the storage server (core#rs-validation)
      // ------------------------------------------------------------------
      {
        id: 'token-valid-accepted',
        title: 'a well-formed, in-lifetime, single-audience at+jwt from a trusted issuer validates; the agent is the sub claim',
        clauses: ['core#rs-validation', 'core#access-token'],
        operation: 'validate-access-token',
        input: tokenInput('at-valid.jwt'),
        expected: { accept: true, agent: ALICE },
      },
      {
        id: 'token-aud-prefix-containment',
        title: 'an aud of the storage root logically contains a deeper target resource (path-aligned URI-prefix containment)',
        clauses: ['core#rs-validation', 'core#path-alignment'],
        operation: 'validate-access-token',
        input: tokenInput('at-valid.jwt', { targetResource: `${NOTES}deep/nested/file.txt` }),
        expected: { accept: true, agent: ALICE },
      },
      {
        id: 'token-expired-rejected',
        title: 'an expired token is rejected',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        input: tokenInput('at-expired.jwt'),
        expected: { accept: false, errorCode: 'TOKEN_EXPIRED' },
      },
      {
        id: 'token-nbf-future-rejected',
        title: 'a token whose nbf has not passed is rejected',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        input: tokenInput('at-nbf-future.jwt'),
        expected: { accept: false, errorCode: 'TOKEN_NOT_YET_VALID' },
      },
      {
        id: 'token-iat-future-rejected',
        title: 'a token issued in the future (iat beyond clock skew) is rejected',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        input: tokenInput('at-iat-future.jwt'),
        expected: { accept: false, errorCode: 'IAT_IN_FUTURE' },
      },
      {
        id: 'token-exp-too-far-rejected',
        title: 'a token with exp more than one hour ahead MUST be rejected',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        input: tokenInput('at-exp-too-far.jwt'),
        expected: { accept: false, errorCode: 'EXP_TOO_FAR' },
      },
      {
        id: 'token-multi-audience-rejected',
        title: 'aud MUST contain exactly one value: a multi-audience access token is rejected',
        clauses: ['core#rs-validation', 'core#access-token'],
        operation: 'validate-access-token',
        input: tokenInput('at-multi-aud.jwt'),
        expected: { accept: false, errorCode: 'AUDIENCE_MULTIPLE' },
      },
      {
        id: 'token-aud-not-containing-rejected',
        title: 'a token whose aud does not contain the target resource is rejected (tenant-replay isolation)',
        clauses: ['core#rs-validation', 'core#sec-tokens'],
        operation: 'validate-access-token',
        input: tokenInput('at-aud-other-storage.jwt'),
        expected: { accept: false, errorCode: 'AUDIENCE_MISMATCH' },
      },
      {
        id: 'token-aud-segment-prefix-trap-rejected',
        title: 'audience containment is logical (path-segment) containment: a string-prefix aud does not contain a sibling storage',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        notes: 'Normative rule (rs-validation): logical containment is evaluated '
          + 'over parsed, normalized URIs (RFC 3986 §6) — same origin, and the '
          + 'audience path equal to or an ancestor of the target path on complete '
          + '/-delimited segment boundaries; a raw prefix comparison would '
          + 'authorize sibling resources. aud "https://storage.example/alice" is a '
          + 'string prefix of "https://storage.example/aliceevil/x.txt" but does '
          + 'not logically contain it.',
        input: tokenInput('at-aud-segment-trap.jwt', {
          targetResource: 'https://storage.example/aliceevil/x.txt',
        }),
        expected: { accept: false, errorCode: 'AUDIENCE_MISMATCH' },
      },
      {
        id: 'token-alg-none-rejected',
        title: 'alg "none" is rejected',
        clauses: ['core#rs-validation', 'core#credential-model'],
        operation: 'validate-access-token',
        input: tokenInput('at-alg-none.jwt'),
        expected: { accept: false, errorCode: 'ALG_REJECTED' },
      },
      {
        id: 'token-tampered-rejected',
        title: 'a token whose payload was modified after signing fails signature verification',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        input: tokenInput('at-tampered.jwt'),
        expected: { accept: false, errorCode: 'SIGNATURE_INVALID' },
      },
      {
        id: 'token-untrusted-issuer-rejected',
        title: 'a validly signed token from an issuer outside the explicit trusted-issuer allowlist is rejected',
        clauses: ['core#rs-validation', 'core#sec-tokens'],
        operation: 'validate-access-token',
        input: tokenInput('at-untrusted-issuer.jwt'),
        expected: { accept: false, errorCode: 'ISSUER_UNTRUSTED' },
      },
      {
        id: 'token-wrong-typ-rejected',
        title: 'a token without the at+jwt typ header is rejected (RFC 9068 conformance)',
        clauses: ['core#access-token'],
        operation: 'validate-access-token',
        notes: 'RFC 9068 §4 requires resource servers to verify typ; the spec makes '
          + 'RFC 9068 conformance a MUST for the issued token.',
        input: tokenInput('at-wrong-typ.jwt'),
        expected: { accept: false, errorCode: 'TYP_MISMATCH' },
      },
      {
        id: 'token-pop-bound-presented-bare-rejected',
        title: 'a PoP-bound token (cnf present) presented without its proof MUST NOT be accepted bare',
        clauses: ['core#rs-validation'],
        operation: 'validate-access-token',
        input: tokenInput('at-cnf-bound.jwt'),
        expected: { accept: false, errorCode: 'POP_PROOF_MISSING' },
      },
      // ------------------------------------------------------------------
      // The WebAuthn authentication suite (core#suite-webauthn,
      // #credential-model) — composition cases per
      // docs/alignment/webauthn-reauth.md. The suite adopts the
      // [WEBAUTHN-REAUTH] wire contract verbatim: the assertion bundle is
      // base64url(UTF-8 JSON {version: 1, credential}) presented as the
      // RFC 8693 subject_token under its minted token-type URI. The OP-side
      // cryptographic verification matrix (origin binding, signCount,
      // challenge replay) is AS behaviour and out of vector scope (GAPS.md).
      // ------------------------------------------------------------------
      {
        id: 'webauthn-bundle-decode-ok',
        title: 'a well-formed WebAuthn assertion bundle decodes: version 1 envelope, public-key credential, canonical base64url binary fields',
        clauses: ['core#suite-webauthn', 'core#credential-model'],
        operation: 'decode-webauthn-assertion-bundle',
        preconditions: { features: ['suite-webauthn'] },
        source: `${SPEC_SOURCE} core#suite-webauthn + ${WEBAUTHN_REAUTH_SOURCE} src/protocol/codec.ts decodeAssertionBundle (spec-derived; the wire contract is the normative shape)`,
        notes: 'Structural decode only — the fail-closed boundary an AS '
          + 'crosses before any cryptography. The fixture is a deterministic '
          + 'AuthenticationResponseJSON (no live authenticator); its '
          + 'signature bytes are arbitrary because the decode surface does '
          + 'not verify them.',
        input: { token: 'bundle.b64u' },
        files: { 'bundle.b64u': webauthnBundles['bundle.b64u'] },
        expected: { ok: true, version: 1, credentialId: WEBAUTHN_CREDENTIAL_ID },
      },
      {
        id: 'webauthn-bundle-noncanonical-b64url-rejected',
        title: 'a bundle whose binary field carries alphabet-valid but NON-CANONICAL base64url is rejected (fail-closed decode)',
        clauses: ['core#suite-webauthn', 'core#credential-model'],
        operation: 'decode-webauthn-assertion-bundle',
        preconditions: { features: ['suite-webauthn'] },
        source: `${SPEC_SOURCE} core#suite-webauthn + ${WEBAUTHN_REAUTH_SOURCE} src/protocol/codec.ts isBase64url (spec-derived; the wire contract is the normative shape)`,
        notes: 'The credential\'s signature field is "AB": inside the '
          + 'base64url alphabet, but no encoder emits it (the final sextet\'s '
          + 'unused bits are non-zero — it aliases the bytes of "AA" as a '
          + 'distinct string, a malleability hazard for string-keyed '
          + 'lookups). The wire contract requires canonical unpadded '
          + 'base64url and rejects via a decode→re-encode round-trip; the AS '
          + 'maps the failure to the RFC 6749 §5.2 invalid_request error at '
          + 'the exchange.',
        input: { token: 'bundle-noncanonical.b64u' },
        files: { 'bundle-noncanonical.b64u': webauthnBundles['bundle-noncanonical.b64u'] },
        expected: { ok: false, errorCode: 'MALFORMED_BUNDLE' },
      },
      {
        id: 'webauthn-suite-advertised',
        title: 'an authorization server offering the WebAuthn suite SHOULD list its token-type URI in RFC 8414 subject_token_types_supported',
        clauses: ['core#credential-model', 'core#authz-discovery'],
        level: 'SHOULD',
        operation: 'validate-as-metadata',
        preconditions: { features: ['suite-webauthn'] },
        source: `${SPEC_SOURCE} core#credential-model + ${WEBAUTHN_REAUTH_SOURCE} src/protocol/constants.ts WEBAUTHN_ASSERTION_TOKEN_TYPE (spec-derived; no reference implementation yet)`,
        notes: 'SHOULD rather than MUST for the privacy reason the spec '
          + 'records (suite enumeration is a fingerprinting surface — '
          + 'core#credential-model). The token-type URI is the one minted by '
          + 'the wire contract.',
        input: {
          document: {
            issuer: AS_ISSUER,
            token_endpoint: `${AS_ISSUER}/token`,
            grant_types_supported: ['urn:ietf:params:oauth:grant-type:token-exchange'],
            subject_token_types_supported: [
              'urn:ietf:params:oauth:token-type:id_token',
              WEBAUTHN_TOKEN_TYPE,
            ],
          },
          offeredSuiteTokenTypes: [WEBAUTHN_TOKEN_TYPE],
        },
        expected: { ok: true },
      },
      {
        id: 'webauthn-suite-omitted-flagged',
        title: 'metadata for an AS offering the WebAuthn suite that omits its token-type URI fails the advertisement check (advisory)',
        clauses: ['core#credential-model', 'core#authz-discovery'],
        level: 'SHOULD',
        operation: 'validate-as-metadata',
        preconditions: { features: ['suite-webauthn'] },
        source: `${SPEC_SOURCE} core#credential-model + ${WEBAUTHN_REAUTH_SOURCE} src/protocol/constants.ts WEBAUTHN_ASSERTION_TOKEN_TYPE (spec-derived; no reference implementation yet)`,
        input: {
          document: {
            issuer: AS_ISSUER,
            token_endpoint: `${AS_ISSUER}/token`,
            grant_types_supported: ['urn:ietf:params:oauth:grant-type:token-exchange'],
            subject_token_types_supported: ['urn:ietf:params:oauth:token-type:id_token'],
          },
          offeredSuiteTokenTypes: [WEBAUTHN_TOKEN_TYPE],
        },
        expected: { errorCode: 'SUITE_NOT_ADVERTISED', ok: false },
      },
      {
        id: 'webauthn-issued-token-never-bare',
        title: 'a token issued via the WebAuthn suite is always DPoP-bound (cnf present) and therefore never accepted bare — the Bearer baseline is not weakened by the suite',
        clauses: ['core#rs-validation', 'core#suite-webauthn'],
        operation: 'validate-access-token',
        source: `${SPEC_SOURCE} core#rs-validation + ${WEBAUTHN_REAUTH_SOURCE} #token-exchange ("there is no Bearer variant") (spec-derived; no reference implementation yet)`,
        notes: 'Composition consequence (docs/alignment/webauthn-reauth.md): '
          + 'the [WEBAUTHN-REAUTH] exchange issues only DPoP-bound tokens, so '
          + 'every token this suite produces carries cnf.jkt, and '
          + 'rs-validation step 5 already refuses it bare — the storage '
          + 'server needs no WebAuthn awareness. The fixture is a valid '
          + 'at+jwt whose cnf.jkt is the committed sk-client key thumbprint.',
        input: tokenInput('at-webauthn-cnf.jwt'),
        expected: { accept: false, errorCode: 'POP_PROOF_MISSING' },
      },
      // ------------------------------------------------------------------
      // authorization_details narrowing (core#rar)
      // ------------------------------------------------------------------
      {
        id: 'rar-cannot-widen',
        title: 'an authorization_details claim MUST NOT widen access beyond the storage server policy',
        clauses: ['core#rar'],
        operation: 'enforce-authorization-details',
        input: {
          serverPolicyDecision: 'deny',
          authorizationDetails: [{
            type: 'https://w3id.org/jeswr/lws#AccessRequest',
            locations: [A],
            actions: ['modify'],
          }],
          request: { target: A, action: 'modify' },
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'rar-narrows-locations',
        title: 'an approved authorization_details claim is enforced in addition to policy: a target outside its locations is denied',
        clauses: ['core#rar'],
        operation: 'enforce-authorization-details',
        input: {
          serverPolicyDecision: 'permit',
          authorizationDetails: [{
            type: 'https://w3id.org/jeswr/lws#AccessRequest',
            locations: [`${NOTES}other.txt`],
            actions: ['read'],
          }],
          request: { target: A, action: 'read' },
        },
        expected: { decision: 'deny' },
      },
      {
        id: 'rar-covering-claim-permits',
        title: 'when the server policy permits and the claim covers the target and action, the request is permitted',
        clauses: ['core#rar'],
        operation: 'enforce-authorization-details',
        input: {
          serverPolicyDecision: 'permit',
          authorizationDetails: [{
            type: 'https://w3id.org/jeswr/lws#AccessRequest',
            locations: [NOTES],
            actions: ['read'],
          }],
          request: { target: A, action: 'read' },
        },
        expected: { decision: 'permit' },
      },
      {
        id: 'rar-absent-policy-alone',
        title: 'without an authorization_details claim the storage-server policy alone decides',
        clauses: ['core#rar'],
        operation: 'enforce-authorization-details',
        input: {
          serverPolicyDecision: 'permit',
          authorizationDetails: null,
          request: { target: A, action: 'read' },
        },
        expected: { decision: 'permit' },
      },
    ],
  };
}
