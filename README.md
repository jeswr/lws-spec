<!-- AUTHORED-BY Claude Fable 5 -->
# lws-spec — JLWS: a Fable AI re-write of Linked Web Storage, as an experiment

> ### ⚠️ This is an EXPERIMENT — an AI (Claude **Fable 5**) re-write of Linked Web Storage.
> It was **written by an AI agent** as a clean-slate exploration, published here **only as an
> experiment**. It is **NOT** a W3C deliverable, **NOT** a work item, and **NOT** a position of
> the W3C Linked Web Storage Working Group or of any individual. It is a personal experiment in
> the `jeswr/` namespace, tags no one, and requests nothing of anyone. Treat it as an
> AI-generated design study, not a standard.

A **Fable (AI) re-write** of the Linked Web Storage design, in complete normative form, over the
ground the LWS WG's Working Drafts cover partially — offered as input to that group only if and
when its human editor chooses. The working name **JLWS** and the `https://w3id.org/jeswr/lws#`
namespace are placeholders (see `docs/OPEN-QUESTIONS.md` Q1); nothing is minted under `w3.org`.

**Status: PUBLISHED AS A PUBLIC EXPERIMENT** (maintainer-authorised, 2026-07-05). It remains an
AI-authored draft **awaiting review by the human editor**; the open questions in
`docs/OPEN-QUESTIONS.md` (esp. namespace + posture) are still live.

## What it is

