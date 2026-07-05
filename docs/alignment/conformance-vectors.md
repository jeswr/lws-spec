<!-- AUTHORED-BY Claude Fable 5 -->

# Alignment: agentic-solid-conformance × JLWS — the composition vector plan

**Spec aligned:** [agentic-solid-conformance](https://github.com/jeswr/agentic-solid-conformance)
(the shared conformance test-vector suite: language-neutral golden
`(input, operation, expected)` cases; 56 cases across odrl-delegation /
agent-authz-credential / a2a-rdf).

## 1. Composition verdict: the shared conformance FABRIC — (d) independent, adopted by format

agentic-solid-conformance is not a protocol; it is the **measurability artifact** ("make
the second independent implementation measurable"). JLWS already composes with it in the
deepest way available: this repo's `test-vectors/` suite (125 cases) is **written in its
format** (per-case clause pins, `anyOf`/`errorOneOf`, `preconditions`, `GAPS.md`,
committed TEST-ONLY keys — D20), and `index.html#test-vectors` names it as the format
source. The alignment work is therefore not a relationship section but a **division of
labour + the new composition vector families** the other five alignments call for.

## 2. Division of labour (the homing rule)

One rule decides where a vector lives, and it falls out of what the system-under-test is:

| System under test | Home |
|---|---|
| The JLWS **server/AS surface** (HTTP shapes, storage description, PRM, token validation, query gating) | `lws-spec/test-vectors/` (this repo; the `feat/lws` runner drives it over `build_router` — `src/lws/mod.rs` vector notes) |
| A **pure agent-layer function** (chain evaluation, credential verify, PD hashing/codec) | `agentic-solid-conformance/vectors/` (reference-impl-extracted verdicts, per its README methodology) |

This keeps agentic-solid-conformance's extraction methodology intact (verdicts extracted
from pinned reference implementations) and this repo's D20 inversion intact (spec-derived
verdicts pending the first implementation) — the two provenance models never mix inside
one suite.

## 3. The new vector families (consolidated from the five alignments)

### 3.1 In `lws-spec/test-vectors/` (this repo)

| Suite | Cases | Source alignment | Gate |
|---|---|---|---|
| `vectors/ac-sparql/` (new) | 8 — gating (2, buildable now), GET-equivalence ± (2), revocation-immediate, counts-visible-only, service-description oracle-freedom, UDG-opt-in discipline | [ac-sparql.md §3](./ac-sparql.md) | impl gated on `sparq#992` (discovery pair buildable now) |
| `vectors/dpop-sk/` (new) | 8 — PRM shape (3), establishment `none`-binding, attestation accept/bad-sig/replay/expired | [dpop-sk.md §3](./dpop-sk.md) | none (deterministic; narrows the GAPS.md `core#rs-validation` deferral, leaving only `tls-exporter`) |
| `vectors/auth/` (extend) | +4 — webauthn bundle decode ok / non-canonical-b64url reject, suite advertisement, issued-token-never-bare | [webauthn-reauth.md §3](./webauthn-reauth.md) | none |
| `vectors/discovery/` (extend) | +1 — `sd-agent-interaction-service` extension-entry parse + forward-compat | [a2a-rdf.md §3](./a2a-rdf.md) | the config-gated SD entry (trivial) |

Bookkeeping on landing each suite: update `test-vectors/manifest.json`
(`caseCount`/`suiteCount`/suite entry), re-run `node test-vectors/tools/check.mjs`
(clause-pin ids must exist in the spec HTML — pins into companion specs cite their repo +
anchor in `source`, as the a2a-rdf suite already does for its spec), and update `GAPS.md`
rows the new vectors retire (notably the DPoP-SK row).

### 3.2 In `agentic-solid-conformance` (extend `vectors/a2a-rdf/`)

| Case | What it proves | Gate |
|---|---|---|
| `pd-hash-stable-across-representations` | RDFC-1.0 protocol hash is representation-independent across an rdf-1-faithful Turtle↔JSON-LD pair | none (pure function; `@jeswr/solid-a2a` published) |
| `pd-hash-rejects-graph-change` | a one-triple graph delta breaks the pin regardless of serialization | none |

These follow that repo's extraction methodology (verdicts reproduced from
`@jeswr/solid-a2a`), so they belong there, not here.

### 3.3 Explicitly NOT vectored (and where that's recorded)

- DPoP-SK `tls-exporter` channel binding — needs a live TLS exporter; stays in `GAPS.md`.
- The WebAuthn OP-side verification matrix (origin/signCount/challenge-replay/coarse
  `invalid_grant`) — AS behaviour; belongs to `solid-webauthn-reauth-spec`'s own planned
  vectors once that repo publishes.
- AC-SPARQL's full dataset-mapping/syntax surface — belongs to a future
  `solid-sparql-query` suite; this repo vectors only the composition (gating, discovery,
  shared invariants).
- SSE resumption/reset — already in `GAPS.md` (stateful/behavioural), unchanged.

## 4. `feat/lws` implementation seam

The vector **runner**: `src/lws/mod.rs` already specifies the mechanism ("a vector-runner
needs only `tower::ServiceExt::oneshot` per vector — `tests/lws_http.rs` is … the template
for the runner"). The new suites reuse it unchanged; the `dpop-sk` suite additionally
needs the runner to hold session state across a case's establishment→attestation request
pair (a two-step case shape the format's `input` object can carry as an ordered request
array — the same shape the auth suite's exchange fixtures already imply).

## 5. Sequencing

Vectors land **with** their implementation increment (never ahead of the gating impl,
except spec-derived discovery-shape cases, which D20 permits to precede implementation):
dpop-sk + webauthn + discovery extensions ride increments A–C (buildable now); the
ac-sparql suite rides increment D (`sparq#992`). The agentic-solid-conformance a2a-rdf
extension is independent and can land immediately.
