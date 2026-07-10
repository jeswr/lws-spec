<!-- AUTHORED-BY Claude Fable 5 -->

# `formal/tla/` — TLC-checked temporal models of the JLWS protocol

Non-normative TLA+ models of the **stateful/temporal** normative statements the test-vector
suite cannot express (the `GAPS.md` "stateful/temporal" class: properties spanning multiple
observations over time or concurrency, which a request/response vector cannot pin). Where the
executable N3 semantics (`semantics/access-decision.n3`) defines the *decision-level* function —
given one recorded-grant state, permit or deny — these models define the *temporal layer*: which
recorded state each surface consults, and how grant changes propagate through it. The statement
companions link the covered requirements here via `sc:formalModel`.

Every model is checked by TLC, and **some configs are counterexample witnesses**: they are
*supposed* to be violated — TLC exhibiting the trace that a forbidden discipline permits. The
runner (`./run-tlc.sh`) therefore asserts the exact expected verdict per config, not "all green".

## The models

| Module | Spec sections | Companion statements | Configs (expected verdict) |
|---|---|---|---|
| `JlwsRevocation.tla` | `#grants-are-records`, `#oracle-freedom` | JLWSC-GR-2/3/4/5/6, JLWSC-SUB-2 | `JlwsRevocation.cfg` (pass); `-window.cfg` (violates `NoOracleWindow`); `-ackwindow.cfg` (violates `NoUseAfterAckedRevocation`); `-naive.cfg` (violates `NaiveRevocationDenies`) |
| `JlwsConditionalUpdate.tla` | `#http-update`, `#metadata-updates` | JLWSC-UPD-1, JLWSC-MU-4 | `JlwsConditionalUpdate.cfg` (pass); `-unconditional.cfg` (violates `NoLostUpdate`) |
| `JlwsContainment.tla` | `#containment`, `#http-create-post`, `#http-delete`, `#metadata` | JLWSC-CTN-3/4, JLWSC-POST-6, JLWSC-MD-2 | `JlwsContainment.cfg` (pass); `-split.cfg` (violates `MembershipExact`) |

## The finding: the revocation two-clocks oracle window (resolved — DECISIONS.md D22)

`#grants-are-records` previously ran on **two clocks**:

> Grant creation and revocation MUST be reflected in **enforcement** within a bounded,
> documented interval (SHOULD be immediate).
>
> **Derived views** — container listings, type indexes, query results — MUST reflect
> revocation **immediately**.

Model-checking that text (`SplitClockSpec` in `JlwsRevocation.tla`) refutes it. TLC's trace for
`JlwsRevocation-window.cfg`:

```
State 1  Init                 recorded={}     decision={}     ackedRevoke={}
State 2  Create(g1)           recorded={g1}   decision={}     ackedRevoke={}
State 3  Propagate            recorded={g1}   decision={g1}   ackedRevoke={}
State 4  RevokeImmediateAck   recorded={}     decision={g1}   ackedRevoke={g1}
                              → Invariant NoOracleWindow is violated
```

In state 4 the direct request is still honored (enforcement consults the lagging `decision`
state, as the bounded interval permits) while every derived view already hides the resource
(they consult the record, as "immediately" requires) — **and the server has already
acknowledged the revocation** (`-ackwindow.cfg`: `NoUseAfterAckedRevocation` is violated by the
same trace). Any non-zero enforcement lag makes this state reachable. The window is an
observable inconsistency that contradicts `#oracle-freedom`, which defines every derived
surface by *what the requesting agent can read*: during the window the agent can read a
resource the listing says it cannot. The creation direction is inconsistent too
(`NoCreationWindow`: a listed member that direct requests still 404 — one `Create` step).

**The fix (now the spec text): one decision state, one clock, acknowledgment as the barrier.**

- Request enforcement and *every* derived view evaluate against the **same decision state** —
  the surfaces cannot disagree by construction (`SurfacesAgree`), which is the point: the
  window is eliminated structurally, not by tuning timing.
