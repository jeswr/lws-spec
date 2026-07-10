<!-- AUTHORED-BY Claude Fable 5 -->

# JLWS conformance test vectors

**Language-neutral conformance test vectors for the JLWS clean-slate Linked Web Storage
specs** — the golden (input, operation, expected-outcome) cases an **independent
implementation** must reproduce to claim conformance to the two documents in this
repository:

| Spec | Conformance URI | Document |
|---|---|---|
| JLWS Core Protocol | `https://w3id.org/jeswr/lws/protocol/core/1.0` | [`../index.html`](../index.html) |
| JLWS RDF Content Transformation Profile | `https://w3id.org/jeswr/lws/transform/rdf-1` | [`../rdf-transform.html`](../rdf-transform.html) |

The format follows the
[`agentic-solid-conformance`](https://github.com/jeswr/agentic-solid-conformance)
methodology: self-describing JSON case files (with Turtle / JSON-LD / N-Quads / JWS
fixtures), each pinning **specific normative clauses** by spec section id, grouped into
per-area suites with manifests and a clause index, plus a [`GAPS.md`](./GAPS.md) honestly
cataloguing the normative statements that are **not** vectorable and why. Like that suite,
these vectors have **no dependency on any implementation code**: any implementation, in any
language, can bind the abstract operations below and compare against `expected`.

This suite shares the parent repository's status: a **personal, experimental artifact**
(published as a clearly-framed public experiment on the maintainer's authorisation)
awaiting its editor's full review. It names no external party and requests nothing of
anyone.

## Provenance of verdicts — spec-derived, not implementation-extracted

`agentic-solid-conformance` *extracted* its verdicts by executing pinned reference
implementations. **No reference server implementation of JLWS exists yet**, so the expected
outcomes here are **derived directly from the normative text** of the two specs at commit
`0f6b80f` — the commit the suite was last **reconciled** against; whenever the spec's
normative text changes, the pin is bumped and every affected vector re-derived in the same
change (each case's `source` field records the clause it was derived from; `notes`
records any interpretation applied where the spec leaves a code point open, e.g. the
RFC 8693 §2.2.2 `invalid_target` choice — the path-segment reading of "logically contains"
began as such a note and is now the spec's own normative rule). **One operation is the
exception**: every `evaluate-access` decision is REPRODUCED by executing the profile's
normative rule set [`semantics/access-decision.n3`](../semantics/access-decision.n3) under
EYE (`node test-suite/tools/oracle-access.mjs` — the definitional-implementation pattern);
those cases say so in `source`, and the oracle run is part of the repo gate, so the vectors
and the decision semantics cannot silently disagree. Cases pinning a
**composition surface** (the DPoP-SK profile, the WebAuthn suite's wire contract, the
a2a-rdf extension service) additionally cite the companion document + anchor in `source`
at a pinned commit — `clauses` itself only ever names `core#`/`rdf#` section ids.
That inversion is deliberate — these vectors are the **conformance target the first
implementation builds to** (the planned `solid-server-rs` `feat/lws` branch) — and it has a
consequence: until an implementation passes the suite, a vector may embody a
misreading of the spec. When the first implementation lands, disagreements between it and a
vector must be adjudicated against the spec text and the loser fixed; a consistency runner
pinned to that implementation should then be added alongside
[`tools/check.mjs`](./tools/check.mjs) (which today checks internal coherence:
manifests ↔ cases ↔ clause ids ↔ fixtures ↔ signatures).

## Suites

154 cases across 10 suites (see [`manifest.json`](./manifest.json) for the machine-readable
index):

| Suite | Cases | Spec | Surface |
|---|---|---|---|
| [`vectors/resources/`](./vectors/resources/) | 17 | core | byte-native CRUD, `PUT + If-None-Match: *` idempotent create, 428/412 discipline, Range, conditional GET, HEAD, required links, traversal, quota |
| [`vectors/containers/`](./vectors/containers/) | 14 | core | JSON-LD listings, identical-bytes conneg, `rel="up"`, POST/Slug create + namespace alias, `Depth: infinity` delete, membership atomicity, fail-closed listings, container ≠ data resource, move |
| [`vectors/metadata/`](./vectors/metadata/) | 7 | core | RFC 9264 linksets, merge-patch, Accept-Patch, 428/412, system-managed immutability, delete-with-resource |
| [`vectors/discovery/`](./vectors/discovery/) | 8 | core | storage-description validation (CID shape, `conformsTo`, self-service entry, unknown-capability tolerance), description link, RFC 9728 metadata document, extension-service consumption (a2a-rdf `AgentInteractionService`, fail-closed non-https endpoint) |
| [`vectors/auth/`](./vectors/auth/) | 36 | core | 401 challenge shape, realm containment, RFC 8693 exchange, RFC 9068 single-audience at+jwt validation (14 signed fixtures), Bearer baseline / PoP opt-in, RFC 9396 narrowing, the WebAuthn suite's composition surface (fail-closed bundle decode, RFC 8414 advertisement, DPoP-bound-only issuance) |
| [`vectors/dpop-sk/`](./vectors/dpop-sk/) | 14 | core | the DPoP-SK PoP presentation profile over JLWS (cb=none flavour): `pop_session` PRM advertisement, the single `dpop_bound_access_tokens_required` member covering both PoP profiles, fail-closed client negotiation, establishment from a DPoP-bound token, RFC 9421 hmac-sha256 attestation accept/tamper/cross-target/token-substitution/replay/verify-then-mark/expiry/no-bearer-fallback |
| [`vectors/access-grants/`](./vectors/access-grants/) | 21 | core | strict-ODRL document validation, default-deny grant evaluation, action inclusion, typed targets, conjunctive + fail-closed constraints, public assignee, structural revocation composition — every `evaluate-access` decision reproduced by `semantics/access-decision.n3` |
| [`vectors/notifications/`](./vectors/notifications/) | 12 | core | subscription authorization, SSE/WebSocket binding shapes, content-free envelope, RFC 9421 webhook signature verification (5 signed fixtures) |
| [`vectors/rdf-transform/`](./vectors/rdf-transform/) | 21 | rdf-1 | capability consistency, advertised-pair conneg honoured, client fail-closed feature detection, `SparqlQueryService` gating, graph-isomorphic round-trips, no-inference, base resolution, remote-context decline (no fetch), authoritative bytes + per-representation ETags, `normalizes`, unparseable-source degradation, opt-in-OFF behaviour |
| [`vectors/errors/`](./vectors/errors/) | 4 | core | RFC 9457 problem details everywhere, 404-for-hidden, hidden ≡ missing, 403-for-partial-access |

## Vector schema

Each suite directory contains `manifest.json` (suite id, spec URI, `caseCount`, case list,
`clauseIndex` mapping every pinned clause to its cases), a `cases/<case-id>/` directory per
case, and — where the suite ships shared fixtures — a `keyring/` directory.

`cases/<case-id>/case.json`:

```jsonc
{
  "id": "auth/token-expired-rejected",          // unique within the repo
  "title": "an expired token is rejected",
  "spec": "https://w3id.org/jeswr/lws/protocol/core/1.0",
  "clauses": ["core#rs-validation"],            // pinned normative clauses (see below)
  "level": "MUST",                              // MUST | SHOULD | MAY
  "operation": "validate-access-token",         // an abstract operation (below)
  "preconditions": { … },                       // optional-feature gate (below)
  "input": { … },                               // operation-specific
  "expected": { … },                            // operation-specific
  "exchanges": [ … ],                           // http-exchange multi-request form
  "notes": "…",                                 // any interpretation applied
  "source": "lws-spec@0f6b80f core#rs-validation (spec-derived; …)"
}
```

- **Clause pins.** `core#<id>` names the section with HTML id `<id>` in `../index.html`;
  `rdf#<id>` the same in `../rdf-transform.html`. `tools/check.mjs` verifies every pin
  resolves.
- **Levels** (W3C practice): a conforming implementation MUST pass every applicable
  `MUST`-level case; `SHOULD`-level cases are advisory — a failure is reportable, not
  disqualifying.
- **Preconditions.** A case with `preconditions` applies only when the implementation
  provides the named optional feature (`capabilities`: registry capability types such as
  `RecursiveDelete`, `MoveResource`; `features`: harness-level toggles such as
  `pop-required-realm`, `pop-profile-dpop`, `pop-profile-dpop-sk`, `suite-webauthn`,
  `sse-subscription`, `websocket-subscription`, `normalizes`, `storage-quota`). Skipping
  such a case is conformant; implementing the feature but failing the case is not.
- **State realizability** (`http-exchange` only): if an implementation cannot realise a
  case's declared `state` (e.g. cannot enable a `ContentNegotiation` pair), the case is
  skipped and reported as unrealisable. `MUST` cases with realisable states must pass.

A **conforming implementation** of a spec MUST, for every applicable `MUST` case in that
spec's manifests, produce a result matching `expected` (field-by-field; an implementation
whose native error identifiers differ from the vector error codes must publish a **total
mapping** onto them and apply it consistently — the codes are a contract, the spelling is
not).

### File-reference convention

These input fields (and only these) name fixture files: `token`, `delivery`,
`storageDescription` (when its value is a string — as an inline object it is the document
itself), `bodyFile`, `isomorphicTo`, the entries of the `popSkSessions` array, the values
of the `issuerJwks` map, `source` when accompanied by `sourceMediaType`, and the
`${file:<path>}` placeholder. Paths resolve relative to the case directory, except paths
beginning `keyring/`, which resolve from the suite directory. Every other string is a
literal.

### Placeholders (http-exchange requests)

Server-minted values (ETags, Locations, linkset URIs, challenge parameters) cannot be
predicted by a vector, so later requests in an exchange sequence may reference earlier
responses:

| Placeholder | Meaning |
|---|---|
| `${response[i].header.<Name>}` | header `<Name>` of exchange *i*'s response |
| `${response[i].link(<rel>)}` | target of the first `Link` with relation `<rel>` in exchange *i*'s response |
| `${response[i].authParam(<name>)}` | the `<name>` auth-param of exchange *i*'s `WWW-Authenticate` challenge |
| `${file:<path>}` | the (trimmed) contents of a fixture file — used for `Authorization: Bearer ${file:…}` |

## Abstract operations

### 1. `http-exchange` — the server-side HTTP surface

```
http-exchange(state, request…) → response assertions [+ stateAfter]
```

The harness realises `state` on the implementation under test, plays the request(s), and
evaluates the assertions. Single-request cases use `input.state` + `input.request` with
top-level `expected`; multi-request cases use `input.state` + a top-level `exchanges`
array of `{request, expected}` (in order, same realised state throughout) with optional
top-level `expected.asserts` / `expected.stateAfter`.

**State** (declarative; the harness maps it onto the implementation):

- `storageRoot` — the storage under test;
- `resources` — map of URI → `{type: "Container"}` or `{type: "DataResource", mediaType,
  content | contentBase64, modified?}`;
- `access` — map of agent URI → (resource URI → array of granted abstract modes from
  `read | create | append | modify | delete`). Entries are explicit and per-resource (no
  inheritance is implied by the map). The storage controller is implicitly fully
  authorised. How the implementation realises the map (ODRL grants, internal policy) is
  its own affair — the `access-grants` suite tests the decision semantics separately;
- `capabilities` — advertised capability entries (registry type names, or full objects
  such as `ContentNegotiation` entries); `conformsTo` — advertised protocol URIs;
- `trustedIssuers`, `issuerJwks`, `now` — for full-stack token cases: the harness pins
  validation time to `state.now` (the signed fixtures are time-pinned around
  `2026-07-01T12:00:00Z`);
- `popRequiredRealms`, `popProfiles`, `notificationService`, `quotaRemainingBytes` — as
  named;
- `popSession` — the DPoP-SK offer the realm advertises (`endpoint`, `algs`,
  `channelBindings`, `profile`); `popSkSessions` — established DPoP-SK sessions to
  realise, as file references to session records (`session_id`, `key`, `tokenHash`, `cb`,
  `alg`, `expiresAt`; the receive window starts empty). An implementation that cannot
  inject an established session reports the case unrealisable (the state-realizability
  rule above).

**Request**: `{method, target, headers?, body? | bodyBase64?, agent?}`. `agent` is the
authenticated-agent abstraction: a URI (the harness authenticates the request as that
agent by whatever token machinery it uses), `null` for an unauthenticated request, or
omitted for the storage controller. Cases that test the token layer itself bypass the
abstraction and carry a literal `Authorization` header instead.

**Response assertions** (`expected` per exchange):

- `status` (int) | `statusOneOf` (array) | `statusClass` (`"4xx"`…) — exactly one is
  present, except under `anyOf`;
- `anyOf: [expectation, …]` — the response must satisfy at least one alternative;
- `headers` — map of header name → assertion object:
  `{present: true}`, `{absent: true}`, `{equals}`, `{notEquals}`, `{startsWith}`,
  `{absoluteUri: true}`, `{mediaType}` (Content-Type match ignoring parameters),
  `{includesToken}` / `{excludesToken}` (comma-list membership; an absent header satisfies
  `excludesToken`), `{includesLinkRel: {rel | relOneOf, target?}}` /
  `{includesLinkRelAll: […]}` (RFC 8288 Link parsing),
  `{authParams: {scheme, params: {name: assertion}}}` (WWW-Authenticate),
  `{excludesScheme}` (no WWW-Authenticate challenge with that scheme);
- `body` — `{byteEquals}` | `{byteEqualsBase64}` | `{empty: true}` | `{jsonIsObject: true}`
  | `{jsonContains}` (subset match: objects recursively by-member; each listed array
  element must subset-match some element of the actual array, order-insensitive) |
  `{jsonHasMembers: [names]}` | `{jsonLacksMembers: [names]}` (none of the named
  top-level members is present) | `{jsonMemberMatches: {member: assertion}}` (the
  assertion vocabulary plus `{atMost: n}` for numeric members) |
  `{jsonArrayExcludes: {path, subset}}` (no element of the array at `path` matches
  `subset`);
- `problem: {type}` — the response is `application/problem+json` and its `type` member
  equals the given URI (problem types live under
  `https://w3id.org/jeswr/lws/problems/`);
- `stateAfter: {exists: [uris], notExists: [uris], bytesUnchanged: [uris]}` — post-state
  probes (the harness checks via the implementation, e.g. controller GETs);
- top-level `asserts`: `{kind: "equal" | "differ", refs: […]}` over
  `response[i].header.<Name>`, `response[i].body`, `response[i].status`,
  `response[i].problem.type`.

### 2. `validate-access-token` — storage-server token validation (core#rs-validation)

```
validate-access-token(token, issuerJwks, trustedIssuers, targetResource, now,
                      maxClockSkewSeconds) → {accept, agent? | errorCode?}
```

`token` is a real compact JWS fixture (EdDSA/Ed25519 — the spec requires asymmetric
signatures but no particular algorithm; an implementation that does not support EdDSA maps
the *shape* of each case onto an algorithm it does support and must still produce every
verdict). Validation follows the spec's ordered checks. Error codes (closed set):
`SIGNATURE_INVALID`, `ALG_REJECTED`, `TYP_MISMATCH`, `ISSUER_UNTRUSTED`,
`AUDIENCE_MULTIPLE`, `AUDIENCE_MISMATCH`, `TOKEN_EXPIRED`, `TOKEN_NOT_YET_VALID`,
`IAT_IN_FUTURE`, `EXP_TOO_FAR`, `POP_PROOF_MISSING`.

### 3. `evaluate-token-exchange` — the AS token endpoint (core#token-exchange)

```
evaluate-token-exchange(request, trustedStorages, now)
    → {issued, tokenClaims? | error? | errorOneOf?}
```

The `subject_token` value is symbolic (`«a valid authentication credential…»`): suite
validation of authentication credentials is out of vector scope (GAPS.md); these cases pin
the handling of the `resource` parameter and the shape of the issued token
(`tokenClaims.aud` exact array, `requiredMembers`, `lifetimeAtMostSeconds`). Errors use
the RFC 6749 §5.2 / RFC 8693 §2.2.2 codes (`invalid_request`, `invalid_target`).

### 4. `verify-realm-containment` — the client rule (core#authz-discovery, #client-rules)

```
verify-realm-containment(requestUri, realm) → {ok}
```

"Logically contained" is path-segment containment, not string prefixing (see the trap
cases' notes).

### 5. `enforce-authorization-details` — RFC 9396 narrowing (core#rar)

```
enforce-authorization-details(serverPolicyDecision, authorizationDetails, request)
    → {decision}
```

The claim can only narrow: `permit` requires the server policy to permit AND (no claim, or
a claim entry of type `jlws:AccessRequest` covering the request's target within
`locations` — path-segment containment — and its action within `actions`).

### 6. `validate-access-document` — strict-ODRL documents (core#odrl-profile)

```
validate-access-document(document) → {ok, documentClass? | errorCode?}
```

Error codes: `PROFILE_MISSING`, `ACTION_NOT_SINGULAR`, `TARGET_NOT_SINGULAR`.
`documentClass` is `"request"` (odrl:Request) or `"grant"` (odrl:Offer).

### 7. `evaluate-access` — grant evaluation (core#odrl-profile), default deny

```
evaluate-access(grants, request) → {decision: "permit" | "deny"}
```

`request` is `{agent, action, target, context?}`; `context.purpose` / `context.dateTime`
feed the profile's constraints (all constraints conjunctive). Deny is the default: permit
requires some grant permission whose assignee matches (`foaf:Agent` matches any agent),
whose action includes the requested action (`odrl:modify` includes `jlws:create` /
`jlws:append`, never the reverse; an ununderstood action grants nothing), whose typed
target covers the request target (`DataResource` exactly; `Container` the container itself
and, only when `recursive`, descendants; `StorageResource` the storage), and whose
constraints are all satisfied (a constraint the layer cannot evaluate is unsatisfied).
This operation's DEFINITION is the executable rule set
[`semantics/access-decision.n3`](../semantics/access-decision.n3): permit ⟺ the rule set
derives at least one `ax:permittedBy` justification; the oracle
(`node test-suite/tools/oracle-access.mjs`, part of the repo gate) re-derives every one of
these vectors from it.

### 8. `validate-storage-description` — discovery documents (core#discovery-model, rdf#capability)

```
validate-storage-description(document) → {ok | errorCode}
```

Error codes: `CONFORMS_TO_MISSING`, `SERVICE_SELF_MISSING`, `CONFORMS_TO_PROFILE_MISSING`,
`CAPABILITY_MALFORMED`, `SERVICE_REQUIRES_PROFILE` (a service advertised without the
profile it is scoped to — e.g. `SparqlQueryService` without `rdf-1`). Unrecognised
capability/service types MUST be ignored, not rejected.

### 9. `validate-notification-envelope` — the envelope (core#notification-envelope)

```
validate-notification-envelope(envelope, subscriberMayLearnActor) → {ok | errorCode}
```

Error codes: `CONTENT_INCLUDED`, `PUBLISHED_MISSING`, `ACTOR_DISCLOSED`. The envelope
member naming follows the notifications Editor's Draft as adopted by the spec; the vectors
pin the *invariants* (content-free object, REQUIRED `published`, default-omitted `actor`),
not a frozen wire vocabulary (see GAPS.md).

### 10. `verify-webhook-signature` — RFC 9421 webhook deliveries (core#webhook-binding)

```
verify-webhook-signature(delivery, storageDescription, now) → {ok | errorCode}
```

`delivery` is a JSON file `{method, targetUri, headers, bodyFile}` capturing the HTTP POST
byte-exactly. Verification: parse `Signature-Input`; the covered components must include
the spec's required set (`@method`, `@scheme`/`@authority`/`@path` or `@target-uri`,
`content-type`, `content-digest`) else `COVERAGE_INSUFFICIENT`; resolve `keyid` into the
storage description's `verificationMethod` set else `KEY_UNRESOLVED`; verify the RFC 9421
signature base (Ed25519) else `SIGNATURE_INVALID`; verify the RFC 9530 `Content-Digest`
against the body bytes else `CONTENT_DIGEST_MISMATCH`.

### 11. `transform-representation` — the rdf-1 round-trip contract (rdf#round-trip)

```
transform-representation(source, sourceMediaType, targetMediaType, base,
                         allowlistedContexts?)
    → output in targetMediaType | {ok: false, errorCode}
```

The harness parses the implementation's output under `targetMediaType` and checks the
resulting RDF graph is **isomorphic** (RDF 1.1 §3.6 — equal up to blank-node relabelling)
to the graph of the case's `expected.isomorphicTo` N-Quads file. Decline outcomes use the
closed error codes `REMOTE_CONTEXT_DECLINED` (a compacted JSON-LD source declaring a
remote `@context` outside `allowlistedContexts` MUST be declined, never fetched) and
`UNPARSEABLE_SOURCE`.

### 12. `evaluate-pop-session-offer` — DPoP-SK client negotiation (core#presentation-pop)

```
evaluate-pop-session-offer(resourceMetadata, client) → {establish}
```

The client-side, fail-closed half of the DPoP-SK negotiation (the profile's *Discovery
and negotiation* section, composed through core#presentation-pop): given an RFC 9728
resource metadata document and the client's capabilities (`recognizedProfiles`, `algs`,
`channelBindings`), decide whether establishment may be attempted. `establish: false` is
mandatory when the `pop_session.profile` is unrecognised or no offered algorithm/binding
is supported (exact-match); `establish: true` is never *required* (a capable client MAY
still use plain DPoP or Bearer where accepted), so only refusals are vectored.

### 13. `discover-service` — consumer-side service discovery (core#discovery-model)

```
discover-service(document, serviceType) → {found, serviceEndpoint?, conformsTo?}
```

Selects a usable service entry of the given type (a registry term or an extension URI)
from a storage description. Fail-closed at the consumption boundary: an entry whose
`serviceEndpoint` is missing or not `https` (the core#ssrf scheme rule, applied before
any request) is not usable, and `found: false` is returned when no acceptable entry
exists — without any fetch.

### 14. `evaluate-transform-offer` — rdf-1 feature detection (rdf#capability, rdf#conformance)

```
evaluate-transform-offer(storageDescription, sourceMediaType, targetMediaType)
    → {available}
```

The RDF-aware-client rule: transformation-dependent behaviour (RDF conneg, RDF PATCH,
SPARQL query) may be relied on only when an advertised `ContentNegotiation` entry with
`profile` `…/transform/rdf-1` covers the pair AND `conformsTo` lists the profile URI. A
profile-less entry makes no rdf-1 claim (`available: false`).

### 15. `decode-webauthn-assertion-bundle` — the WebAuthn suite's wire decode (core#suite-webauthn)

```
decode-webauthn-assertion-bundle(token) → {ok, version?, credentialId? | errorCode}
```

The fail-closed structural decode of the RFC 8693 `subject_token` under the
[WEBAUTHN-REAUTH] wire contract (base64url of the UTF-8 JSON envelope
`{version: 1, credential}`), which core#suite-webauthn adopts verbatim: canonical
unpadded base64url on every binary field (impossible-length and non-zero-unused-bits
forms rejected), `type: "public-key"`, and the response members the verifier reads.
Error code (closed set): `MALFORMED_BUNDLE` — the AS surfaces it as an RFC 6749 §5.2
`invalid_request`. Cryptographic verification of the inner assertion is the
authorization server's job and out of vector scope (GAPS.md).

### 16. `validate-as-metadata` — suite advertisement (core#credential-model), advisory

```
validate-as-metadata(document, offeredSuiteTokenTypes) → {ok | errorCode}
```

Checks an RFC 8414 authorization-server metadata document advertises every offered
authentication suite's token-type URI in `subject_token_types_supported`. Error code:
`SUITE_NOT_ADVERTISED`. All cases are `SHOULD`-level (the spec deliberately keeps
advertisement a SHOULD for the privacy reason recorded in core#credential-model).

## Running the suite

The repo ships an executable runner for the server-side surface:
[`../test-suite/`](../test-suite/) plays the `http-exchange` vectors against a target server
URL and reports **per-normative-statement** verdicts keyed to the statement-companion IDs
(see its README for the honesty model and the committed CSS-baseline scoreboard). The
fifteen **pure decision operations** remain library-level seams: an implementation binds
them to its own entry points (most implementations will additionally bind `http-exchange`
to an in-process router for speed), iterates the manifests, and reports per-case
pass/fail/skip. Structural coherence of the committed vectors themselves is checked with:

```sh
node test-vectors/tools/check.mjs    # manifests, clause pins, fixtures, signatures
node test-vectors/tools/generate.mjs # regenerate everything from tools/suites/*.mjs
```

Never edit files under `vectors/` by hand — they are generator output; change
`tools/suites/*.mjs` and regenerate.

## Keyring — TEST KEYS ONLY

`tools/keys/*.TEST-ONLY.private.jwk.json` are **throwaway Ed25519 test keys committed
deliberately** so the suite regenerates byte-identically (Ed25519 signing is
deterministic), and `tools/keys/sk-session.TEST-ONLY.key.json` is likewise a throwaway
**symmetric** 32-byte HMAC key: the DPoP-SK session key of the `dpop-sk` suite's
attestation fixtures, which by the profile's nature both sides hold (it also ships in the
suite's session records, `vectors/dpop-sk/keyring/session-*.json`). They protect nothing,
exist nowhere else, and MUST NOT be used for anything but generating these fixtures. The
public halves of the asymmetric keys ship in the suite keyrings
(`vectors/auth/keyring/*.jwks.json`, `vectors/dpop-sk/keyring/as.jwks.json`,
`vectors/notifications/keyring/storage-description.json`). All signed fixtures are pinned
to the evaluation instant `2026-07-01T12:00:00Z`; harnesses evaluate temporal claims
against the case's `now`, never the wall clock.

## What this suite is not

Passing it is **necessary but not sufficient** for conformance: [`GAPS.md`](./GAPS.md)
inventories the normative statements — SSRF discipline, TLS, atomicity, live-revocation
timing, streaming bindings, suite-specific credential validation, and more — that a data
vector cannot observe, each with the reason and, where applicable, the test surface that
covers it instead.
