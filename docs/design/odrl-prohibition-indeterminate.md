# ODRL prohibitions with indeterminate request context

> **Status:** Design note for a future ODRL access-profile version. This note is
> non-normative and does not change the `odrl-1` decision function or its test
> expectations.
>
> **Recommendation:** Give every rule a first-class, effect-qualified
> indeterminate result. A potentially applicable prohibition whose constraints
> cannot be evaluated should produce `Indeterminate{D}`, not `NotApplicable`.
> It must prevent that grant from contributing a permit. An unevaluable
> permission similarly produces `Indeterminate{P}` and contributes no authority.
> A context declaration can improve request validation and client UX, but must
> not be the security mechanism.

## Context and current semantics

The current profile deliberately uses one matching relation for permissions,
prohibitions, and obligations. The normative
[ODRL profile](../../index.html#odrl-profile) says that a blocking rule with a
different assignee, action, or target, or with one of its own constraints
unsatisfied, does not participate in the decision. The normative executable
[decision function](../../semantics/access-decision.n3) realizes that text as
follows:

1. Constraint rule K2 marks a constraint `unsatisfiedFor` a request when the
   request context has no value for its left operand. K4--K7 do the same for
   unsupported operand/operator pairs and malformed constraints.
2. Shared matcher M derives `matchesRequest` only when none of the rule's own
   constraints is unsatisfied.
3. Rule N derives `prohibitedIn` only from a prohibition that matches.
4. Rule D derives a permit from a matching permission when the same grant has no
   matching prohibition or obligation.

This matching-scoped behavior was an explicit design choice, recorded in
[DECISIONS.md D23](../../DECISIONS.md#d23-prohibitionobligation-decision-time-composition-odrlprohibit-deny-overrides-per-grant-matching-scoped)
and pinned by the existing
[access-oracle regression tests](../../test-suite/test/access-oracle.test.mjs).
It is therefore not a defect in the current specification and must not be
changed by an erratum. The issue is whether a future profile should distinguish
"the constraint is false" from "the constraint cannot be evaluated."

## Problem

Consider one recorded grant with an unconstrained permission and a prohibition
that applies only to marketing:

```json
{
  "@context": [
    "http://www.w3.org/ns/odrl.jsonld",
    "https://w3id.org/jeswr/lws/v1"
  ],
  "@type": "Offer",
  "uid": "https://storage.example/alice/.grants/example",
  "profile": "https://w3id.org/jeswr/lws/access-profile/odrl-1",
  "permission": [{
    "assignee": "https://id.example/bob",
    "action": "read",
    "target": {
      "@type": "DataResource",
      "uid": "https://storage.example/alice/notes/a.txt"
    }
  }],
  "prohibition": [{
    "assignee": "https://id.example/bob",
    "action": "read",
    "target": {
      "@type": "DataResource",
      "uid": "https://storage.example/alice/notes/a.txt"
    },
    "constraint": [{
      "leftOperand": "purpose",
      "operator": "eq",
      "rightOperand": "https://purpose.example/marketing"
    }]
  }]
}
```

For the same agent, action, target, and grant, the current result is:

| Request context | Prohibition result | Grant result |
|---|---|---|
| `purpose = marketing` | matches | deny |
| `purpose = collaboration` | does not match | permit |
| `purpose` omitted | does not match | permit |

The first two rows express the policy author's apparent intent. The third is
the problem: omission is treated exactly like a known, non-marketing purpose.
Because the requester supplies the request context, it can choose the third row
and make the prohibition inert.

The risk is not limited to `purpose`. It applies whenever a requester can
control whether context needed by a blocking rule is available. Not every
context attribute should be requester-asserted: client identity should be
authenticated, and media type or resource type can be server-derived. A future
profile should define each attribute's authoritative source and integrity
requirements. The same false-versus-unknown distinction is also needed for the
unsupported and malformed cases that current rules K4--K7 classify as
unsatisfied, and for runtime evaluator failures a future implementation may
encounter.

## Asymmetry with permissions

The same local constraint rule has the opposite authorization effect depending
on rule polarity.

For a permission constrained by `purpose = collaboration`, an omitted purpose
marks the constraint unsatisfied, the permission does not match, no permit is
derived, and default deny applies. This is fail-closed.

For a prohibition constrained by `purpose = marketing`, an omitted purpose
also marks the constraint unsatisfied, but now the prohibition does not match.
An unconstrained permission in the same grant can proceed. This is fail-open.

Thus, "unevaluable constraints are unsatisfied" is fail-closed only for rules
that create authority. It is fail-open for rules that remove or block authority.
The current model records only participation versus non-participation and loses
the rule effect that determines which direction is safe.

Any future design should preserve a second distinction as well:

- an explicit `purpose = collaboration` makes the marketing prohibition
  definitely false and therefore not applicable;
- an omitted or malformed request value, unsupported evaluation, or unavailable
  evaluator makes it unknown whether the prohibition applies.

Treating both cases as ordinary non-matches either retains the bypass or denies
legitimate non-marketing requests unnecessarily.

## Design goals

A future profile should:

- prevent requester-controlled omission from disabling a potentially
  applicable blocking rule;
- distinguish a definite constraint mismatch from an evaluation failure;
- preserve the current assignee/action/target scope and per-grant composition
  unless a separate profile decision deliberately changes them;
- produce useful audit and diagnostic information without disclosing protected
  policy details to the requester;
- define deterministic behavior for missing attributes, malformed values,
  unsupported operands or operators, and evaluator failures; and
- provide an explicit version boundary rather than changing `odrl-1` behavior.

## Option A: effect-qualified indeterminate results

Introduce a rule-evaluation result with at least three semantic states:

- **Applicable:** structural scope matches and every constraint is true.
- **Not applicable:** structural scope definitely does not match, or at least
  one constraint is definitely false.
- **Indeterminate:** the rule might apply, but a required value or evaluation
  result is unavailable or invalid. Qualify the result by effect:
  `Indeterminate{P}` for a permission and `Indeterminate{D}` for a prohibition
  or another rule whose defined effect is to block exercise.

For a rule with blocking effect, the third state is `Indeterminate{D}`: the
rule could have produced a denial, but could not have produced a permit. This
follows the useful distinction in the
[XACML 3.0 rule truth table and deny-overrides model](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-cos01-en.html),
without requiring the future JLWS profile to adopt XACML as its policy language.

Applied to the example:

| Request context | Prohibition result | Enforcement result |
|---|---|---|
| `purpose = marketing` | deny | deny |
| `purpose = collaboration` | not applicable | permit, if a permission matches |
| `purpose` omitted | `Indeterminate{D}` | no access |

The indeterminate result should have the same composition scope as the decision
it might have become. To preserve the current profile's per-grant design, the
next version should use this grant-level combining table:

| Candidate permission in a grant | Same-grant prohibition | Grant contribution |
|---|---|---|
| applicable | any applicable prohibition | deny; no permit |
| applicable | no applicable prohibition, at least one `Indeterminate{D}` | indeterminate; no permit |
| applicable | all prohibitions not applicable | permit |
| only `Indeterminate{P}` or no applicable permission | any | no permit |

Multiple prohibition results therefore combine in the order deny, then
`Indeterminate{D}`, then not applicable. Across grants, retain the current
existential composition: the request is permitted if at least one recorded
grant contributes a permit and denied otherwise. A deny or
`Indeterminate{D}` in one grant does not reach into a different grant. Changing
that rule to global deny-overrides would be a separate profile decision and
would change more than the omission issue considered here.

At a binary protocol enforcement point, a grant-level indeterminate result
contributes no permit; if no other grant contributes one, access is denied.
Internally, deny and indeterminate remain distinct so an implementation can
audit "policy denied" separately from "policy could not be evaluated," retry a
transient evaluator, or request missing context without weakening
authorization. External error handling must still follow the profile's
anti-oracle rules; diagnostics need not expose which prohibition was
potentially applicable.

### Tradeoffs

**Advantages**

- Directly models the security-relevant difference between false and unknown.
- Prevents omission and evaluator failure from becoming authority.
- Preserves provenance through combining, logging, testing, and future policy
  extensions.
- Generalizes coherently to other blocking rules, including obligations whose
  effect in a future profile remains to block exercise.

**Costs and risks**

- Requires a richer rule algebra and changes to the executable decision model,
  oracle, vectors, and implementation APIs in the next profile version.
- Requires every constraint evaluator to classify false separately from
  missing, malformed, unsupported, and failed evaluation.
- Can reduce availability when context infrastructure fails. That is the safe
  outcome, but implementations need operational metrics and recovery paths.
- A future move from per-grant to global policy composition would need a new
  combining table and migration analysis.

## Option B: require a context declaration

Add a profile mechanism by which the policy or grant declares the request
context attributes required for evaluation. By default, every left operand
referenced by a structurally relevant rule requires a value from the
authoritative source defined for that operand; an operand definition can instead
specify a server-derived default. A server rejects or refuses a request before
policy evaluation when a declared attribute is absent. The declaration might
be explicit vocabulary, or it might be a deterministic manifest derived from
the constraints in structurally relevant rules.

For the example, the grant would declare `purpose` required. Omitting it would
make the request incomplete and prevent the permission from being exercised.

### Tradeoffs

**Advantages**

- Gives clients an actionable contract for constructing evaluable requests.
- Allows early schema validation and clearer internal diagnostics.
- Can be simpler to implement when all required context is known statically.
- Makes context dependencies discoverable for interoperability and testing.

**Costs and risks**

- Does not by itself handle an unsupported operator, malformed value,
  evaluator outage, or a declaration that is incomplete or stale.
- Requires new vocabulary and rules for scope, inheritance, versioning, and
  conflicts between declarations from multiple grants.
- A union of all declared attributes can require irrelevant or
  privacy-sensitive disclosure. A narrowly scoped challenge flow reduces this
  risk but adds protocol round trips and may itself reveal policy structure.
- If authorization safety depends only on the declaration, any path that skips
  declaration validation recreates the bypass.

This option is valuable as a validation and usability layer, but it is not a
complete authorization semantics.

## Option C: deny on an unevaluable prohibition

Keep a binary external decision and state directly that a potentially
applicable prohibition with any unevaluable constraint blocks its grant from
contributing a permit. A definite constraint mismatch remains non-applicable;
missing or malformed request context, unsupported evaluation, and evaluator
error block the grant. The overall request is denied when no different grant
contributes a permit.

### Tradeoffs

**Advantages**

- Closes the omission bypass with a small, easily stated enforcement rule.
- Fits implementations whose authorization API exposes only permit or deny.
- Can be added to a future executable rule set without exposing a new decision
  value at the protocol boundary.

**Costs and risks**

- Still needs an internal distinction between false and unevaluable; without
  it, "deny on unevaluable" collapses into either the current bypass or denial
  of every explicit mismatch.
- Conflates an affirmative policy denial with an evaluation failure, weakening
  auditability, diagnostics, retry behavior, and future combining semantics.
- Encourages implementations to discard provenance too early, making later
  support for multiple policy layers or context acquisition harder.
- Like Option A, safely turns context-service outages into lost availability,
  but provides less information for operating that failure mode.

This is a sound enforcement bias, but a weaker semantic model than Option A.

## Recommendation for the next profile version

Adopt **Option A as the normative decision semantics** for the next profile
version, with the following rules:

1. Reject structurally malformed grants before recording them. If a valid
   structural predicate depends on unavailable runtime data, evaluate that
   uncertainty by rule effect rather than treating it as a definite mismatch.
2. Evaluate structural scope separately from constraints. A definite
   assignee/action/target mismatch is `NotApplicable`.
3. Give each constraint a result of `true`, `false`, or `indeterminate`.
   Absence or malformation of required request context, an unsupported
   evaluation capability, and evaluator failure are indeterminate. Invalid or
   unsupported policy constructs should be rejected when the grant is
   recorded; defence-in-depth evaluation treats any that nevertheless reach it
   as indeterminate. An evaluated comparison that does not hold is false. An
   empty constraint set is vacuously true. Conjoin results in the order false,
   then indeterminate, then true: any false constraint makes the rule not
   applicable; otherwise any indeterminate constraint makes the rule
   indeterminate; otherwise it is applicable.
4. Qualify an indeterminate result by effect. An indeterminate permission is
   `Indeterminate{P}` and contributes no authority. An indeterminate
   prohibition is `Indeterminate{D}`. A structurally applicable prohibition
   whose constraints are all true denies. Apply the same potential-deny
   treatment to an obligation only when that profile version defines the
   obligation's effect as blocking exercise.
5. Combine results within a grant using the table above, then preserve the
   current existential composition across grants: any grant-level permit
   permits; otherwise deny. This closes omission within the grant without
   silently creating global prohibitions.
6. A binary implementation may expose only permit or deny, but it should retain
   the internal indeterminate reason for audit and context acquisition. No
   indeterminate rule may itself contribute authority.

Use **Option B as a supporting mechanism** if the next profile adds context
negotiation or discoverability. Required-context declarations should help a
client provide evaluable input and help a server reject incomplete requests
early, but the evaluator must remain safe when the declaration is absent,
wrong, or bypassed.

Treat **Option C as the binary enforcement mapping of Option A**, not as the
underlying semantic model. This gives simple implementations the required
fail-closed behavior while retaining the distinction needed for composition,
audit, and future evolution.

The version change should ship with new vectors covering, for permissions,
prohibitions, and any blocking obligations: explicit match, explicit mismatch,
omitted context, malformed context, unsupported evaluation, evaluator failure,
structural uncertainty, multiple constraints with mixed false/indeterminate
results, multiple prohibitions, and same-grant versus cross-grant combining.
The current `odrl-1` vectors and normative rule set should remain unchanged.