- **`index.html`** — the **JLWS Core Protocol** (ReSpec; open locally — ReSpec loads from
  w3.org). A *wire-compatible superset* of the LWS WD (lws10-core, WD 2026-06-22): it keeps the
  WD's sound mechanisms verbatim (byte-native resources; containment-as-metadata; JSON-LD
  container listings; RFC 9264 linkset metadata with strict If-Match/428 discipline;
  POST-create/Slug; Range MUST; `Depth: infinity` delete; the RFC 8693
  exchange → audience-restricted ≤300 s at+jwt → Bearer authorization chain prototyped in
  `jeswr/lws-keycloak`) and diverges only on identified gaps: RFC 9728 discovery replacing the
  bespoke `as_uri`/`lws-configuration`; idempotent `PUT + If-None-Match: *` create; strict
  container ≠ data-resource separation; guaranteed URI-path alignment; CID-shaped storage
  description with `conformsTo` version URIs and a real capability registry; SSE + WebSocket
  notification bindings beside the signed-webhook binding; a WebAuthn authentication suite;
  optional negotiated proof-of-possession presentation (DPoP / DPoP-SK) over the Bearer
  baseline; strict-ODRL access requests & grants (the editor's upstream PR #109, realised) with
  VC receipts, delegation, and groups as extensions; and a normative SSRF + oracle-freedom +
  threat-model security section. Every divergence is marked inline and registered in the spec's
  Divergence Register appendix.
- **`rdf-transform.html`** — the **JLWS RDF Content Transformation Profile**: the opt-in that
  makes a byte-native storage RDF-aware. Per-media-type `ContentNegotiation` capability entries
  pinned to `https://w3id.org/jeswr/lws/transform/rdf-1`; RDF 1.1 abstract-syntax round-trip
  semantics; authoritative-bytes + per-representation ETags + precondition rules killing the
  Solid lost-update ambiguity; a `normalizes` flag for parse-on-ingest stores; RDF PATCH only
  when the profile is on; the index/query enrichment hook; and the informative
  **Solid-on-JLWS** mapping (Solid as a profile on top of the substrate).
- **`DECISIONS.md`** — the four adopted steer defaults + every WD divergence and repo-shape
  decision (D1–D20), each with rationale and primary-source citations, for the maintainer's
  review/correction.
- **`docs/OPEN-QUESTIONS.md`** — the 10 open questions carried from the research brief,
  split UNANSWERED/GATING (name+namespace, publication, container-as-data-resource, resumable
  uploads) vs adopted defaults.
- **`docs/DESIGN-BRIEF.md`** — the research foundation (primary-source-cited survey of the WG,
  its drafts, minutes, issues, and the maintainer's own prior LWS artifacts).
- **`test-vectors/`** — the **conformance test-vector suite**: 150 language-neutral
  (input, operation, expected-outcome) cases across 10 suites in the
  `agentic-solid-conformance` format, each pinning normative clauses by spec section id;
  JSON cases with Turtle/JSON-LD/N-Quads fixtures plus real signed EdDSA at+jwt, RFC 9421
  webhook, DPoP-SK hmac-sha256 attestation, and WebAuthn assertion-bundle fixtures; a
  `GAPS.md` inventorying the un-vectorable normative statements. Includes the composition
  suites from `docs/alignment/`: `dpop-sk`, the WebAuthn wire-contract cases, the a2a-rdf
  `AgentInteractionService` discovery pair, and the rdf-1 advertisement contract. The
  expected verdicts are spec-derived (no reference implementation exists yet — see the suite
  README's provenance note); this suite is the conformance target the first implementation
  (the planned `solid-server-rs` LWS work) builds to.
- **`index.statements.ttl`** / **`rdf-transform.statements.ttl`** — the **machine-readable
  normative-statement companions** (the `jeswr/spec-companion` format: W3C `spec:` requirement
  markup as a sidecar graph + the E / A-int / A-exist / P testability spine). One
  `spec:Requirement` per BCP 14 statement — stable id, verbatim validator-checked quote,
  canonical RFC 2119 level, conformance-class binding, section anchor — wired to its
  test-vector case(s) where one exists and to an honest `sc:testGap` where none does, so each
  companion doubles as the **test-suite requirement index** (statements with gaps = the vector
  backlog). Keywordless normative clauses are catalogued as `sc:extractionNote` errata
  candidates rather than dressed up as statements. The full-text specs stay the normative
  documents; the companions are derived sidecars, re-extracted in the same commit as any
  normative-text change.

Companion specs planned (slots reserved in the core): query services (TypeIndex/TypeSearch +
access-controlled SPARQL), versioning (RFC 5829 + Memento), and the full Solid-on-JLWS
profile.

## Gate

Spec-only repo: no build. The gate is HTML well-formedness of the two ReSpec docs plus the
test-vector consistency check (manifests ↔ cases ↔ clause pins ↔ fixtures ↔ signatures; the
vectors are generator output — edit `test-vectors/tools/suites/*.mjs` and regenerate, never
the emitted files):

```sh
node tools/check-html.mjs index.html rdf-transform.html
node test-vectors/tools/check.mjs
node test-vectors/tools/generate.mjs   # regenerate; git diff must stay clean
# statement companions (validator + shapes live in jeswr/spec-companion):
node <spec-companion>/tools/validate.mjs index.statements.ttl --spec-html index.html
node <spec-companion>/tools/validate.mjs rdf-transform.statements.ttl --spec-html rdf-transform.html
```

(stdlib-only tag-balance + structure check; Node ≥ 20). Plus roborev on every commit
(`.roborev.toml`, codex reviewer).

The check is **structural only** — tag balance, required ReSpec section ids, internal-link
targets. It does not execute ReSpec, so a biblio typo or config error that breaks the render
would pass it. Before any publication (`docs/OPEN-QUESTIONS.md` Q2), the gate must grow a real
ReSpec render smoke-test (`respec2html` / a headless browser render of both documents); this is
queued with the publication follow-ups in `docs/OPEN-QUESTIONS.md`.

## Provenance

Drafted with AI assistance (**Claude Fable 5**, Anthropic) from the W3C LWS WG's published
drafts and repository (`w3c/lws-protocol @ 4fa93ee`), the WG's minutes and issue tracker, the
maintainer's own prototypes (`jeswr/lws-keycloak` spec prose, `jeswr/lws-acp`, upstream PR
#109), and the IETF/W3C primary sources cited throughout. **Awaiting review by the human
editor (Jesse Wright).** See each spec's SOTD.
