<!-- AUTHORED-BY Claude Fable 5 -->
# Open questions for the maintainer — lws-spec

Carried forward from the research brief (`docs/DESIGN-BRIEF.md` §8). The draft was built on the
brief's recommended options per the proceed-without-greenlight rule; every one of these is
reversible on your steer. Items marked **UNANSWERED / GATING** need your call before the next
step they gate; the rest are adopted defaults you can correct at review.

## UNANSWERED / GATING

1. **Name + namespace confirm.** Working name "JLWS" and namespace
   `https://w3id.org/jeswr/lws#` (context `https://w3id.org/jeswr/lws/v1`, profiles under
   `https://w3id.org/jeswr/lws/…`) are placeholders. NB the suite's persistent-ID rule
   (maintainer directive 2026-07-06): NO w3id PR — persistent IDs serve from `jeswr.org`
   (`jeswr.org/ns/*` / `jeswr.org/spec/*` via the `jeswr/portfolio` redirect layer), and the
   as-minted `w3id.org/jeswr/*` IRIs here are legacy identifiers that re-mint to `jeswr.org`
   per that scheme's staged migration. Confirm the name, then the re-mint is the follow-up.
   Also the posture question: *personal editor's draft shaped for eventual WG contribution*
   (the draft is built this way — wire-compatible superset, S1) vs *competing design* (would
   free further divergence).

2. **Publication — RESOLVED 2026-07-05** (maintainer-authorised): published as a PUBLIC
   EXPERIMENT at `github.com/jeswr/lws-spec` with the crystal-clear Fable-AI-rewrite framing
   (commit `fcaa174`; see the README banner + each spec's SOTD). Still open within this item:
   the GitHub Pages render + `edDraftURI`, and the ReSpec render smoke-test the README's Gate
   section queues as a pre-Pages follow-up. No one is tagged anywhere, per the directive.

3. **Container-as-data-resource.** The draft resolves WD #126 by strict separation (DECISIONS
   D3): a container's only representation is the server-managed listing; description attaches
   via `describedby`. You may prefer the trait/mixin model (the other side of the
   WG debate). If so, D3 and the ETag/conneg text in core §Resource model need rework.

4. **Resumable uploads.** `draft-ietf-httpbis-resumable-upload` is still an I-D. The draft
   lists the `ResumableUploads` capability with the reference marked informative-until-RFC
   (core §Capability registry). Confirm informative, or make it normative-at-a-pinned-draft.

## ADOPTED DEFAULTS (correct at review)

5. **Path-alignment guarantee** (brief OQ3; DECISIONS D4). Adopted: guaranteed URI-path
   alignment, containment still metadata. Your lws-keycloak realm note points this way; the WD
   says URIs are hierarchy-independent. Confirm alignment.

6. **PoP framing** (brief OQ4; DECISIONS S2/D9). Adopted: your Bearer + `aud` + ≤300 s baseline
   stands; DPoP / DPoP-SK are optional advertised presentation profiles via RFC 9728; servers
   MAY require PoP per-realm. Confirm this framing (vs PoP-mandatory or PoP-absent).

7. **Grants: source-of-truth vs interface** (brief OQ5; DECISIONS D15). Adopted: grants are
   the authoritative interchange *record*; enforcement realisation internal; revocation MUST
   reach enforcement within a bounded documented interval and derived views immediately.

8. **Notifications client channel** (brief OQ6; DECISIONS D6). Adopted: ship BOTH SSE and
   WebSocket bindings (SSE carries the resumption story; WebSocket carries Solid-stack
   continuity). Alternatives: SSE-only first, or WebSocket-only.

9. **v1 scope split** (brief OQ7; DECISIONS S3). Adopted: substrate-only core; RDF transform
   drafted as a companion (`rdf-transform.html`); query (TypeIndex/TypeSearch + AC-SPARQL
   SparqlQueryService) and versioning (RFC 5829 + Memento) are planned companions with slots
   reserved in the core.

10. **Repo shape** (brief OQ10; DECISIONS D19/D20). Adopted: one repo (`lws-spec`) holding
    the spec docs and the now-landed `test-vectors/` suite (154 cases across 10 suites,
    self-contained under one directory), dpop-sk-spec template. Alternative remains open: split the vectors into
    their own repo à la agentic-solid-conformance — a directory move, cheap to do on your
    steer.

## Follow-ups queued behind these answers

- w3id.org redirect PR for `jeswr/lws` (behind Q1).
- Public repo + push + Pages (behind Q2).
- ReSpec render smoke-test added to the gate (behind Q2, required before publication):
  `respec2html` or a headless-browser render of `index.html` + `rdf-transform.html` —
  `tools/check-html.mjs` is structure-only and cannot catch a broken render.
- Deferred test-vector tranches (`test-vectors/GAPS.md` marks each "vectorable, deferred":
  self-signed-CID/did:key suite validation, RDF PATCH application, parser bombs, groups,
  pagination, client-side conduct) + an implementation-pinned consistency runner once the
  first implementation passes the landed 154-case suite.
- `solid-server-rs` `feat/lws` branch (container JSON-LD + linksets + RFC 9728 challenge +
  exchange-token verification seam + storage description; lws-keycloak as the AS in IT),
  implemented TO the landed `test-vectors/` suite as its conformance target.
- Query + versioning companion drafts; full Solid-on-JLWS profile companion.
- Alignment pass over the existing @jeswr portfolio (brief §7 table) once naming is settled.