- Propagation from the grant record into that decision state stays bounded (`Bound` ticks;
  the SHOULD-immediate recommendation is `Bound = 0`), and the grant operation is
  **acknowledged only after the decision state reflects it** (`AckRevoke` requires
  `g ∉ decision`): after the revocation response returns, no request is honored under the
  revoked grant on any surface (`NoUseAfterAckedRevocation`, `AckedNeverEnforced`).

`JlwsRevocation.cfg` checks the fixed discipline: `TypeOK`, `SurfacesAgree`,
`NoUseAfterAckedRevocation`, `AckedNeverEnforced`, `NoResurrection` (a revoked grant record
never reappears — record URIs are not reused; re-granting mints a new record), plus the
temporal properties `MonotonicRevocation`, `EveryRevocationAcked` (liveness: every revocation
is eventually acknowledged) and `FullRevocationConverges` (once every covering grant is
revoked, enforcement denies forever). `-naive.cfg` keeps the refuted *misreading* on file:
"revoking **a** covering grant denies the request" is violated even under the fixed
discipline — another recorded grant may still cover it; deny is the closed-world absence of
*every* covering grant (JLWSC-GR-5; the decision-level half is pinned by the
`revoke-one-covering-grant-still-permitted` / `revoke-all-covering-grants-denied` vectors,
which is why no new vector accompanies the fix — the window itself is stateful and outside
the vector suite's state-realizability rule, per `test-vectors/GAPS.md`).

## The other two models

- **`JlwsConditionalUpdate.tla`** — the lost-update threat (`#threat-model`) against the
  strict conditional-write discipline: unconditional PUT/PATCH → 428, stale If-Match → 412.
  `StrictSpec` satisfies `NoLostUpdate`; `UnconditionalSpec` (a server accepting unconditional
  overwrites) is refuted in three steps — the counterexample justifying the MUST. Per-writer
  *progress* is deliberately not asserted: optimistic concurrency admits livelock between
  racing writers; retry policy is a client concern.
- **`JlwsContainment.tla`** — containment/membership atomicity over a fixed path-aligned URI
  tree (D4, so acyclicity is structural — an `ASSUME`, not an invariant). `AtomicSpec`
  satisfies `NoOrphans`, `MembershipExact` (the listing is exactly the live children),
  `NoDanglingMembers`, `RootPersists`; `SplitPhaseSpec` (existence and membership updated in
  separate steps — what the "atomically" MUSTs forbid) is refuted in one step, and its
  deletion phases leave a listing naming a deleted resource: an existence/deletion oracle.

## Abstractions (read before extending)

- One fixed probe request; `Covering` abstracts the strict-ODRL decision function, whose
  internals are the N3 rule set's job, not this layer's.
- `Bound` abstracts the "bounded, documented interval" to ticks; real-time is out of scope.
- The models are models **of the spec**, not tests of an implementation: an implementation's
  conformance to the temporal MUSTs remains black-box-unobservable (the companions keep their
  `sc:testGap`), but the *spec text itself* is now known consistent — the design-level property
  the two-clocks predecessor text lacked.
- Creation acknowledgment is not separately tracked (only revocation carries the
  security-critical barrier); the creation-direction consistency is still covered by
  `SurfacesAgree`/`NoCreationWindow`.

## Running

```sh
sh formal/tla/run-tlc.sh
```

Needs java 11+; `tla2tools.jar` is resolved from `TLA_TOOLS_JAR`, a copy next to the script,
or a one-time download verified fail-closed against a pinned sha256 (the upstream v1.8.0
GitHub artifact is a rolling pre-release; on mismatch, verify a copy yourself and pass
`TLA_TOOLS_JAR`). Verified toolchain: TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802),
sha256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. All eight
expectations complete in well under a minute (the state spaces are tiny: ≤ 100 distinct
states each). The repo gate treats this as a required check **where the toolchain is
available** (java + the jar); the models and configs are committed and internally consistent
regardless.
