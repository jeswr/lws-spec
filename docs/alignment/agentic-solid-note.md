<!-- AUTHORED-BY Claude Fable 5 -->

# Alignment: Agentic Solid Note × JLWS

**Spec aligned:** [Agentic Solid — the umbrella Note](https://github.com/jeswr/agentic-solid-note)
(wholly informative; the map of the six-layer accountable-agent stack and its AS-0…AS-4
conformance staging).

## 1. Composition verdict: (d) an independent, wholly-informative umbrella that REFERENCES LWS

The Note mints nothing and specifies nothing — it is "the map a reader in any of those
venues can use to see where a component sits" (its `#relationship`). It already names the
W3C Linked Web Storage WG as "the base's standards-track home" (`#relationship`, final
bullet). JLWS slots in as a **second concrete substrate** under the same stack, not as a
new layer: every layer above L2 (ODRL delegation, AAC, agent cards/A2A, PROV
accountability) is substrate-agnostic pod content + client/verifier logic, and the Note's
own thesis — "Nothing requires pods to change shape. Credentials, policies, protocol
documents, and traces are ordinary pod resources under ordinary access control"
(`#relationship`) — holds verbatim over a JLWS storage. Verdict: **reference**; the
alignment is a handful of informative edits to the Note, none to JLWS.

## 2. Concrete alignment edits

### 2.1 In `jeswr/lws-spec` (this repo)

None. (The Note is deliberately not cited normatively by JLWS; the substrate does not
depend on its umbrella.)

### 2.2 In `jeswr/agentic-solid-note` — three informative edits

1. **Biblio:** add a `[[JLWS]]` localBiblio entry
   (`https://github.com/jeswr/lws-spec`, "JLWS — Linked Web Storage (personal clean-slate
   editor's draft)", now public).

2. **`#relationship` — a substrate-portability bullet** after the LWS-WG bullet,
   ready-to-land:

   > **The stack is substrate-portable.** The base this architecture extends can be the
   > Solid Protocol stack of AS-0, or a Linked Web Storage storage: the JLWS editor's
   > draft [[JLWS]] composes the same layers over the LWS Working Group's protocol
   > direction — its RDF Content Transformation profile restores RDF-readable resources
   > and sketches the Solid-on-JLWS mapping (WebID → CID subject; `solid:oidcIssuer` →
   > `jlws:OpenIdProvider`; WAC/ACP → ODRL grants), its access layer is already the
   > strict-ODRL model L3 builds on, and the L2 read interface ([[SOLID-SPARQL-QUERY]])
   > is its reserved `SparqlQueryService`. An AS-1+ deployment can therefore sit on
   > either base; the layers above L2 are unchanged pod content and verifier logic.

3. **`#maturity` — one table row** for JLWS, in the table's existing honest register,
   e.g.: *component* "JLWS substrate (Linked Web Storage clean-slate draft)"; *status*
   "personal editor's draft (public), with a flag-gated implementation in
   `solid-server-rs` `feat/lws` (M1 discovery/containers/RDF-transform, M2 auth chain,
   M3 linksets/pagination/RAR landed; M4 notifications/PoP/query deferred) and a
   125-case spec-derived vector suite"; *venue* "personal draft; W3C LWS WG is the
   standards-track home".

No AS-x profile redefinition: AS-0 stays "exactly Solid-Protocol + WAC/ACP + Solid-OIDC"
(`#as-0`) — the JLWS base is presented as a parallel substrate, not a new AS-0, so the
Note's conformance ladder keeps its precision.

## 3. Test-vector plan

None — the Note is informative and has no conformance surface (its own SOTD says so; the
agentic-solid-conformance suites vector its *components*, not the map). The composition
coverage lives in the component suites (see [conformance-vectors.md](./conformance-vectors.md)).

## 4. `feat/lws` implementation seam

None.

## 5. Sequencing

**Buildable now, docs-only** (increment C in the [alignment sequence](./README.md#sequence)):
the three edits above land in `jeswr/agentic-solid-note` (direct-push repo, per its landing
policy) in one small commit, re-running its HTML check.
