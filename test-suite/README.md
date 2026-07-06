<!-- AUTHORED-BY Claude Fable 5 -->

# JLWS executable conformance suite

The W3C-style **executable test suite** for the two JLWS specs: a runner that plays the
committed [`../test-vectors/`](../test-vectors/) against a **target server URL** and produces a
**per-normative-statement** pass / fail / untested report — JSON plus a generated markdown
scoreboard — keyed to the statement IDs of the machine-readable companions
([`../index.statements.ttl`](../index.statements.ttl),
[`../rdf-transform.statements.ttl`](../rdf-transform.statements.ttl)). The companions are the
**requirement index**: the suite never re-derives requirements from the spec text, and a vector
is only ever reached through a statement's `spec:testCase` wiring.

## Run it

```sh
cd test-suite
npm install          # one dependency (n3, for the statement companions)

# against any server:
node bin/run.mjs --target http://localhost:3000 --label "my server"

# with a target config + committed report files:
node bin/run.mjs --config targets/css-baseline.json --target http://localhost:3988 \
  --out-json reports/my-run.json --out-md reports/my-run.md

# self-tests (assertion vocabulary, companion parse, planning honesty,
# end-to-end against strict + lenient in-process mocks):
npm test
```

Flags: `--target <url>`, `--config <path>`, `--label <text>`, `--baseline-note <text>`,
`--out-json` / `--out-md`, `--only <case-id-prefix>`, `--quiet`, `--strict` (exit 1 when an
executed MUST/MUST NOT-level statement fails — for CI over a real JLWS implementation; a
baseline run over a non-JLWS server stays exit 0), and `--controller-bearer <token>` (bearer
credential for storage-controller requests — a per-run credential belongs on the command line,
never committed inside a `targets/*.json`; a fail-closed target like `solid-server-rs` needs it
for the harness to realise state at all). Value-taking flags are **presence-checked and
fail-closed** (`lib/cli.mjs`): a flag given without a value is a hard error, and
`--controller-bearer ""` is rejected by config validation — a malformed credential can never
silently downgrade the run to anonymous/config credentials. **Local servers only** — never
point the suite at a production deployment: it creates and deletes real resources under
`<target>/jlws-<runid>/…`.

### Target configuration (`targets/*.json`)

See [`lib/config.mjs`](./lib/config.mjs) for the schema. Everything defaults conservative:

- `features` / `capabilities` / `conformsTo` — the optional surfaces the target genuinely
  provides (vector `preconditions` and `state.capabilities` are matched against these).
  Declaring nothing skips those vectors conformantly; declaring something you don't implement
  will fail honestly. A vector that pins an **explicitly empty** declaration
  (`"state": { "capabilities": [] }` — the transform-off vectors) is unrealisable against a
  target that declares that surface: a black-box harness cannot toggle a declared capability
  off, so those report as skipped, never as false failures.
- `agents` — the **auth seam**: `{ "<agent-uri>": { "bearer": "<token>" } }`. Requests whose
  vector authenticates as an agent send that bearer token; unauthenticated mode (no agents,
  the default) runs everything that needs no credentials. A DPoP-fetch seam and an
  `accessRealizer` for `state.access` maps (e.g. writing WAC ACLs on a Solid target) are
  follow-up seams — cases needing them are reported unrealisable, never guessed.
- `controllerBearer` — optional credential for storage-controller requests.

## What executes, what doesn't — the honesty model

The report classifies every one of the companions' statements (242 today), never silently
dropping one:

| Category | Meaning |
|---|---|
| `pass` / `fail` | executed against the target through its wired `http-exchange` vector(s); fail dominates |
| `untested (state/agent not realisable)` | the vector's declared `state` needs an injection seam a black-box target doesn't offer (pinned clocks, trusted issuers, PoP sessions, quotas, notification services, mtimes) — the test-vectors README's state-realizability rule |
| `skipped (optional feature)` | `preconditions` name a feature the config doesn't declare — a conformant skip |
| `untested (library-level vector)` | the vector's operation is one of the fifteen pure decision seams (`validate-access-token`, `evaluate-access`, `transform-representation`, …) an implementation binds **in-process**; a black-box HTTP harness cannot execute it honestly |
| `external-suite` | covered by an external suite adopted by reference (e.g. the odrl-delegation vectors in `agentic-solid-conformance`) |
| `no-vector` | enforceable but not yet vectored — the companion's `sc:testGap` backlog |
| `evidence-check` | audit-class (**A-int / A-exist**): satisfied by implementation evidence/attestation, never by a vector |
| `premature` | **P**: the spec marks the surface not yet testable |
| `not-applicable` | binds a non-server conformance class (Client, AuthorizationServer, RdfAwareClient, WebhookReceiver, the client/AS-authored document classes) — a server harness cannot hold those to account |

Only **server-deniable, enforceable (E)** statements ever count toward the executed headline.
An `untested` row is *never* a pass; a skipped precondition is *never* a fail. SHOULD/MAY
failures are reportable, not disqualifying (W3C practice).

