<!-- AUTHORED-BY Claude Fable 5 -->

# Normative statements with NO deterministic vector

The honest inverse of the manifests' `clauseIndex`: the normative requirements of the two
JLWS specs this suite deliberately does **not** pin with a vector, each with the reason.
Passing the vector suite is therefore **necessary but not sufficient** for full
conformance — an implementation must still satisfy these by its own review and testing.

Legend for *why not* (extending the `agentic-solid-conformance` legend):

- **network/trust** — governs live-network interaction or whom to trust; a data vector
  cannot observe it (the classic example: proving a fetch was *not* made).
- **stateful/temporal** — spans multiple observations over time, concurrency, or a
  streaming connection; a request/response vector cannot express it.
- **behavioural emission** — says what an implementation must *do or publish* as a side
  effect (deliver, cease, log, retain), not what a decision returns.
- **deployment-policy** — a per-deployment MAY/SHOULD whose trigger the harness cannot
  force (thresholds, policies, sizing).
- **envelope/under-specified** — the exact wire vocabulary is pinned to an upstream draft
  that is itself unpublished; the vectors pin invariants, not the frozen shape.
- **companion-planned** — the surface belongs to a planned companion spec (query,
  versioning, Solid-on-JLWS); the core only reserves slots.
- **covered-elsewhere** — deterministic and pinned, but in another suite of the family.
- **vectorable, deferred** — deterministic and pinnable, just not yet written; a natural
  next tranche.

## JLWS Core Protocol (`index.html`)

### Resource model and HTTP binding

| Clause | Requirement | Why no vector |
|---|---|---|
| core#containment | Creation/deletion updates membership **atomically**; no orphans; no cycles | stateful/temporal — atomicity is a concurrent-visibility property; the vectors pin only the sequential before/after (delete-rotates-parent-etag-and-membership) |
| core#path-alignment | Every minted URI is path-aligned; the root prefixes every resource URI | partially pinned (create cases assert Location prefixes; move asserts the realigned URI); the universal quantifier over all server behaviour is not black-box enumerable |
| core#resource-classes | A server MAY enforce media-type/size policy and MUST advertise it as problem details on rejection | deployment-policy — the trigger (a server policy) cannot be forced; the problem-details envelope itself is pinned by errors/problem-details-on-4xx |
| core#pagination | Pagination link discipline (first/next/last, opaque page URIs, 200) | deployment-policy — pagination fires above a *server-determined threshold* the harness cannot force portably. **vectorable, deferred** for implementations exposing a threshold knob: a natural follow-up tranche |
| core#http-general | Traversal rejection happens **before any authorization matching** | network/trust — the ordering is internal; only the rejection is observable (resources/path-traversal-rejected) |
| core#http-general | Entity-tags MUST be **strong** (weak validators cannot satisfy the If-Match discipline) | vectorable, deferred — an assertion that served ETags are not `W/`-prefixed, plus a weak-If-Match rejection case |
| core#http-general | 4xx/5xx to HEAD carries the problem-details headers without the body; 304 carries none | partially pinned (the 304 case asserts an empty body); the HEAD-error header mirror is **vectorable, deferred** |
| core#http-general | Servers SHOULD implement RFC 9111 caching | deployment-policy (SHOULD) |
| core#http-create-post | The server MAY decline a Slug hint on naming policy | deployment-policy — the conflict half is pinned (post-slug-conflict) |
| core#http-update | `Prefer: set-linkset` PUT/PATCH semantics (MAY) | vectorable, deferred — needs a fixture pinning the Working Draft's Prefer mechanism for implementations that opt in |
| core#http-move | The old URI SHOULD answer 308 for an implementation-defined period | stateful/temporal + deployment-policy |
| core#http-move | Move notifications emitted as Delete(old)+Create(new) unless negotiated | behavioural emission |
| core#operations | Operations are transport-abstract; other bindings may exist | definitional — only the HTTP binding is normative here, and it is what the vectors exercise |

### Authentication (core#authentication)

| Clause | Requirement | Why no vector |
|---|---|---|
| core#credential-model, #suites | Validation of authentication credentials under the four suites (OIDC discovery + ID-token validation, self-signed CID `kid` selection, did:key extraction, WebAuthn assertion verification) | network/trust + multi-party — each suite's validation dereferences live documents (CID, OIDC discovery, JWKS) and, for WebAuthn, verifies a challenge-bound assertion; the exchange operation abstracts the credential as pre-validated. **vectorable, deferred** in part: self-signed-CID and did:key cases (offline-verifiable) are a natural next tranche; the WebAuthn suite's wire contract already has its own test surface in `jeswr/solid-webauthn-reauth` |
| core#identity-documents | Verifiers SHOULD cache CID-derived keys per HTTP caching metadata | network/trust + stateful |
| core#client-identity | Client-ID metadata document validation | vectorable, deferred — the document format is plain JSON; accept/reject cases would pin draft-ietf-oauth-client-id-metadata-document shapes |

### Authorization (core#authorization)

