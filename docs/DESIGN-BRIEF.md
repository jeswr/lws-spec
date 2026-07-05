<!-- AUTHORED-BY Claude Fable 5 -->
# Clean-Slate LWS Spec — Research Foundation + Design Brief

> Status: HISTORICAL research record (written 2026-07-05, pre-drafting, when no spec text existed yet). The spec
> this brief proposed has since been drafted in this repository (`index.html` + `rdf-transform.html`; the adopted
> defaults + divergences in `DECISIONS.md`; remaining follow-ups in `docs/OPEN-QUESTIONS.md`). The brief is kept
> as the cited research foundation; its "proposed"/"future" wording reflects its writing date.
> Author: PSS agent (Fable, `claude-fable-5`), 2026-07-05. Primary-source-verified; every mechanism claim carries its URL.
> Constraints honoured: jeswr/ namespace only; no person tagged anywhere, and third-party WG participants cited
> only via the public record (minutes / issue / list-archive URLs) with no individual named — the sole personal
> names kept are the WD's published editors, as bibliographic citation; zero writes to any w3c/ or solid/ repo
> (read-only fork + clones + this local doc only).

---

## 0. Executive summary

The W3C **Linked Web Storage Working Group** (LWS WG, chartered 2024-09-09) is re-standardising the Solid storage
layer on a **byte-native, JSON-LD-described, OAuth-2-authorised** basis, dropping Solid's RDF-mandatory/LDP
heritage. Its core protocol reached **FPWD 31 Mar 2026** and **WD 22 Jun 2026** (https://www.w3.org/TR/lws10-core/),
with four Authentication Suite FPWDs (Apr 2026, now WDs) and a Use-Cases Draft Note. The group has formally slipped:
London F2F (27 Apr 2026) resolved to seek a charter extension with **CR by Fall 2026, TR by Fall 2027**
(https://www.w3.org/2026/04/27-lws-minutes.html) — versus the original charter's Rec-by-Sep-2026.

Two facts reframe this task:
1. **The maintainer is an editor of the WG core spec** (lws10-core respecConfig; https://www.w3.org/TR/lws10-core/)
   and authored much of its early structure. The clean-slate spec is not "catch up with the WG" — it is his chance to
   ship the design he already largely wrote, minus consensus drag, plus the pieces the WG punted.
2. **His pre-existing namespace repos are the strongest directional signal** (§4): `jeswr/lws-keycloak` (Nov 2025,
   the full authn/authz prototype incl. his own spec prose), `jeswr/lws-acp` (Aug 2025, access-control-language
   sketches), his upstream PR #109 (strict-ODRL access-grant restructure), and his fork of the UCS. Notably, his own
   Solid-OIDC migration notes state **"DPoP is no longer required"** — the Bearer+audience-restriction baseline is
   deliberate design, so this brief proposes PoP as a *negotiated optional profile* (his own dpop-sk-spec), not a
   reversal.

The WG draft is directionally sound (bytes-first substrate, capability-advertised content transformation, RFC 8693
token exchange, ODRL access grants, RFC 9264 linkset metadata, RFC 9421-signed webhooks). The identified gaps a
clean-slate spec can close: no client-facing notification channel yet (WG resolved to do server-to-server first),
bespoke `as_uri` where RFC 9728 now exists, no idempotent create, no query answer to the UCS SPARQL requirements,
no sub-delegation/groups story, unresolved container-as-data-resource semantics, and a heavily-TODO'd core document.

---

## 1. Landscape: the WG, its repos, and the forks taken

### 1.1 The Working Group

- Group page: https://www.w3.org/groups/wg/lws/ — mission: *"enable the development of web applications where
  data storage, entity authentication, access control, and application provider are all loosely coupled."*
  Chairs + staff contact: per the group page (three co-chairs and a W3C staff contact).
- Charter: https://www.w3.org/2024/09/linked-web-storage-wg-charter.html (2024-09-09 → 2026-09-08; extension being
  pursued per London F2F resolution, https://www.w3.org/2026/04/27-lws-minutes.html).
- Mailing list archive: https://lists.w3.org/Archives/Public/public-lws-wg/ (low-traffic; the real debate is in
  GitHub issues + minutes).
- Publications page: https://www.w3.org/groups/wg/lws/publications/
- Core editors: Jesse Wright (Oxford), Erich Bremer (Stony Brook) (https://www.w3.org/TR/lws10-core/).

### 1.2 Published deliverables (verified 2026-07-05)

| Deliverable | Status | Date | URL |
|---|---|---|---|
| Linked Web Storage Protocol 1.0 (core) | WD (FPWD 2026-03-31) | 2026-06-22 | https://www.w3.org/TR/lws10-core/ |
| LWS 1.0 Authn Suite: OpenID Connect | WD (FPWD 2026-04-23) | 2026-06-09 | https://www.w3.org/TR/lws10-authn-openid/ |
| LWS 1.0 Authn Suite: SAML 2.0 | WD | 2026-06-09 | https://www.w3.org/TR/lws10-authn-saml/ |
| LWS 1.0 Authn Suite: Self-signed CID | WD | 2026-06-09 | https://www.w3.org/TR/lws10-authn-ssi-cid/ |
| LWS 1.0 Authn Suite: Self-signed did:key | WD | 2026-06-09 | https://www.w3.org/TR/lws10-authn-ssi-did-key/ |
| Linked Web Storage Use Cases | Draft Note | 2026-02-10 | https://www.w3.org/TR/lws-ucs/ |
| Notifications, Search/Type-Index, Vocabulary | ED only | — | https://w3c.github.io/lws-protocol/ |

FPWD announcement: https://www.w3.org/news/2026/first-public-working-draft-linked-web-storage-protocol-1-0/;
authn-suite FPWDs: https://www.w3.org/news/2026/first-public-working-drafts-for-the-linked-web-storage-lws-1-0-authentication-suite/.

### 1.3 Repos + forks

Substantive W3C repos — both now forked into jeswr/ (read-only; no issues/PRs/comments):

- **w3c/lws-protocol** → **jeswr/lws-protocol** (fork created this task, 2026-07-05; ahead 0 / behind 0 — a clean
  mirror incl. all upstream branches). Modular: `lws10-core`, `lws10-vocab`, four `lws10-authn-*`,
  `lws10-notifications` (ED), `lws10-searchindex` (ED), `oct-meeting/` (Ghent F2F consensus artifacts).
- **w3c/lws-ucs** → **jeswr/lws-ucs** (fork already existed — created by the maintainer 2025-07-21; main is
  ahead 0 / behind 46, i.e. he worked via PR branches, nine of which merged upstream — see §4.3).

No other w3c/ LWS repos exist (`gh repo list w3c` + `gh search repos` — only lws-protocol + lws-ucs). There is
**no explainer or admin repo to fork**; the charter lives on w3.org. Noted but NOT forked (community, not WG
deliverables): `linkedwebstorage/lws-server` (minimal JS impl, AGPL), `linkedwebstorage/lwsd` (auth-batteries
daemon: WebAuthn passkeys + bearer + sessions), `linkedwebstorage/test-suite` (unofficial 27-test MUST-level EARL
suite), `linkedwebstorage/linkedwebstorage.com` (unofficial info site). Also relevant: JSS (a Solid server) filed
the first LWS FPWD implementation report, May 2026
(https://lists.w3.org/Archives/Public/public-lws-wg/2026May/0002.html).

---

## 2. Goals, principles, use cases, non-goals (distilled + cited)

### 2.1 Goals (charter, https://www.w3.org/2024/09/linked-web-storage-wg-charter.html)

- Loose coupling of storage / entity authentication / access control / application provider.
- *"Define a core web protocol specification for the secure and efficient operation of compliant servers and the
  behavior of compliant applications"* + data-security practices.
- Input documents: **Solid Protocol (0.11.0+)** and **Fedora API Specification 1.0**.
- Success criteria: **≥2 independent interoperable implementations of every feature**; open test suites from
  earliest drafts; security/privacy/accessibility sections; a general Threat Model; TAG design-principles alignment.

### 2.2 Non-goals (charter + formal WG decisions)

- NOT "a unique and exclusive solution for Personal Data Stores"; NOT new **identity** mechanisms; NOT new **data
  formats** (charter, ibid.).
- **Access-control policy language: out of scope for 1.0** — deliberately "delegated to external systems and CGs
  (like Solid CG)"; LWS specifies the Access Requests & Grants *interface* instead (London F2F Day 1,
  https://www.w3.org/2026/04/27-lws-minutes.html; issue https://github.com/w3c/lws-protocol/issues/143).
- **Multiple containment: out of scope for v1.0** (London F2F Day 2 RESOLUTION,
  https://www.w3.org/2026/04/28-lws-minutes.html; the debate: https://github.com/w3c/lws-protocol/issues/135).
- **View-based sharing: out of protocol scope** (2025-07-21 meeting, https://www.w3.org/2025/07/21-lws-minutes.html).
- **AS/RP definition out of scope — LWS defines the RS** (Ghent F2F consensus, `oct-meeting/README.md` in
  w3c/lws-protocol: *"the focus of the LWS WG is to define an RS. Defining an AS or RP is out of scope"*).
- Notifications: **stay in scope**; server-to-server (webhooks) first, server-to-client (SSE/streaming) as a
  separate later work item (London Day 2 RESOLUTIONs, https://www.w3.org/2026/04/28-lws-minutes.html).

### 2.3 Use-case requirements (UCS Draft Note https://www.w3.org/TR/lws-ucs/; source w3c/lws-ucs/spec/requirements.md)

Load-bearing for architecture: any-type resources (server MAY limit type/size); data sharing with
expiry/revocation; centralized + federated + self-sovereign **authentication**; globally unique IDs; group-based
access control (incl. hierarchies); delegation of control AND **sub-delegation of access rights**; notifications
(*"real-time (e.g., push/SSE) or via queued channels"*); server-to-server auth; storage portability;
self-descriptive/discoverable APIs; **search & query incl. pod-level SPARQL respecting ACLs** (req. 15, with
federated-query sub-requirements); access request handling; **consent receipts** ("verifiable, auditable record of
user consent … revocable"); contextual access control (time/location/group); trusted-issuer lists (trust is
non-transitive); **resumable large transfers** (cites draft-ietf-httpbis-resumable-upload); versioning; inbox
messaging; **"Personal Data Projection"** (req. 33: *"automatic transformation (projection) of personal data in
formats consumable by non-LWS applications … without duplicating underlying resources"* — the requirements-level
basis for RDF/content transformation); offline sync; collaborative editing (locking/optimistic/CRDT); E2E
encryption; auditable trail; performance at scale.

### 2.4 Relationship to Solid

- Charter: Solid CG incubation since 2018; *"a separation of goals and transfer of incubated work items"* — LWS is
  the Rec-track standardisation of the Solid storage layer. WebID, Solid-OIDC, WAC, ACP, Solid Notifications are
  listed only as *potential* dependencies "pending maturity assessment".
- lws10-core acknowledges *"This specification draws heavily from the Solid Protocol"* — yet its normative text
  never mentions Solid, and its container model is explicitly non-LDP (rationale for abandoning the LDP/Solid REST
  bindings: https://github.com/w3c/lws-protocol/issues/24 — abstract operations, 404-for-hidden, non-HTTP bindings).
- What LWS drops from Solid: RDF-mandatory resources, Turtle + N3-PATCH, slash-URI containment semantics, WAC/ACP
  as normative access control, Solid-OIDC/DPoP, the LDP vocabulary. Access-control incubation was pushed *back to
  the Solid CG* (https://www.w3.org/2026/04/27-lws-minutes.html). WebID-vs-CID remains contested
  (https://github.com/w3c/lws-protocol/issues/57 — 27 comments; the Web-CID profile straw poll failed 2026-03-30,
  https://github.com/w3c/lws-protocol/issues/96).
- The maintainer's framing — **LWS = byte-native substrate; Solid = an RDF profile on top; RDF support advertised
  opt-in via storage-description metadata** — matches the artifacts: the storage description's `ContentNegotiation`
  capability (`lws10-core/Discovery.html`) advertises source→target media-type transformation (e.g.
  `application/ld+json` → `text/turtle`, `application/n-triples`), and `lws-media-type.md`: *"Servers are free to
  support additional media types (e.g., text/turtle) through content negotiation."* No formal WG resolution states
  the "Solid as profile" layering; treat it as design intent visible in the artifacts (and in the maintainer's own
  migration notes, §4.2).

---

## 3. The current WG draft: mechanisms + honest assessment

Sources: w3c/lws-protocol @ 4fa93ee (2026-06-29), the WDs, WG minutes, and the issue tracker.

### 3.1 Resource + container model

(`lws10-core/logicalresourceorganization.md`, `container-representation.md`, `Operations/metadata.md`)

- Resources are **Container or DataResource**; data resources are byte-bearing, format-unconstrained; RFC 9110
  framing ("does not limit the nature of a resource").
- **Containment is metadata, not URI structure**: *"clients SHOULD NOT assume that URI structure reflects
  containment"*; parent via `Link: rel="up"`; members via server-managed `items`. Integrity MUSTs: atomic
  membership updates, no orphans, no cycles, empty-or-`Depth: infinity` delete (409 otherwise). An OPTIONAL "move"
  (reparent via linkset update) was resolved out of PR #83 (https://www.w3.org/2026/04/28-lws-minutes.html).
- Container representation: **JSON-LD**, `@context: https://www.w3.org/ns/lws/v1`, media type
  `application/lws+json` ≡ `application/ld+json; profile="https://www.w3.org/ns/lws/v1"`;
  `id/type/totalItems/items{id,type,mediaType,size,modified}`; Link-header pagination (first/next/prev/last;
  opaque page URIs). Conneg MUSTs: `application/lws+json`, `application/ld+json`, `application/json` — same bytes,
  different Content-Type; Turtle MAY.
- Metadata = **RFC 9264 linksets** (`rel="linkset"`, `application/linkset+json`; System-managed / Core /
  User-defined categories; JSON Merge Patch mandatory; strict If-Match with 412/428). Auxiliary resources were
  redefined as a **role** discoverable via Link headers (PR #167, RESOLVED 8–0–1 on 2026-06-22,
  https://www.w3.org/2026/06/22-lws-minutes.html).

**Sound:** bytes-first; JSON-LD containers readable by both plain-JSON and RDF clients; linkset metadata; genuine
conditional-request discipline; pagination; the aux-resource-as-role model.
**Weak / open:**
- **Container-as-also-data-resource** is the most persistent unresolved contention (trait/mixin vs strict
  separation; ETag and conneg ambiguity — https://www.w3.org/2026/04/27-lws-minutes.html,
  https://github.com/w3c/lws-protocol/issues/126).
- Internal drift: `container.json` (F2F artifact) + searchindex ED use an embedded `ContainerPage`/`contains`
  shape vs the WD's flat `items`; `Operations/metadata.md` calls `up`/`items` client-manageable "Core Metadata"
  while `logicalresourceorganization.md` forbids client modification of `items`.
- The normative JSON-LD context `https://www.w3.org/ns/lws/v1` is still unpublished
  (https://github.com/w3c/lws-protocol/issues/60); the vocab DNOTE snapshot only landed 2026-06-29 (repo HEAD).
- Metadata-only containment costs the relative-URI/object-store affordances (argued in
  https://github.com/w3c/lws-protocol/issues/135); with multi-containment now out of scope for 1.0 the residual
  question is whether to *guarantee* URI-path alignment (the maintainer's own prototype assumes it — §4.2).

### 3.2 Operations + HTTP binding

(`operations.md`, `Operations/*.md`)

- Four abstract operations (create/read/update/delete) + an HTTP binding — deliberately transport-independent
  (rationale: https://github.com/w3c/lws-protocol/issues/24; UCS req. 28 "Loose Coupling").
- POST-to-container create (Slug hint; `Link: <lws#Container>; rel="type"` creates a container); GET/HEAD (Range
  MUST; ETag MUST); PUT/PATCH (JSON Merge Patch is the only mandatory PATCH format; If-Match discipline; **428 for
  unconditional PUT on ETag-supporting servers**); DELETE (empty-or-recursive w/ `Depth: infinity`). RFC 9457
  problem details SHOULD; 507 quota.

**Sound:** abstract/binding split; 428 hygiene; RFC 9457. **Gaps:** no idempotent create
(https://github.com/w3c/lws-protocol/issues/173 open; POST duplicate-retry hazard acknowledged in-spec); content
PATCH undefined for non-JSON types; resumable uploads only a capability example; Slug semantics under discussion
(https://github.com/w3c/lws-protocol/issues/94).

### 3.3 Authentication

(`lws10-core/Authentication.html` + the four suite WDs)

- Abstract **authentication credential** (tamper-evident subject/issuer/client/audience claims; asymmetric
  signature RECOMMENDED) validated by pluggable **authentication suites**, each with an IANA OAuth token-type URI.
  Suites are **optional profiles; servers advertise supported methods via WWW-Authenticate** (London Day 1,
  https://www.w3.org/2026/04/27-lws-minutes.html).
- Identity documents are **W3C Controlled Identifiers** (CID 1.0, Rec 2025-05-15, https://www.w3.org/TR/cid-1.0/):
  `sub` dereferences to a CID; the OIDC issuer binding is a CID `service` of type `lws#OpenIdProvider`
  (https://www.w3.org/TR/lws10-authn-openid/ §Validation) — the `solid:oidcIssuer` analogue.
- Suites: OIDC ID token (`sub`/`iss`/`azp`); SAML 2.0; self-signed JWT + CID (`sub==iss==client_id`, key via CID
  `verificationMethod`); self-signed JWT + did:key (key from the identifier).

**Sound:** issuer-agnostic, suite-pluggable, CID-based; self-signed suites give agents/bots first-class identity
(feeds the agentic roadmap directly). **Weak:** WebID-vs-CID ecosystem rift unresolved (#57, #96); SAML is
enterprise-appeasement in a 1.0 core set; no WebAuthn suite; privacy sections literally empty
(https://github.com/w3c/lws-protocol/issues/119).

### 3.4 Authorization

(`lws10-core/Authorization.html`; F2F artifacts `oct-meeting/*`)

- OAuth 2.0 baseline: 401 challenge `WWW-Authenticate: Bearer as_uri="…" realm="…"` → AS metadata at
  `/.well-known/lws-configuration` (RFC 8414 shape + `subject_token_types_supported`) → **RFC 8693 token
  exchange** (`subject_token` = authentication credential; `resource` = storage/realm) → **RFC 9068 `at+jwt`**
  (`sub/iss/client_id/aud/exp≤300s-recommended/iat/jti`) → presented **Bearer (RFC 6750)**.
- **Deliberately not sender-constrained.** The WG's published design summary: *"all token audiences are restricted and
  tokens are not sender constrained (no DPoP)"*
  (https://lists.w3.org/Archives/Public/public-lws-wg/2025Nov/0008.html). `grep -ri dpop` over the whole spec repo:
  zero hits; no issue/PR mentions DPoP. The replay defence is mandatory audience restriction + short lifetimes.
  The Ghent debate (token exchange essential-vs-optional; the argument made there: exchange fixes Solid-OIDC's
  ID-token-replay-by-malicious-RS flaw) is the PoP-adjacent argument
  (https://www.w3.org/2025/10/09-lws-minutes.html).
- Ghent F2F sketch adds **RFC 9396 `authorization_details`** in the token:
  `{type: lws#AccessRequest, locations, actions, datatypes, purposes}` (`oct-meeting/access-token.json`), with AS
  evaluating rich requests OR deferring policy evaluation to the RS.
- RS validation checklist: JWKS signature, `iss`, single-valued `aud` logically containing the target, temporal
  claims with skew.

**Sound:** RFC 8693 exchange cleanly decouples authentication from resource authorisation (and fixes a real
Solid-OIDC weakness); short-lived audience-bound at+jwt; RAR as the fine-grained carrier.
**Weak / divergence-worthy:**
1. Bespoke `as_uri` + `/.well-known/lws-configuration` duplicate **RFC 9728 OAuth Protected Resource Metadata**
   (Proposed Standard, 2025: `WWW-Authenticate … resource_metadata="…"` + `/.well-known/oauth-protected-resource`)
   and RFC 8414's registered well-known. Will read as NIH in wide review.
2. No optional sender-constrained profile exists even for high-value deployments — the WD's own Security
   Considerations enumerate theft/replay mitigations that PoP closes. (Given the maintainer's deliberate no-DPoP
   baseline — §4.2 — the clean-slate answer is an *optional negotiated* PoP profile, not a mandate.)
3. `aud` "exactly one value" vs the OIDC suite's multi-audience examples — internal inconsistency.

### 3.5 Access requests + grants

(`lws10-core/lws-access-requests.html`; merged via PR https://github.com/w3c/lws-protocol/pull/106)

- **ODRL-based** profile `lws#AccessProfile`: `AccessRequest`/`AccessGrant` JSON-LD documents; `access[]` with
  `action` (read/modify/create/delete), `assignee` (URI; `foaf:Agent` = public), typed `target` matchers
  (DataResource/Container/StorageResource), `constraint[]` (`purpose`/`client`/`mediaType`/`type`/`dateTime`).
- Endpoints are LWS containers advertised in the storage description (`AccessRequestService`/`AccessGrantService`,
  `conformsTo` profile URIs); POST create / GET list / DELETE revoke; LDN-style inbox notifications.
- A grant is a **record, not a token**: *"An agent does not present an access grant to a server as an
  authorization token"*; the server must reflect grant changes into its (out-of-scope) policy layer.

**Sound:** ODRL as request/grant lingua franca with purpose+client+time constraints = the consent-receipt shape
(UCS req. 18); grant-as-record keeps enforcement server-internal. **Open:** grants as source-of-truth vs interface
over a policy engine (contested between WG participants, https://www.w3.org/2026/04/27-lws-minutes.html;
https://github.com/w3c/lws-protocol/issues/144); "purpose"-into-constraints straw poll had no consensus (ibid.);
groups (UCS req. 5) and **sub-delegation** (UCS req. 14) unserved; permission-filtered listings scalability
(https://github.com/w3c/lws-protocol/issues/73). The maintainer's own PR #109 (see §4.3) shows exactly where he
wants this to go: strict ODRL (`odrl:Request`/`odrl:Offer`, permission/prohibition/obligation rules).

### 3.6 Discovery

(`lws10-core/Discovery.html`; F2F `oct-meeting/storage-metadata.json`; defined via PR
https://github.com/w3c/lws-protocol/pull/53)

- **Storage description resource**: JSON-LD, `id`/`type: Storage`/`capability[]`/`service[]{type,serviceEndpoint}`;
  bound via `Link rel="…lws#storageDescription"` on all storage GET/HEADs.
- Services: StorageDescription, NotificationService, TypeIndexService, TypeSearchService, AccessRequestService,
  AccessGrantService, URI-typed extension services. Capabilities: `PatchSupport` (per media type),
  `ResumableUploads`, **`ContentNegotiation` `{source, target[]}` — the RDF-transformation opt-in flag**.
- Live direction: remodel the storage description **as a CID document** (verificationMethod + services) — PR #183
  discussed 2026-06-29 (https://www.w3.org/2026/06/29-lws-minutes.html); the F2F artifact already has that shape;
  the notifications ED already resolves webhook signing keys from it.

**Sound:** the best part of the draft — one self-describing, key-publishing, service-enumerating, capability-
advertising document; exactly the opt-in surface the maintainer described. **Weak:** capability types are
un-registried examples (`https://feature.example/…`); no protocol-version `conformsTo`
(jeswr/federation-registry's `fedreg:StorageDescription` already does this); a generic-CID-tooling concern was
raised in the WG discussion on #183 (minutes ibid.).

### 3.7 Notifications (ED, unpublished)

(`lws10-notifications/index.html`)

- **Webhook-only for now** — by RESOLUTION: server-to-server first, server-to-client (SSE/streaming HTTP) later as
  a separate PR (London Day 2, https://www.w3.org/2026/04/28-lws-minutes.html; SSE auth issues were flagged in the
  discussion; another participant favoured streaming-HTTP simplicity; channel-integration PR #162 in discussion 2026-06-29).
- Subscription: authenticated POST (`type: WebhookSubscription`, `topic[]`, `inbox`, optional `expires`);
  container subscriptions **recursive**; read-authz enforced at subscribe AND delivery time (revocation narrows).
- Envelope: JSON-LD `Notification` wrapping **Activity Streams 2.0** Create/Update/Delete (`object{id,type}`,
  `target`/`origin`, `published`; `actor` omitted by default — privacy); batching allowed.
- Deliveries **signed with RFC 9421 HTTP Message Signatures** (`@method/@scheme/@authority/@path/content-type/
  content-digest` per RFC 9530; `keyid` resolves into the storage description's CID `verificationMethod`).

**Sound:** state-of-the-art server-to-server design (AS2 + signed webhooks + delivery-time authz + CID key
discovery). **Gap:** browser clients have nothing yet — the suite's offline/live-sync stack (solid-offline, PM live
views, WebSocketChannel2023 apps) needs the server-to-client binding the WG deferred; UCS req. 7 names push/SSE.

### 3.8 Search / type index (ED, unpublished)

(`lws10-searchindex/index.html`; type-index merged via PR #115; "most at risk" deliverable per London Day 1 minutes)

- `TypeIndexService` (paginated distinct-types list) + `TypeSearchService` (CNF filter over `type` + arbitrary
  *descriptive* link relations; GET and POST forms MUST be equivalent).
- Types derived server-side from **`Link rel="type"` headers at write time** (content parsing optional but
  equal-ranked when done); derivation eventually-consistent BUT **authorization filtering evaluated live on every
  request** (revocations take effect immediately; `totalItems` counts only the caller-visible view — anti-oracle);
  the indexed-relation set is deliberately un-enumerated (no discovery oracle).
- The WG is actively considering the **HTTP QUERY method (RFC 10008, Proposed Standard)** for this + notifications
  (https://github.com/w3c/lws-protocol/issues/184; PR #179; a WG participant cautioned against requiring QUERY —
  https://www.w3.org/2026/06/29-lws-minutes.html).

**Sound:** server-managed authz-filtered indexes kill Solid's chronically-absent client-maintained type indexes;
Link-header derivation preserves the never-parse-bodies invariant; the oracle-freedom discipline is excellent.
**Gap:** the deliberate expressiveness ceiling leaves UCS req. 15 (pod-level/federated SPARQL respecting ACLs)
wholly unmet — content-based query was declared "out of scope but not prohibited" at Ghent
(https://www.w3.org/2025/10/08-lws-minutes.html). That hole is exactly AC-SPARQL-shaped.

### 3.9 Vocabulary (ED)

`lws:` = `https://www.w3.org/ns/lws#`, context `…/ns/lws/v1` (unpublished, #60); classes Container/DataResource/
Storage/StorageDescription/OpenIdProvider/Notification/NotificationService/WebhookSubscription; reuses
`as:totalItems`, `as:mediaType`, `as:updated`, `schema:size`, `sec:` (CID), `ldp:inbox`. Generated by `yml2vocab`.

---

## 4. The maintainer's existing LWS signal (primary directional evidence)

These predate this task and show what he actually wants; the clean-slate proposal in §5 is anchored on them.

### 4.1 Inventory (jeswr namespace)

| Repo | Created | What it is |
|---|---|---|
| `jeswr/lws-keycloak` | 2025-11-07 | Full authn/authz prototype: Keycloak AS with custom SPIs (LWS token exchange, authentication-suite registry, storage trust manager), CID/DID resolver service, LWS storage server (RS) with enforcement, demo app, docker-compose e2e — plus `spec/authn.md` + `spec/authz.md`, his own precursor prose of the WD's auth chapters |
| `jeswr/lws-acp` | 2025-08-03 | Access-control-language design sketches: identity/equivalent-identity/property-based access, tokens/ZCaps, "permissions vs properties graph" separation, deny-free open-world leaning, "access hint" API idea |
| `jeswr/lws-ucs` | 2025-07-21 | His working fork of the UCS; 9 merged upstream PRs (requirement curation: group hierarchies, auditable-trail merge, controller clarification, versioning rename) |
| `jeswr/lws-protocol` | 2026-07-05 | Clean mirror fork (this task) |

### 4.2 What lws-keycloak reveals (the auth anchor)

His `spec/authz.md` + `ARCHITECTURE.md` establish, in his own words:

- **Keycloak/OAuth2 pipeline**: `/.well-known/lws-configuration` metadata → RFC 8693 token exchange (`resource`
  REQUIRED, populates `aud`; AS rejects unknown/untrusted storages) → RFC 9068 `at+jwt`
  (`sub/iss/client_id/aud/exp≤300s/iat/jti`) → **Bearer presentation** → RS-side validation checklist (JWKS, iss,
  single-`aud` logically containing the target, temporal). This is byte-for-byte the WD authorization chapter — he
  wrote the model he then edited into the WG draft.
- **His Solid-OIDC migration notes (authn.md) are explicit**: for clients — *"The use of DPoP is no longer
  required"*; audience-scoping via Resource Indicators (RFC 8707) or token exchange replaces it; *"The `webid`
  claim is no longer included … the `sub` claim is used"*. For OPs — *"DPoP is no longer required"*; *"the value
  `solid` should no longer be included in the `aud` claim"*; Solid Client-ID documents → **OAuth Client ID Metadata
  Document** (plain JSON, no JSON-LD/@context) — matching his upstream issue
  https://github.com/w3c/lws-protocol/issues/38. ⇒ The no-PoP baseline is HIS deliberate simplification, traded
  against mandatory audience restriction + ≤300 s lifetimes. Any clean-slate PoP story must be an *optional
  layered profile*, not a reversal of his baseline.
- **AS attestation with deferred evaluation**: the AS may attest intended actions ("RP: I plan to perform these
  actions" → AS: approved / *"deferred policy evaluation"*) — the two-mode RAR design later visible in the Ghent
  `authorization_details` artifact.
- **`storage_metadata` challenge parameter** (RECOMMENDED) pointing at the storage description — his instinct is
  already "RS 401 should hand you the metadata document", i.e. exactly the RFC 9728 shape (which standardises that
  parameter as `resource_metadata`). Adopting RFC 9728 is thus an *upgrade of his own design to the now-shipped
  standard*, not a divergence.
- **URI-containment realms**: *"For LWS implementations where lws:containment conforms with URI containment the
  `realm` will typically be an lws:StorageRoot"* — he anticipates path-aligned deployments (supports a
  path-alignment guarantee in the clean-slate core).
- **Privacy**: batch-issued single-use pseudonymous JWTs against RS correlation — keep this; it's ahead of the WD.

### 4.3 What his upstream activity reveals

- Authored the early core structure (discovery, logical organisation, resource identification sections; commits
  2025-06 in w3c/lws-protocol) and the WG's PR-etiquette process (merged PRs #29/#30).
- **PR #109 "Review and restructure Access Grant Proposal"** (closed into upstream #106): replace the flat
  `access` object with a **standards-compliant ODRL Policy** — `permission`/`prohibition`/`obligation` rules,
  `odrl:Request` for requests / `odrl:Offer` for grants, a REQUIRED `profile`
  (`lws#ODRLAccessProfile`), singular action+target per rule, `hasPurpose` → `odrl:purpose` constraint, new
  `lws:append` action via `odrl:includedIn`, JSON-LD context + framing specified
  (https://github.com/w3c/lws-protocol/pull/109). ⇒ The clean-slate grants chapter should be this PR, realised.
- Open issues #143 (ODRL profile as an access-control profile) + #142 (grants↔inbox relationship) are his.
- UCS curation PRs (#189–#221 window): group hierarchies, auditable-trail/delivery-receipt merge, versioning
  naming — he shaped the requirements list quoted in §2.3.

---

## 5. Proposed clean-slate architecture

Working name below: **JLWS** (placeholder — Open Question 1; must NOT squat `w3.org/ns/lws#`: mint
`https://w3id.org/jeswr/lws#`).

### 5.1 Design principles

1. **Byte-native substrate.** A resource is an opaque representation (bytes + media type); conformance never
   requires content parsing. All protocol-internal structure (containers, storage description, subscriptions,
   access documents) is JSON-LD-profiled JSON — plain-JSON clients parse it; RDF clients get triples free.
2. **No bespoke duplicates of shipped IETF/W3C standards.** RFC 9110/9111; RFC 8288; RFC 9264; RFC 7386; RFC 9457;
   **RFC 9728 (RS→AS discovery — replacing `as_uri`/`lws-configuration`)**; RFC 8414; RFC 8693; RFC 9068; RFC 8707;
   RFC 9396; RFC 9421/9530; RFC 10008 QUERY (optional); draft-ietf-httpbis-resumable-upload (capability); CID 1.0;
   AS2; ODRL 2.2.
3. **Maintainer-baseline auth, PoP as negotiated profile.** Baseline = his lws-keycloak/WD model (exchange →
   audience-restricted ≤300 s at+jwt → Bearer). Optional advertised profiles: DPoP (RFC 9449) and DPoP-SK
   (w3id.org/jeswr/dpop-sk/v1) for deployments needing sender-constraining or high-throughput PoP; negotiated via
   RFC 9728 RS metadata exactly as dpop-sk-spec already specifies.
4. **Capability-advertised everything** (RDF transformation, PATCH formats, resumable upload, query tiers,
   notification channels, versioning, multi-containment) — feature-detect the whole server from one signed
   CID-shaped document; capabilities carry `conformsTo` version URIs (fedreg convention).
5. **Enforcement internal; ODRL is the interchange** (requests, grants, receipts — per his PR #109 model).
6. **Fail-closed, oracle-free** (existence-hiding, live authz filtering on all derived views, count discipline —
   generalising the searchindex ED rules).
7. **Strict tree + guaranteed URI-path alignment in core** (restores relative-URI + object-store affordances;
   consistent with the WG's multi-containment-out-of-scope resolution AND his lws-keycloak realm note);
   multi-containment, if ever, is a capability.

### 5.2 Section-by-section design

- **Resource model:** Container / DataResource; auxiliary resources as *roles* (per merged #167). Containers are
  NOT simultaneously data resources (resolve WD contention #126 by fiat: strict separation; a "described container"
  gets its description via linkset/`describedby`, keeping ETag/conneg unambiguous).
- **Containers:** WD-compatible JSON-LD listing (flat `items`; Link-header pagination), fixing the
  ContainerPage/items drift. Membership strictly server-managed (resolve the metadata.md drift the same way).
- **Operations:** POST-create (Slug) + **PUT + `If-None-Match: *` idempotent create** (closes #173); GET/HEAD w/
  Range; PUT/PATCH w/ If-Match + 428; DELETE w/ Depth; optional linkset-mediated **move** (per London resolution).
  Per-media-type content-PATCH via `Accept-Patch` + PatchSupport capability. RFC 9457 required on all 4xx/5xx.
- **Authentication:** adopt the WD suite architecture + CID binding wholesale. Ship suites: OIDC, self-signed CID,
  self-signed did:key (all as WD), + a **WebAuthn suite** — port of jeswr/solid-webauthn-reauth's RFC 8693 wire
  contract (a passkey assertion as `subject_token`; that spec already defines the exchange profile). SAML left out
  of the core set (anyone can write a suite). Client identity = **OAuth Client ID Metadata Document** (his
  migration notes + issue #38).
- **Authorization:** RFC 9728 challenge (`resource_metadata`) + RFC 8414 AS metadata + RFC 8693 exchange +
  RFC 9068 at+jwt + **RFC 9396 `authorization_details`** carrying the granted ODRL policy reference, with the
  approved/deferred-evaluation duality from his authz.md. Presentation: Bearer baseline; DPoP / DPoP-SK advertised
  profiles (principle 3). Batch-issued single-use pseudonymous tokens as a privacy consideration (his authz.md §6.1).
- **Access requests/grants:** his PR #109 ODRL model (odrl:Request/odrl:Offer, permission/prohibition/obligation,
  `lws:append`), plus: grants MAY be issued as **W3C VCs** (solid-vc — the UCS req. 18 consent receipt);
  **delegation extension** = ODRL delegation chains (solid-odrl keystone + agent-authz-verifier semantics; serves
  UCS req. 6/14 which the WG punts); **groups** via a `GroupService` membership document (UCS req. 5 incl.
  hierarchies — his own UCS PR).
- **Notifications:** WD envelope (AS2 + JSON-LD) + RFC 9421-signed webhooks verbatim; ADD the deferred
  server-to-client bindings under the same subscription API: **`SseSubscription`** (`text/event-stream`,
  `Last-Event-ID` resumption; auth = token on subscribe → short-lived capability URL or `Authorization` header on
  the stream request — addressing the SSE-auth concern raised in the WG) and **`WebSocketSubscription`**
  (WebSocketChannel2023-shaped for Solid-stack continuity). WebTransport noted as future binding only.
- **Discovery:** CID-shaped storage description (per PR #183 direction + the F2F artifact): `verificationMethod` +
  `service[]` + `capability[]` + **protocol `conformsTo` version URIs**; a small registry of capability types in
  the spec namespace, extensible by URI.
- **Query (all optional, capability-advertised):** tier 1 = TypeIndex/TypeSearch as ED (offering both the GET/POST
  forms and an **HTTP QUERY (RFC 10008)** binding — sidestepping the WG's require-QUERY objection by making it
  an additional binding); tier 2 = **`SparqlQueryService`** — access-controlled SPARQL over RDF-readable resources
  (UCS req. 15; semantics = the AC-SPARQL design: per-solution authz filtering; PSS
  `docs/design/solid-server-rs-wac.md` + SPARQ); tier 3 (future) = LDF/TPF service type.
- **Versioning (optional capability):** `rel="version-history"` (RFC 5829) + Memento `Accept-Datetime` (RFC 7089)
  — cheap, standards-based (UCS req. 30).
- **Security & privacy:** RFC 9700 baseline + the threat-model appendix the WG hasn't started
  (https://github.com/w3c/lws-protocol/issues/177) + **SSRF discipline for every server-side fetch** (CID
  resolution, webhook inboxes: https-only, deny private/loopback/metadata ranges, no auto-redirect, size+time
  caps — the suite guarded-fetch policy; the WG has nothing on this and it is a real RS attack surface) +
  oracle-freedom rules + the whole-protocol-analysis point raised on the WG mailing list
  (https://lists.w3.org/Archives/Public/public-lws-wg/2025May/0001.html).

### 5.3 Deliberately NOT in the clean-slate core

SAML suite; multi-containment (capability at most, per WG resolution); a server-side policy *language* (enforcement
internal; ODRL grants are the interchange — WG position, and his); view-based sharing (WG: out of scope); UI
requirements; identity provisioning.

### 5.4 Spec outline (proposed section list)

1. Introduction; 2. Conformance (server/client classes per feature); 3. Terminology; 4. Resource model
(resources, containers, auxiliary roles, storage, path alignment); 5. Container representation + pagination;
6. Metadata (linksets); 7. Operations (abstract) + 8. HTTP binding (create/read/update/delete/move; conditional
requests; Range; problem details); 9. Authentication (credential model; suite registry; the four suites incl.
WebAuthn as sibling docs); 10. Authorization (RFC 9728 discovery; token exchange; access tokens; presentation
profiles: Bearer/DPoP/DPoP-SK); 11. Access requests & grants (ODRL profile; VC issuance; delegation; groups);
12. Discovery (storage description as CID; capabilities registry); 13. Notifications (envelope; webhook binding;
SSE binding; WebSocket binding); 14. Content transformation (the RDF opt-in profile — §6); 15. Query services
(type index/search; QUERY binding; SPARQL service); 16. Versioning capability; 17. Security considerations +
threat model; 18. Privacy considerations; 19. IANA/registry considerations; App. A JSON-LD context; App. B
vocabulary; App. C test-vector index.

---

## 6. The RDF-content-transformation opt-in (the bridge to Solid + the @jeswr RDF stack)

Extends the WD's `ContentNegotiation` capability (`lws10-core/Discovery.html`) into a precise contract:

1. **Capability declaration** (storage description), per source media type:
   ```json
   { "type": "ContentTransformation",
     "source": "text/turtle",
     "target": ["application/ld+json", "application/n-triples"],
     "profile": "https://w3id.org/jeswr/lws/transform/rdf-1" }
   ```
   The `rdf-1` profile pins semantics: RDF 1.1 abstract-syntax round-trip (same graph, no inference), JSON-LD
   serialised with a declared `@context` where present.
2. **Stored-representation authority.** The written byte stream is authoritative (byte-exact read-back, strong
   ETag). Derived representations are RFC 9110 conneg representations of the same resource: per-representation
   entity-tags, `Vary: Accept`; write preconditions evaluate against the authoritative representation's ETag
   (spelled out to kill the lost-update ambiguity Solid servers exhibit).
3. **Write-side:** servers MAY accept any transformable `source` type; MUST either store byte-exact or declare
   `"normalizes": true` so clients know read-back ≠ written bytes. RDF PATCH formats (SPARQL Update, N3 Patch)
   appear as PatchSupport entries only when the RDF profile is on (mirroring the WD Discovery example that pairs
   `text/turtle` with `application/sparql-update`).
4. **RDF-aware indexing:** with the capability on, the server MAY enrich TypeIndex/TypeSearch and the
   `SparqlQueryService` from parsed content — the searchindex ED's "MAY derive from content" hook becomes the
   well-defined RDF enrichment point.
5. **The Solid profile:** "Solid-on-JLWS" = a profile document requiring the RDF capability for
   `text/turtle` + `application/ld+json`; container listings are already JSON-LD (LDP-ish view for free); WAC/ACP
   mapped to ODRL grants (@solid/object wacToAcp/acpToWac precedent); Solid-OIDC mapped to the OIDC suite (+DPoP
   presentation profile). The substrate never has to know RDF — the maintainer's stated layering, realised.

Client-side, the existing stack consumes this unchanged: `@jeswr/fetch-rdf` (conneg+parse), `@solid/object`
(typed reads), `n3.Writer` (serialise); the capability flag lets clients feature-detect conneg before trying.

---

## 7. Alignment of the existing @jeswr spec/package portfolio

| Existing artifact | LWS alignment |
|---|---|
| **jeswr/lws-keycloak** | Already the AS+RS prototype of the baseline auth (§4.2); becomes the IT harness for the auth chapters and the second implementation for interop evidence. |
| **jeswr/lws-acp** | Seed material for the (non-core) policy-language companion; its "permissions vs properties graph" + access-hint ideas inform the enforcement guidance appendix. |
| **@jeswr/solid-dpop** | Client half of the optional DPoP presentation profile — htu/htm/ath over LWS URLs, zero changes. |
| **dpop-sk-spec** | The high-throughput PoP profile; its RFC 9728-based negotiation slots directly into the JLWS challenge flow (which is RFC 9728-native, unlike the WD). |
| **solid-webauthn-reauth(-spec)** | Already RFC 8693 token exchange — the same grant type LWS authorization mandates. Reframe as the **WebAuthn Authentication Suite** (passkey assertion as `subject_token`); its wire contract is ~90 % of the suite text. |
| **AC-SPARQL** (PSS `docs/design/solid-server-rs-wac.md` + SPARQ) | Becomes `SparqlQueryService` (§5.2 query tier 2) — the only credible answer to UCS req. 15, which the WG's TypeSearch ceiling deliberately does not meet. |
| **solid-odrl + solid-access-manager** | The WD grants ARE ODRL, and PR #109 shows the maintainer wants them stricter-ODRL. solid-odrl evaluates them; solid-access-manager is already the grant dashboard for this data model; the delegation keystone extends where the WG has nothing. |
| **solid-vc + agent-authz-verifier** | Grants-as-VCs (consent receipts, UCS req. 18); four-phase delegation-chain verification for agent access (UCS req. 14). |
| **a2a-rdf-extension** | Unchanged at its layer; agent protocol docs live as LWS resources with the RDF capability; the self-signed CID suite gives A2A agents native LWS identity. |
| **agentic-solid-note** | Layer-0 of the six-layer map gains the LWS substrate column (identity=CID, storage=LWS); AS-x staging re-baselined once JLWS exists. |
| **agentic-solid-conformance** | Its (input, operation, expected-verdict) vector methodology = the charter's "testing from earliest drafts" criterion; baseline to exceed: linkedwebstorage/test-suite's 27 MUST tests. |
| **federation-registry (`fedreg:StorageDescription`)** | Its storage-spec-version advertisement becomes the `conformsTo` field on the JLWS storage description; federations can index LWS storages natively. |
| **prod-solid-server / solid-server-rs** | Implementation targets. PSS: additive, flag-gated LWS surface later (CORE-PSS changes are maintainer-gated). solid-server-rs: the greenfield `feat/lws` branch (planned follow-up) — solid-oidc-verifier already does RFC 9068; SPARQ's access-control graph is precisely the internal enforcement layer the grant API obligates. |

---

## 8. Open design questions + pushback (for the maintainer's steer)

1. **Name + namespace.** Cannot use `w3.org/ns/lws#` or the unqualified LWS name. Options: "JLWS" @
   `w3id.org/jeswr/lws`; or a fresh name. And: is this a *personal editor's draft shaped for eventual WG
   contribution* (stay wire-compatible with lws10-core wherever it is sound) or a *competing design* (free to
   diverge)? **Recommendation: wire-compatible superset** — adopt containers/suites/exchange/ODRL-grants/webhooks
   as-is; diverge cleanly on: RFC 9728 discovery, idempotent create, SSE/WS channel, QUERY binding, RDF-profile
   precision, delegation/groups, WebAuthn suite, PoP presentation profiles.
2. **Editor-hat optics.** You edit the WG core spec; a published personal fork-spec will be read as a position
   statement. Publish openly, or keep private until steered? (Nothing W3C-side has been touched either way.)
3. **Containment guarantee.** Multi-containment is resolved out of v1.0 WG-side; the residual choice for JLWS core
   is **guaranteed URI-path alignment** (my proposal; matches your lws-keycloak realm note + object-store/relative-
   URI affordances) vs the WD's "URIs are independent of hierarchy". Confirm path alignment?
4. **PoP framing.** Your migration notes deliberately drop DPoP for the baseline. Proposal: keep your baseline
   (Bearer + `aud` + ≤300 s) and add DPoP / DPoP-SK as *advertised optional presentation profiles* via RFC 9728
   metadata. Confirm that framing (rather than PoP-mandatory)?
5. **Grants: source-of-truth or interface?** WG contention (#144): are grants authoritative or a view over an
   internal policy engine? Proposal: grants are the *authoritative interchange record*; enforcement realisation
   internal; deletion/revocation MUST be reflected in enforcement within a bounded interval, and the
   `SparqlQueryService`/TypeSearch MUST reflect revocation immediately (live-authz rule). Steer?
6. **Notifications client channel:** SSE-first (my proposal — HTTP-native, resumable, simplest server surface) or
   WebSocket-first (Solid continuity)? Ship both bindings?
7. **v1 scope:** core + authn + authz + discovery + notifications, with query (tier 2 SPARQL) and versioning as
   companion specs? (Companion recommended — mirrors WG modularity; the WG itself rates type-index "most at risk".)
8. **Resumable uploads:** normative reference to draft-ietf-httpbis-resumable-upload-11 (still an I-D, 2026-03-02)
   or informative-until-RFC?
9. **Container-as-data-resource:** I propose strict separation (resolves #126's ambiguities). You may prefer the
   trait model (the other side of the WG debate). Steer?
10. **Repo shape:** `jeswr/lws-spec` (ReSpec, dpop-sk-spec template) with `spec/` + `test-vectors/` in one repo, or
    spec and vectors split à la agentic-solid-conformance?

**Pushback stated plainly:** (a) minting `as_uri` + `/.well-known/lws-configuration` in 2026, when RFC 9728 +
RFC 8414 exist and your own prototype already reached for a `storage_metadata` challenge parameter, is the WD's
most obvious NIH liability — cheap, high-credibility fix. (b) The Bearer baseline is defensible given audience
restriction + 300 s lifetimes, but *within* that lifetime a stolen token replays freely against its own storage —
an optional PoP profile is the honest answer for medical/financial UCS cases and costs nothing when off. (c) The
UCS promises SPARQL query, consent receipts, sub-delegation, groups, E2EE, versioning — the WD roadmap covers none
of these; a clean-slate spec that composes your existing solid-odrl/solid-vc/AC-SPARQL/dpop-sk work is the fastest
credible route to "the UCS, actually met". (d) The WG's own timeline says CR Fall 2026 / TR Fall 2027 — a personal
spec that ships sooner, with vectors and two implementations (lws-keycloak + solid-server-rs), is also useful WG
input if you ever choose to contribute it.

---

## 9. Follow-up build steps (post-steer, for a builder agent)

*(Step 1 has since been done — this repository. The remaining steps are tracked in
`docs/OPEN-QUESTIONS.md` "Follow-ups queued behind these answers".)*

1. **Scaffold `jeswr/lws-spec`** (name per OQ1): ReSpec ED (dpop-sk-spec template), `.roborev.toml`,
   `ignore-scripts`, gate, `suite.json`, AUTHORED-BY provenance (standard new-repo checklist). Sections per §5.4;
   §6 RDF profile as its own chapter; conformance IDs from day 1.
2. **Test vectors** (agentic-solid-conformance format): container listing + pagination; conditional-request matrix
   (If-Match / If-None-Match:* / 428); token-exchange accept/reject paths; RFC 9728 challenge parse; DPoP + DPoP-SK
   profile vectors; ODRL grant evaluation (reuse solid-odrl's delegation vectors); RFC 9421 webhook signature
   verify; SSE resumption. Baseline to exceed: linkedwebstorage/test-suite (27 MUST tests).
3. **solid-server-rs `feat/lws` branch:** container JSON-LD + linkset metadata + RFC 9728 challenge +
   exchange-token verification seam (solid-oidc-verifier already does RFC 9068; add the AS side via lws-keycloak
   in IT) + storage-description endpoint; SPARQ = enforcement + `SparqlQueryService`.
4. **prod-solid-server:** nothing pre-steer (CORE-PSS is maintainer-gated). Candidate later: additive flag-gated
   LWS storage description + container-JSON-LD surface beside the Solid surface.
5. **`@jeswr/lws-client`** (fetch-rdf-composed; capability feature-detection from the storage description) once
   the spec stabilises.

---

*Forks recorded: jeswr/lws-protocol (created 2026-07-05, clean mirror), jeswr/lws-ucs (pre-existing maintainer
fork of w3c/lws-ucs). The brief has landed, as intended, as `docs/DESIGN-BRIEF.md` in this spec repo.*