Setup/teardown is per-case: each vector's declared `resources` state is realised under a fresh
`<target>/jlws-<runid>/<seq>-<case>/` scope (created with `PUT + If-None-Match: *`, torn down
deepest-first afterwards, best-effort). Case-space URIs (`https://storage.example/alice/…`)
are mapped onto that scope in requests, in setup resource **text content** (the byte-exact
vectors embed self-referential IRIs; base64 content is binary-precise and never rewritten),
**and** in expected values, so servers echoing absolute URIs compare correctly. Request paths are sent raw (no URL normalisation) so the
path-traversal vectors reach the server unmangled, and redirects are never followed.

## Reading a baseline scoreboard

[`reports/css-baseline-2026-07-06.md`](./reports/css-baseline-2026-07-06.md) is the committed
**CSS baseline**: Community Solid Server 7.1.9 (in-memory, unauthenticated,
`npx @solid/community-server@7`) scored against the clean-slate spec. CSS does not implement
JLWS, so its failures are **findings about the delta** between today's Solid/LDP behaviour and
the JLWS design — not CSS bugs, and the vectors were not weakened to make CSS pass. The
headline (7/37 executed MUST statements pass) quantifies exactly which JLWS obligations an
existing Solid server already meets (byte-exact round-trips, Range, `If-None-Match: *`
create/412, conditional GET, HEAD mirror, slug conflict handling, 404-for-missing) and which
are clean-slate divergences (the strict 428/precondition discipline, RFC 9457 problem details,
the required link set incl. `rel="up"` + linkset + storage description, JSON-LD container
listings, RFC 9264 linkset metadata, POST container creation semantics, 204-on-delete). The
same interpretation applies to any non-JLWS target you point the suite at.

For a **real JLWS implementation** the goal is the inverse: every executed MUST-level
statement passes (`--strict` gates exactly that), `untested (library-level)` statements are
covered by binding the abstract operations in that implementation's own test suite, and
`evidence-check` rows are answered in its conformance documentation.

### Reproducing the solid-server-rs scoreboard

[`reports/solid-server-rs-baseline-2026-07-06.md`](./reports/solid-server-rs-baseline-2026-07-06.md)
is the first run against a target that **claims** JLWS conformance: `solid-server-rs`
(EXPERIMENTAL, branch `feat/lws` — the exact sha is in the report header). That server's WAC is
fail-closed, so the run needs an **authenticated storage controller**: a committed local mock
authorization server ([`tools/mock-as.mjs`](./tools/mock-as.mjs), stdlib-only, loopback-bound)
serves OIDC discovery + JWKS and mints the RFC 9068 `at+jwt` Bearer token the server's LWS auth
chain verifies. The committed target config
([`targets/solid-server-rs.json`](./targets/solid-server-rs.json)) stays **credential-free** —
the token is minted per run and passed via `--controller-bearer`. Three local processes:

```sh
# 1. the mock AS (discovery + JWKS + /token on 127.0.0.1:3999)
node tools/mock-as.mjs

# 2. solid-server-rs @ the report-header sha, branch feat/lws, from its repo:
SOLID_SERVER_BASE_URL=http://127.0.0.1:3000 \
SOLID_SERVER_TRUSTED_ISSUER=http://127.0.0.1:3999 \
SOLID_SERVER_ALLOW_LOOPBACK=1 \
SOLID_SERVER_SEED_CONFORMANCE=1 \
SOLID_SERVER_LWS=1 \
SOLID_SERVER_LWS_STRICT_PUT=1 \
  cargo run
# (the seed writes alice's WebID with solid:oidcIssuer = the mock AS; the default
#  audience is the base URL, matching the minted token's aud and sub)

# 3. mint the controller token and run, targeting inside the seeded pod:
TOKEN="$(curl -s http://127.0.0.1:3999/token)"
node bin/run.mjs --config targets/solid-server-rs.json \
  --target http://127.0.0.1:3000/alice \
  --controller-bearer "$TOKEN" \
  --out-json reports/solid-server-rs-baseline-$(date +%F).json \
  --out-md reports/solid-server-rs-baseline-$(date +%F).md
```

## Layout

```
bin/run.mjs        CLI
lib/cli.mjs        presence-checked, fail-closed CLI flag parsing
lib/companion.mjs  statement-companion loader (n3) — the requirement index
lib/vectors.mjs    test-vector manifests/cases loader
lib/exchange.mjs   http-exchange planner + executor (state realisation, placeholders, teardown)
lib/assert.mjs     the full response-assertion vocabulary of test-vectors/README.md
lib/link.mjs       RFC 8288 Link + WWW-Authenticate challenge parsing
lib/plan.mjs       statement classification + verdict aggregation
lib/report.mjs     markdown scoreboard renderer
lib/runner.mjs     run orchestration
targets/           committed target configs
tools/mock-as.mjs  local mock OIDC AS (stdlib-only, loopback) minting the per-run
                   controller Bearer token for the solid-server-rs reproduction
reports/           committed dated reports (generated — re-run, don't edit)
test/              self-tests (node --test), incl. strict/lenient mock servers as
                   positive/negative controls for the runner itself
```