| Clause | Requirement | Why no vector |
|---|---|---|
| core#token-exchange | "The authorization server MUST validate all presented tokens before issuing" | covered-elsewhere in part — subject-token validation is suite-specific (above); the resource-parameter handling is pinned |
| core#rs-validation | JWKS caching, key rotation support | network/trust + stateful |
| core#rs-validation | PoP proof validation when `cnf` is present (the proof itself: DPoP per RFC 9449, DPoP-SK per its spec) | covered-elsewhere / vectorable, deferred — the bare-presentation rejection is pinned (token-pop-bound-presented-bare-rejected); full DPoP proof matrices belong with the DPoP-SK spec's own planned vectors and RFC 9449's test surface |
| core#client-rules | A client MUST NOT present a token whose aud does not contain the target; SHOULD NOT share tokens; SHOULD NOT proactively fetch tokens; SHOULD reuse cached tokens | client-behavioural — apart from realm containment (pinned), client-side conduct is not observable from data vectors; a client-harness tranche is **vectorable, deferred** |
| core#sec-tokens | jti replay cache (MAY); pseudonymous batch issuance (SHOULD) | deployment-policy + stateful |

### Access requests and grants

| Clause | Requirement | Why no vector |
|---|---|---|
| core#grant-endpoints | Request/grant containers behave as ordinary JLWS containers; POST files a request; DELETE revokes | covered-elsewhere — the container mechanics are the containers/resources suites; the *service wiring* (description advertises the endpoints) is pinned by discovery/storage-description-valid |
| core#grants-are-records | Grant creation/revocation reflected in enforcement within a bounded, documented interval (SHOULD be immediate); derived views reflect revocation immediately | stateful/temporal — the live-revocation propagation is a timing property; listing-excludes-inaccessible-members pins the steady-state consequence |
| core#consent-receipts | Grants additionally issued as W3C VCs with revocation-coupled status | covered-elsewhere — VC issuance/verification vectors live in `agentic-solid-conformance` (agent-authz-credential suite) and `@jeswr/solid-vc`'s surface; the coupling to grant revocation is stateful |
| core#delegation | Delegated-grant chains: monotonic narrowing, expiry/revocation propagation, cycle rejection | covered-elsewhere — the delegation-chain semantics this section adopts are exactly the 13-case `odrl-delegation` suite of `agentic-solid-conformance` |
| core#groups | Group resolution at enforcement time; hierarchy; cycle rejection | vectorable, deferred — an `evaluate-access` extension carrying group membership documents is a natural next tranche |
| core#odrl-profile | `hasPurpose` → `odrl:purpose` normalisation; `jlws:client` / `jlws:mediaType` / `jlws:resourceType` constraints | vectorable, deferred — further `evaluate-access` cases |
| core#odrl-profile | Conflict between an applicable permission and prohibition | deliberately unpinned — the profile does not (yet) fix an ODRL conflict strategy; pinning one in a vector would invent normative content. Flagged for the spec's editor |

### Discovery

| Clause | Requirement | Why no vector |
|---|---|---|
| core#conformance / #discovery-model | "A server MUST NOT advertise a capability, service, or profile it does not implement" | meta — verifying it means probing everything advertised; individual capability behaviours are pinned per-suite |
| core#discovery-binding | The storage description MUST be readable by any agent that can read the storage root | vectorable, deferred — an http-exchange case with a non-controller agent |
| core#discovery-binding | When the description is non-public and webhooks are signed, the `verificationMethod` material the `keyid` values resolve to MUST be fetchable **without storage credentials** | network/trust — a receiver-side fetch-path property; the verification decision itself is pinned (the webhook cases supply the description as input) |
| core#discovery-model | The document MUST validate as a CID when verificationMethod is present | partially pinned (shape cases); full CID 1.0 validation is that spec's own surface |

### Notifications

| Clause | Requirement | Why no vector |
|---|---|---|
| core#subscription-api | Deliveries MUST cease immediately when a topic's read access is revoked | stateful/temporal + behavioural emission |
| core#subscription-api | Container subscriptions are recursive (events for descendants) | behavioural emission — requires observing a delivery stream; **vectorable, deferred** as a harness-level integration test |
| core#notification-envelope | Exact envelope wire vocabulary | envelope/under-specified — the upstream notifications Editor's Draft is unpublished; the vectors pin the spec's invariants (content-free, `published`, `actor` default-omitted) against a representative shape |
| core#webhook-binding | Delivery-side SSRF discipline on outbound POSTs | network/trust (see Security below) |
| core#sse-binding | Header-mode re-challenge (`reauthenticate` terminal event), capability-URL entropy ≥128 bits / expiry / revocation binding, `Last-Event-ID` replay within a retention window, `reset` control event | stateful/temporal + streaming — connection-lifecycle behaviour; entropy is statistical, expiry/revocation span time. The subscription-response *shape* is pinned |
| core#websocket-binding | Ping cadence, re-subscribe on close, no replay | stateful/temporal + streaming |
| core#notification-envelope | Servers MAY batch activities | deployment-policy |

