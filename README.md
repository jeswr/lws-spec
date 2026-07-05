<!-- AUTHORED-BY Claude Fable 5 -->
# lws-spec — JLWS: a clean-slate Linked Web Storage design (personal, experimental)

A **personal, experimental specification draft** in the `jeswr/` namespace. It is **not** a
deliverable, work item, or position of the W3C Linked Web Storage Working Group or of any other
group, tags no one, and requests nothing of anyone. It exists to explore — in complete,
normative form — a clean-slate design over the ground the LWS WG's Working Drafts cover
partially, and to be offered as input to that group only if and when its editor chooses.

**Status: LOCAL AND UNPUBLISHED.** Publication is the maintainer's explicit call and he has not
yet made it (see `docs/OPEN-QUESTIONS.md` Q2). This repository intentionally has no public
remote. The working name **JLWS** and the `https://w3id.org/jeswr/lws#` namespace are
placeholders (Q1); nothing is minted under `w3.org`.

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
- **`DECISIONS.md`** — the four adopted steer defaults + every WD divergence (D1–D19), each
  with rationale and primary-source citations, for the maintainer's review/correction.
- **`docs/OPEN-QUESTIONS.md`** — the 10 open questions carried from the research brief,
  split UNANSWERED/GATING (name+namespace, publication, container-as-data-resource, resumable
  uploads) vs adopted defaults.
- **`docs/DESIGN-BRIEF.md`** — the research foundation (primary-source-cited survey of the WG,
  its drafts, minutes, issues, and the maintainer's own prior LWS artifacts).

Companion specs planned (slots reserved in the core): query services (TypeIndex/TypeSearch +
access-controlled SPARQL), versioning (RFC 5829 + Memento), the full Solid-on-JLWS profile, and
the test-vector suite (agentic-solid-conformance format).

## Gate

Spec-only repo: no build. The gate is HTML well-formedness of the two ReSpec docs:

```sh
node tools/check-html.mjs index.html rdf-transform.html
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
