<!-- AUTHORED-BY Claude Fable 5 -->
# DECISIONS — lws-spec

Numbered, durable design decisions for the JLWS clean-slate spec (`index.html` core +
`rdf-transform.html` companion). The design basis is the research brief
[`docs/DESIGN-BRIEF.md`](./docs/DESIGN-BRIEF.md) (primary-source-cited against the W3C LWS WG's
drafts, repo `w3c/lws-protocol @ 4fa93ee`, minutes, and the maintainer's own prototypes).
Divergences from the WG Working Draft (lws10-core WD, 2026-06-22) are cross-referenced from the
core spec's Appendix "Divergence register" (same D-numbers). **All of this awaits the
maintainer's review — see `docs/OPEN-QUESTIONS.md` for the questions he has not yet answered.**

## S1–S4. The four steer defaults (adopted from the research brief's recommendations)

The maintainer was asked to steer these and has not yet answered; the brief's recommended
options were adopted so the draft could be built. Each is reversible.

- **S1. Wire-compatible superset** (brief OQ1 recommendation). Keep every SOUND WD mechanism
  verbatim — byte-native resources; containment-by-metadata; JSON-LD containers
  (`application/lws+json`-compatible conneg); RFC 9264 linkset metadata + JSON Merge Patch +
  strict If-Match/428; POST-create with Slug; Range MUST; `Depth: infinity` delete; the
  exchange → audience-restricted ≤300 s at+jwt → Bearer auth chain the maintainer prototyped in
  `jeswr/lws-keycloak`. Diverge ONLY on the identified gaps (D1–D17 below). Consequence: a WD
  client interoperates with a JLWS server for everything the WD defines.
- **S2. Optional negotiated PoP profile** (brief OQ4 recommendation). The DEFAULT presentation
  is the maintainer's deliberate no-DPoP Bearer baseline (his lws-keycloak migration notes:
  "The use of DPoP is no longer required"; the Working Group's published design summary
  (public-lws-wg mailing list, Nov 2025): "tokens are not
  sender constrained (no DPoP)"). DPoP (RFC 9449) and DPoP-SK (`jeswr/dpop-sk-spec`) are
  OPTIONAL profiles negotiated via RFC 9728 resource metadata. PoP is never mandated; a server
  MAY require it per-realm for high-assurance storages. This does NOT reverse his baseline.
- **S3. Substrate-only core + companions** (brief OQ7 recommendation). The CORE spec =
  storage/resources, containers, metadata, operations/HTTP binding, discovery, auth
  (credential-abstract + pluggable suites), authz (RFC 9728/8693/9068 chain + the ODRL Access
  Requests & Grants interface per his upstream PR #109), notifications (signed webhooks + the
  SSE + WebSocket bindings the WG deferred). Query (TypeIndex/TypeSearch + AC-SPARQL
  `SparqlQueryService`), versioning (RFC 5829 + Memento), and the RDF transformation opt-in are
  COMPANIONS; the core reserves their capability/service slots and fixes cross-cutting
  invariants (oracle freedom, live authz). The RDF companion is drafted
  (`rdf-transform.html`); query + versioning companions are planned.
- **S4. Clean divergences designed in** (brief's divergence list): RFC 9728 replaces
  `as_uri`/`lws-configuration`; idempotent create via `PUT + If-None-Match: *`; strict
  container ≠ data-resource separation; W3C CID 1.0 identity documents (already the WD's
  direction — kept); SSRF discipline + RFC 9700-anchored threat model (absent from the WD).

## D1. RFC 9728 `resource_metadata` replaces bespoke `as_uri` + `/.well-known/lws-configuration`

The WD mints `as_uri` (challenge parameter) and `/.well-known/lws-configuration` (unregistered
well-known with RFC 8414 shape). RFC 9728 (OAuth 2.0 Protected Resource Metadata, Proposed
Standard 2025) standardises exactly this: a `resource_metadata` challenge parameter and a
registered `/.well-known/oauth-protected-resource` document listing `authorization_servers`.
The maintainer's own prototype already reached for the shape — his RECOMMENDED
`storage_metadata` challenge parameter (lws-keycloak `spec/authz.md` §4.1) — so this is an
upgrade of his design to the shipped standard, not a divergence from it. The WD's `realm`
parameter + client-side containment-verification rule are retained unchanged. AS metadata moves
to RFC 8414's registered well-known. A `jlws_storage_description` extension member carries the
storage-description pointer his `storage_metadata` parameter carried. (Brief pushback (a): the
bespoke discovery "will read as NIH in wide review" — cheap, high-credibility fix.)

## D2. Idempotent create: `PUT + If-None-Match: *`

The WD's only create is POST (non-idempotent; the WD itself warns "Repeating it may create
duplicates"); idempotent create is open upstream as w3c/lws-protocol#173. Plain RFC 9110
conditional-request machinery closes it: `If-None-Match: *` on PUT to the desired URI; 412 if
it exists (retry-safe); trailing `/` creates a container. Sub-decisions: the parent container
MUST already exist (409 `missing-parent` otherwise) — no auto-created intermediate containers,
preserving containment integrity (no orphan/implicit containers, unlike Solid's PUT); the
client-chosen URI is meaningful because of D4 path alignment.

## D3. Containers are NOT data resources (strict separation)

The WD's most persistent unresolved contention (#126; trait/mixin vs strict separation; London
F2F). Resolved by fiat: a resource is exactly one of Container | DataResource; a container's
only representation is the server-managed listing; descriptive content about a container
attaches via `describedby` in its linkset. Kills the ETag/conneg ambiguity. The maintainer may
prefer the trait model (the other side of the WG debate) — flagged in OPEN-QUESTIONS (OQ9).

## D4. Guaranteed URI-path alignment (containment stays metadata)

The WD says "clients SHOULD NOT assume that URI structure reflects containment". With
multi-containment resolved out of scope for 1.0 (London Day 2 RESOLUTION), URI-independence
buys little and costs relative-URI resolution, object-store key mapping, and crisp
`aud`/`realm` containment checks (#135 arguments). The maintainer's own prototype anticipates
aligned deployments ("where lws:containment conforms with URI containment the `realm` will
typically be an lws:StorageRoot"). JLWS: child URI = parent URI + one segment; containers end
`/`; the semantic model is STILL metadata (`rel="up"`, `items`) — the guarantee constrains
servers only, so WD clients are unaffected. Multi-containment, if ever, would be a capability.
Steer question OQ3.

## D5. Storage description: CID-shaped + `conformsTo` version URIs + a real capability registry

Three upgrades to the WD's Discovery section, all in its own direction of travel: (a) the CID
remodel (verificationMethod + service) is live upstream as PR #183 and the Ghent F2F artifact
already has the shape; the notifications ED already resolves webhook signing keys from it —
JLWS just lands it. (b) `conformsTo` protocol-version URIs adopt the
`fedreg:StorageDescription` convention from `@jeswr/federation-registry`, giving
feature-detection + federation indexability the WD lacks. (c) The WD's capability types are
unregistered examples (`https://feature.example/…`); JLWS mints a real registry
(`PatchSupport`, `ContentNegotiation`, `ResumableUploads`, `RecursiveDelete`, `MoveResource`,
`Versioning`) in the jlws namespace, extensible by URI, unknown-must-ignore.

## D6. Server→client notification bindings added (SSE + WebSocket)

The WG resolved webhooks-first and deferred server-to-client channels (London Day 2), leaving
browser clients nothing; UCS req. 7 names push/SSE explicitly. JLWS adds `SseSubscription` and
`WebSocketSubscription` under the SAME subscription API and envelope as the WD's webhook
binding (adopted verbatim, RFC 9421 signatures + CID keyid resolution included). The SSE-auth
objection raised in the WG discussion is answered head-on: header mode (Authorization on the
stream request + `reauthenticate` terminal event) or capability-URL mode (≥128-bit,
single-subscription, expiring, revoked-with-subscription, TLS-only) for EventSource clients;
`Last-Event-ID` resumption with a documented retention window + `reset` control event.
WebSocket binding mirrors WebSocketChannel2023's `receiveFrom` for Solid-stack continuity.
Ship-both vs SSE-first is steer question OQ6 (this draft ships both).

## D7. WebAuthn authentication suite added; SAML suite omitted from the core set

The WD ships SAML and has no WebAuthn suite, while its own drafting notes prefer direct
WebAuthn ("the preferred use of WebAuthn with Linked Web Storage … removes the need to trust an
additional IDP server" — lws-keycloak authn.md). The JLWS WebAuthn suite reuses the RFC 8693
passkey-assertion-as-`subject_token` wire contract from `jeswr/solid-webauthn-reauth` (which
already speaks the exact grant type the authorization chain mandates). SAML is not deleted from
the world: the suite architecture makes it definable externally by whoever needs it. OIDC,
self-signed CID, and did:key suites are adopted from the WG suite WDs as-is.

## D8. Client identity = OAuth Client ID Metadata Document

Plain-JSON client documents (draft-ietf-oauth-client-id-metadata-document), replacing
Solid-OIDC's JSON-LD Client Identifier Documents — exactly the maintainer's migration notes
("without the need for JSON-LD support (i.e., no `@context` field is required)") and his
upstream issue w3c/lws-protocol#38.

## D9. PoP presentation profiles are optional and negotiated (see S2)

Mechanics: advertised in RFC 9728 resource metadata (`dpop_signing_alg_values_supported`;
DPoP-SK's members per that spec); Bearer MUST always be accepted by default; a deployment MAY
require PoP per-realm (medical/financial UCS cases). Honest framing of the trade recorded in
the spec's security section: within its ≤300 s lifetime a stolen Bearer token replays freely
against its own storage; PoP closes that window and costs nothing when off (brief pushback (b)).

## D10. Normative security model: SSRF discipline + threat model + RFC 9700 baseline

Absent from the WD (its privacy sections are literally empty — #119; threat model unstarted —
#177) despite the design being a textbook SSRF surface (CID dereference on validation, webhook
delivery to subscriber-supplied inboxes, JWKS/metadata fetches). JLWS makes the suite policy
normative: https-only, resolved-address deny-list (loopback/private/link-local/metadata, v4+v6
incl. mapped forms), DNS pinning, no auto-redirect (or re-validate per hop), size/time caps, no
credential forwarding. Plus a threat-model table (token theft, credential replay, rogue AS,
colluding RS+AS probe, SSRF, oracles, forged notifications, channel hijack, lost update, path
traversal, grant-surface escalation) and the maintainer's own hardening rules from authz.md
(tenant-replay isolation §7.5.1; no-proactive-token-fetch collusion rule §7.10; 404-vs-403
§7.12; batch-issued single-use pseudonymous tokens §6.1 in Privacy).

## D11. `aud` is single-valued everywhere

Fixes the WD's internal inconsistency: its RS validation demands "exactly one value" while its
OIDC suite examples show multi-audience credentials. JLWS: ACCESS TOKENS carry exactly one
`aud` (the exchange `resource`); AUTHENTICATION CREDENTIALS may still carry multi-value `aud`
(client + AS) as the suites specify — the constraint binds where the replay risk lives.

## D12. Fail-closed container listings (and caller-visible counts)

The WD permits listings to include identifiers of members the client cannot access. JLWS
forbids it: the primary listing must not be a weaker existence-oracle than the searchindex ED's
derived views (which already count caller-visible only). `totalItems` counts the visible view.

## D13. WD internal-drift fixes

(a) Container shape: the published flat `items` array is normative; the repo's F2F
`ContainerPage`/`contains` shape is not carried forward; pagination is purely Link-header.
(b) `up`/`items` are SYSTEM-managed (read-only): resolves logicalresourceorganization.md
("clients cannot modify it directly") vs Operations/metadata.md (lists them as
client-manageable "Core Metadata") in favour of server management; reparenting is the explicit
optional move operation (D16-adjacent), not a metadata edit; the metadata table collapses to
two categories (system-managed / user-managed).

## D14. Namespace: `https://w3id.org/jeswr/lws#`, term-identical, alias-accepting

A personal draft must not squat `w3.org/ns/lws#` (itself unpublished — #60). JLWS terms are
name-identical to the WD's so a context substitution restores wire identity; anywhere a jlws
URI is required in a link-relation/type position, the corresponding `w3.org/ns/lws#` URI MUST
be accepted as an alias. Working name "JLWS" is an explicit placeholder (OQ1).

## D15. Access grants: strict ODRL (the maintainer's PR #109, realised) + extensions

The WD's access documents are ODRL-flavoured but flat. JLWS adopts the maintainer's upstream
PR #109 restructure: REQUIRED `profile` (`…/access-profile/odrl-1`), `odrl:Request` for
requests / `odrl:Offer` for grants, permission/prohibition/obligation rules, singular
action+target per rule, `hasPurpose` → `odrl:purpose`, and `jlws:append`/`jlws:create` via
`odrl:includedIn odrl:modify`. Grant-as-record (never a presented token) is kept from the WD,
with the #144 contention (source-of-truth vs interface) resolved at the interface: the record
binds observable behaviour (bounded-interval enforcement reflection; immediate revocation in
derived views), internals are implementation choice. Extensions the WG punts, served
optionally: grants-as-VCs (consent receipts, UCS req. 18), ODRL delegation chains with
monotonic narrowing (solid-odrl semantics; UCS reqs. 6/14), GroupService with hierarchy +
cycle rejection (UCS req. 5).

## D16. RFC 9396 `authorization_details` normative (narrowing-only), with approved/deferred duality

The Ghent F2F access-token artifact sketches RAR; the maintainer's authz.md defines the
duality ("AS responds with either: yes, these actions are ok; OR deferred policy evaluation").
JLWS makes the claim optional-but-normative with one hard rule: it can only NARROW access
relative to the storage server's own policy, never widen it — the RS remains the enforcement
authority.

## D17. RFC 9457 problem details REQUIRED on all 4xx/5xx

WD: SHOULD. JLWS: MUST, with a problem-type registry under
`https://w3id.org/jeswr/lws/problems/`. Uniform machine-readable errors are load-bearing for
autonomous clients (the agentic roadmap) and cost servers almost nothing.

## D18. The RDF opt-in keeps the WD's capability term `ContentNegotiation`

The research brief's §6 sketch used the name "ContentTransformation"; the WD's Discovery
example uses `ContentNegotiation` with the same `{source, target[]}` shape. The WD term is
kept for wire continuity, and the profile adds only two members: `profile` (pins the `rdf-1`
round-trip semantics — RDF 1.1 abstract-syntax isomorphism, no inference, resource-URI base,
declared-context JSON-LD) and `normalizes` (deterministic, graph-preserving, NOT byte-exact
read-back — the honest escape hatch for parse-on-ingest stores). Authoritative-bytes rules:
stored bytes win; per-representation ETags (RFC 9110 §8.8.3) with `Vary: Accept`; If-Match
accepted against either representation's current ETag; writes in a derived type flip the
stored type rather than being silently transcoded. RDF PATCH formats (SPARQL Update, N3 Patch)
are advertisable ONLY when the profile is on. Unparseable stored bytes degrade per-resource
(406 + problem details) — the byte store never breaks because a transform does. Solid-on-JLWS
is an informative mapping section (RDF pair on; Solid-OIDC → OIDC suite + DPoP profile;
WAC → ODRL mapping table; N3-Patch via PatchSupport), to be a full companion later.

## D19. Repo shape: one repo, spec + vectors; ReSpec; local-only until steered

Follows the dpop-sk-spec template (ReSpec `unofficial`, personal editor entry, drafting
disclosure, DECISIONS.md, suite.json, `.roborev.toml`). Brief OQ10 (one repo vs split vectors)
defaulted to one repo; publication was gated on the maintainer (OQ2) and has since been
authorised as a clearly-framed public experiment (`github.com/jeswr/lws-spec`);
`edDraftURI` remains deliberately unset in the ReSpec configs pending his naming/venue
decisions (OQ1). Status update: the vectors LANDED (`test-vectors/`, 150
cases across 10 suites incl. the D21 composition suites, agentic-solid-conformance
format, spec-derived verdicts); the co-location remains
reversible — the suite is self-contained under `test-vectors/` so a later split into its own
repository is a directory move (OQ10 stays open for the maintainer).

## D20. Test-vector verdicts are spec-derived, pinned by section id, honest about gaps

The agentic-solid-conformance methodology extracts verdicts from a pinned reference
implementation; JLWS has none yet, so the suite inverts the direction: every `expected` is
derived from the normative text @ the manifest's `specSource` pin (currently `895391f`;
per-case `source` cites the clause; `notes`
records any interpretation applied where the spec leaves a code point open, e.g. the
RFC 8693 §2.2.2 `invalid_target` choice — the path-segment reading of "logical containment"
began as such a note and is now the spec's own normative rule (rs-validation), the intended
lifecycle for these notes). Consequences designed in: (a) under-specified code points use
`anyOf`/`errorOneOf` rather than silent over-pinning; (b) SHOULD-level requirements emit
advisory `level: "SHOULD"` cases (W3C practice), optional features hide behind
`preconditions` so skipping is conformant; (c) `GAPS.md` catalogues every normative
statement without a vector and why (network/trust, stateful, behavioural, envelope,
deferred); (d) `tools/check.mjs` machine-verifies internal coherence, including that every
pinned clause id exists in the spec HTML and that the signed fixtures verify (or
deliberately fail) exactly as their cases claim; (e) crypto fixtures are Ed25519/EdDSA with
committed TEST-ONLY private keys so regeneration is byte-stable and deterministic. When the
first implementation (solid-server-rs LWS) runs the suite, vector-vs-implementation
disagreements are adjudicated against the spec text and the loser fixed; an
implementation-pinned consistency runner is then added beside check.mjs.

## D21. Sibling-spec composition verdicts (the docs/alignment set)

How the maintainer's other proposed specs compose with JLWS — one verdict each, full
rationale + edits + vectors + implementation seams in `docs/alignment/` (2026-07-05):

- **AC-SPARQL** (`jeswr/solid-sparql-query`) = a **service** — the reserved
  `SparqlQueryService` slot (`#query-services`), advertised only when the RDF transform
  profile is on (`rdf-transform.html#indexing`); binding-profile URI
  `https://w3id.org/jeswr/lws/query/ac-sparql-1`. Implementation gated on `jeswr/sparq#992`.
- **DPoP-SK** (`jeswr/dpop-sk-spec`) = an **auth-layer PoP presentation profile**,
  RFC 9728-negotiated (`pop_session` in the PRM). Alignment surfaced and fixed a real
  spec bug: `#presentation-pop` referenced a DPoP-SK "required-member" that does not
  exist — `dpop_bound_access_tokens_required` governs both PoP profiles because a
  DPoP-SK session is established from a DPoP-bound token.
- **A2A RDF extension** (`jeswr/a2a-rdf-extension`) = a **reference** (agent-layer;
  JLWS is its document substrate — the RDFC-1.0 protocol hash is representation-stable
  under the rdf-1 round-trip contract) plus an optional extension service
  `…/a2a-rdf/v1#AgentInteractionService` via the registry's extension-URI mechanism.
- **WebAuthn re-auth** (`jeswr/solid-webauthn-reauth`) = an **authentication suite** —
  already absorbed as `#suite-webauthn` (D7); the alignment reconciles its
  DPoP-bound-only issuance with the D9 Bearer baseline by scoping (tokens issued under
  the profile always carry `cnf`, so rs-validation step 5 already refuses them bare).
- **Agentic Solid Note** (`jeswr/agentic-solid-note`) = a **reference** (informative
  umbrella; gains a substrate-portability bullet + a JLWS maturity row).
- **agentic-solid-conformance** = the **shared conformance fabric** (this repo's
  vectors already use its format — D20); the alignment fixes the homing rule
  (server-surface vectors here, pure-function vectors there) and specifies ~23 new
  composition cases across the two homes.

No new core capability term was needed by any of the six — evidence the D5 registry +
extension-URI design carries its weight. Also repointed the `[[AC-SPARQL]]` biblio to
the published editor's draft (it predated `jeswr/solid-sparql-query`).