### Security and privacy (core#security-considerations, #privacy-considerations)

| Clause | Requirement | Why no vector |
|---|---|---|
| core#sec-transport | TLS everywhere, RFC 6125 identity validation, BCP 195, no tokens in URLs/logs | network/trust + behavioural — transport and hygiene properties; belongs to each implementation's security test surface |
| core#ssrf | The full SSRF policy (https-only, resolved-address deny-list, DNS pinning, no auto-redirect, caps, no credential forwarding) | network/trust — requires an instrumented network layer, not a data vector; this is exactly the `@jeswr/guarded-fetch` test surface, and the `solid-oidc-verifier` M2 SSRF audit shows the shape such tests take |
| core#oracle-freedom | "Servers MUST NOT enumerate, in any discovery surface, the set of link relations or types they index" | network/trust — proving a *non*-disclosure across all surfaces is not enumerable; the concrete oracle consequences (listings, counts, hidden ≡ missing) are pinned |
| core#sec-cors | Origin validation, restrictive CORS, nosniff | vectorable, deferred — header-assertion cases for browser-facing deployments |
| core#privacy-considerations | Minimal disclosure, pseudonymous batch issuance, no token logging, actor-timing disclosure notice | behavioural emission / policy |

### Companions (slots only)

| Clause | Requirement | Why no vector |
|---|---|---|
| core#query-services | TypeIndex/TypeSearch/SPARQL service invariants (live authorization filtering, caller-visible counts, no existence oracle) | companion-planned — the query companion must ship its own vectors; the invariants' core instances are pinned (listings/counts) |
| core#versioning-slot | Version history / Memento | companion-planned |
| rdf#solid-profile | Solid-on-JLWS mapping (incl. the WAC→ODRL table) | informative section; a full profile companion would carry the "mapping table as executable assertions" vectors its appendix sketches |

## RDF Content Transformation Profile (`rdf-transform.html`)

| Clause | Requirement | Why no vector |
|---|---|---|
| rdf#round-trip | JSON-LD targets: a declared `@context` is reused; context-less sources serialise with a documented stable context | vectorable, deferred — needs a `transform-representation` case asserting compaction context reuse (the graph contract is pinned; the compaction shape is client-visible sugar) |
| rdf#round-trip | A JSON-LD source declaring a **non-allowlisted remote context** is handled without fetching (expanded-form serialisation or 406) — never a network fetch | network/trust for the no-fetch half; the expanded-form-or-406 outcome is **vectorable, deferred** (a remote-context fixture) |
| rdf#authoritative-bytes | Writes in a derived type flip the stored media type — accepted ONLY when the written type is itself an advertised `source` (bidirectional coverage), else 415; MUST NOT silently transcode | vectorable, deferred — gated on an implementation opting into derived-type writes; two case shapes are ready (PUT ld+json onto a ttl resource then GET without Accept; PUT in a target-only type → 415) |
| rdf#normalizes | Read-back under `normalizes` is graph-isomorphic to what was written | partially pinned (determinism is; the write→read isomorphism needs a write + transform check in one case — **vectorable, deferred**) |
| rdf#rdf-patch | RDF PATCH application: graph patch, atomicity, ETag rotation, N3 `?conditions` failure → 409 | vectorable, deferred — a PATCH tranche (SPARQL Update / N3 Patch fixtures) once an implementation advertises an RDF patch format; atomicity itself is stateful |
| rdf#indexing | Content-derived index enrichment bound by oracle rules | companion-planned (query companion) + covered-elsewhere (oracle cases) |
| rdf#security-privacy | Parser resource bounds (size/triple/depth/time); no dereference during transformation (no remote `@context`, no `owl:imports`) | network/trust — proving the absence of a fetch needs an instrumented network layer; resource-bound rejection of depth/size bombs is **vectorable, deferred** (bomb fixtures are cheap to add) |
| rdf#security-privacy | ETag correlation (no cross-representation digest leakage) | design-review property of the ETag scheme, not observable from single exchanges |

## Cross-cutting honesty notes

- **Verdict provenance.** Every expected outcome is derived from the spec text (see
  README "Provenance of verdicts"); where the spec leaves a code point open the vector
  either uses `errorOneOf`/`anyOf` (e.g. exchange-relative-resource-rejected,
  transform-off-byte-native-only) or records its interpretation in `notes` (e.g. the
  path-segment reading of "logically contains" in the two prefix-trap cases, the RFC 8693
  §2.2.2 `invalid_target` choice). Nothing is silently over-pinned.
- **The client conformance class is under-vectored.** Only `verify-realm-containment`
  exercises client-scoped requirements; a client-side harness tranche is deferred.
- **The `access` state map is an abstraction.** http-exchange cases declare effective
  access; the grant→enforcement wiring (core#grants-are-records) is pinned only at the
  decision level (`evaluate-access`) plus the steady-state oracle cases. The bounded
  reflection interval is stateful and unpinned.
