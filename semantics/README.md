<!-- AUTHORED-BY Claude Fable 5 -->

# `semantics/` — the executable access-decision semantics

`access-decision.n3` is the **normative, executable definition** of the strict ODRL access
profile's `evaluate-access` decision function (JLWS Core Protocol
[`#odrl-profile`](../index.html), [`#grants-are-records`](../index.html)). The full-text spec
references it normatively (the *Decision function* bullet of `#odrl-profile`), and the
statement companion links every affected `spec:Requirement` to it via `sc:formalModel`
(JLWSC-ODRL-3/4/5/6/7, JLWSC-GR-1/5).

This is the [Cedar](https://github.com/cedar-policy/cedar-spec)-style
definitional-implementation pattern, on-stack: grants are RDF, so the definitional evaluator
is an N3 rule set — the same formalism sparq executes for WAC/ACP — and the spec's semantics
can literally run inside an access-control engine.

## The decision rule

Run the rule set under an N3 reasoner (EYE; verified with EYE v11.24.4 via the pinned
`eyereasoner` npm package) over the encoded recorded grants + request:

```sh
npx eyereasoner --quiet --nope <encoded-input>.n3 \
    semantics/access-decision.n3 --query semantics/access-decision.query.n3
```

- **permit** ⟺ at least one `?req ax:permittedBy ?g` triple is derived — each derivation is
  an independent, auditable justification naming the grant that carries it;
- **deny** ⟺ no derivation exists: the decision-time **closed-world absence** of a permit
  justification (default deny).

Revocation composes structurally: a revoked grant's record was DELETEd, so it never appears
in the input, and a request stays permitted while *any* recorded grant still covers it. The
naive reading "revocation ⇒ denial" is not expressible in the rule set.

Fail-closed properties hold **by construction of the rule shapes**: an unknown action is
never `ax:KnownAction` so it cannot satisfy anything (and `odrl:includedIn` widening is
one-directional because no rule derives the converse edge); a non-slash-terminated
container/storage uid earns no prefix coverage; a constraint the profile cannot evaluate —
unsupported operand/operator pair, missing part, or a context value the request does not
carry — derives `ax:unsatisfiedFor`, and one unsatisfied constraint vetoes the permission
(conjunction); a dateTime bound or request instant outside the canonical RFC 3339 UTC `Z`
form — or naming a **nonexistent instant** (Feb 30, Feb 29 in a non-leap year, hour 24,
minute/second 60, month 00/99) — derives `ax:unsatisfiedFor` via a fully calendar-aware
pattern (lexicographic order is only chronological over the fixed-width canonical form of
instants that exist — without this guard a garbage bound like `"zzzz"` or
`"2026-99-99T99:99:99Z"` would sort after real instants and widen an `lt` bound, i.e. fail
OPEN); a grant carrying `odrl:prohibition`/`odrl:obligation` rules derives nothing (their
decision-time composition is not defined by this profile version).

## Input encoding

The oracle (`test-suite/tools/oracle-access.mjs`) maps the profile's JSON-LD document shape
to N3 deterministically; the same mapping is what any implementation reproducing the
decision function feeds the reasoner. Terms:

| JSON (profile document / vector `input`) | N3 |
|---|---|
| grant (`@type: Offer`, `uid`, `profile`) | `<uid> a odrl:Offer ; odrl:profile <…odrl-1> ; ax:recordedIn ax:GrantStore` |
| `permission[]` entries | `odrl:permission [ … ]` |
| `assignee` | `odrl:assignee <iri>` (`http://xmlns.com/foaf/0.1/Agent` = public) |
| `action`: `read`/`modify`/`delete` | `odrl:action odrl:<name>` |
| `action`: `create`/`append` | `odrl:action jlws:<name>` |
| `target` `@type`: `DataResource`/`Container`/`StorageResource` | `a jlws:<type>` |
| `target.uid`, `target.recursive: true` | `odrl:uid <iri>`, `jlws:recursive true` |
| `constraint[]` `leftOperand`: `purpose`/`dateTime` | `odrl:leftOperand odrl:<name>` |
| `constraint[]` `leftOperand`: `client`/`mediaType`/`resourceType` | `odrl:leftOperand jlws:<name>` |
| `constraint[]` `operator` (`eq`, `lt`, …) | `odrl:operator odrl:<name>` |
| `rightOperand` `{ "@value": v, "@type": t }` | the plain literal `"v"` (canonical lexical form) |
| `rightOperand` of a `dateTime` constraint | MUST be `xsd:dateTime`-typed (or a bare string) **and** the canonical RFC 3339 UTC `Z` form (fixed width, no fractional seconds), with every component range-checked explicitly — month-specific day counts, Gregorian leap years, hour ≤ 23, minute/second ≤ 59, never via `Date.parse` (which silently normalizes nonexistent instants) — anything else is an encode error; the rule set independently fails closed on non-canonical or nonexistent instants |
| `rightOperand` absolute `http(s)` IRI string | `<iri>` |
| request | `[] a ax:Request ; ax:agent <> ; ax:action <> ; ax:target <> ; ax:context [ … ]` |
| request `context` entries | the profile **left-operand IRIs are the context keys**: `odrl:dateTime "…"`, `odrl:purpose <…>`, `jlws:client <…>`, … |

Absolute `http(s)` IRIs pass through everywhere; any other unrecognised action, operand,
operator, context key, or grant `@type` is an **encode error** (fail loud, never silently
dropped — in particular a record with a missing/unknown `@type` is never fabricated into an
`odrl:Offer`). `xsd:dateTime` values are presented as their canonical RFC 3339 UTC (`Z`)
lexical forms, under which chronological and lexicographic order coincide; the encoder
rejects non-canonical, foreign-datatyped, or calendar-invalid instants (explicit
component range-checks — never `Date.parse`, which normalizes Feb 30 → Mar 2 and
T24:00 → next-day midnight), and the rule set itself derives `ax:unsatisfiedFor` on any
non-canonical or nonexistent instant as defence in depth for embedders that feed the
reasoner unvalidated data.

**Security invariant (untrusted input):** the mapping produces triples only for the fields
above. Profile facts — `ax:KnownAction` membership and the `odrl:includedIn` lattice — live
in the rule set itself and are never read from evaluated documents, so a hostile grant
document cannot inject widening (or any other) assertions into the evaluation.

## Consistency gates

- `node test-suite/tools/oracle-access.mjs` — executes the rule set over **every**
  `evaluate-access` test vector and diffs the derived decision against the vector's
  expected decision (part of the repo gate; the vectors and this rule set must never
  disagree).
- `test-suite/test/access-oracle.test.mjs` — adversarial regression probes beyond the
  vectors: prefix-escape attempts, widening-injection containment, malformed and
  unevaluable constraints, prohibition fail-closure, revocation composition
  (run with `cd test-suite && npm test`).

The rule set is stratified and non-recursive; the only negation is the scoped
empty-collection check at the decision boundary (`log:collectAllIn` + `list:length 0`), so
evaluation terminates on all inputs.
