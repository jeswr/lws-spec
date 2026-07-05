<!-- AUTHORED-BY Claude Fable 5 -->

# Alignment: AC-SPARQL × JLWS

**Spec aligned:** [Access-Controlled SPARQL Query over a Solid Pod](https://github.com/jeswr/solid-sparql-query)
(unofficial editor's draft; server-side contract mirrored to
[`jeswr/sparq#992`](https://github.com/jeswr/sparq/issues/992) —
`solid-sparql-query/design/sparq-992-mirror.md`).

## 1. Composition verdict: (b) a SERVICE advertised in the LWS storage description

AC-SPARQL is a **read interface over content the storage already holds**, gated by the
storage's **existing** authorization decisions (its `#relationship`: "this specification
consumes those decisions — it introduces no new access modes, no new policy language"). That
is exactly the shape the JLWS core reserves a **service slot** for:

- `index.html#query-services` registers `SparqlQueryService` and states its semantics
  "(per-solution authorization filtering) follow [[AC-SPARQL]]";
- `index.html#capability-registry` lists `SparqlQueryService` among the registered service
  types "defined by the query companion";
- `rdf-transform.html#indexing` sets the availability precondition: "The
  `SparqlQueryService` MUST only be advertised when this profile is on" — SPARQL over a
  byte-native storage is meaningless without the RDF read contract.

It is **not** a profile on the substrate (it adds no resource semantics), not an auth-layer
profile (it changes nothing about tokens), and more than a mere reference (the storage
actively advertises and serves it). Verdict: **capability/service — the strongest of the
four composition modes actually available to it.**

## 2. Concrete alignment edits

### 2.1 In `jeswr/lws-spec` (this repo)

- **Done on this branch:** the `[[AC-SPARQL]]` localBiblio entry repointed from the stale
  `solid-server-rs` design-doc URL to the published editor's draft
  (`jeswr/solid-sparql-query`, title "Access-Controlled SPARQL Query over a Solid Pod").
- **Binding profile URI (minted here, used by the service entry below):**
  `https://w3id.org/jeswr/lws/query/ac-sparql-1` — "this `SparqlQueryService` implements
  [[AC-SPARQL]] semantics over this storage, under the JLWS bindings in this document".
  Follows the `conformsTo` companion-URI convention of `index.html#discovery-model`
  (D5; the `fedreg:StorageDescription` pattern), joining the storage's `conformsTo`
  array when the service is on.
- **Service-entry shape** (the query companion's discovery contract; no new registry TERM
  is needed — `SparqlQueryService` is already registered):

  ```json
  {
    "type": "SparqlQueryService",
    "serviceEndpoint": "https://storage.example/alice/sparql",
    "conformsTo": "https://w3id.org/jeswr/lws/query/ac-sparql-1"
  }
  ```

  Advertised **only when** the storage's `conformsTo` includes
  `https://w3id.org/jeswr/lws/transform/rdf-1` (`rdf-transform.html#indexing`). The
  `index.html#query-services` invariants (live filtering, caller-visible counts,
  oracle-freedom per `index.html#oracle-freedom`) apply normatively.

### 2.2 In `jeswr/solid-sparql-query` — a "Relationship to LWS (JLWS)" section

A short section after its `#relationship` ("Relationship to the Solid Protocol and access
control"), saying — ready-to-land text, adapt anchors on paste:

> **Relationship to Linked Web Storage (JLWS).** On a JLWS storage
> ([JLWS-CORE]), this specification composes as the registered `SparqlQueryService`
> service ([JLWS-CORE] *Query services*, *Capability registry*):
> - **Discovery** is the storage description's `service` entry
>   (`type: SparqlQueryService`, `conformsTo: https://w3id.org/jeswr/lws/query/ac-sparql-1`)
>   instead of — or, for Solid-client compatibility, in addition to — the
>   `Link rel="http://www.w3.org/ns/solid/sparql#endpoint"` header of [this spec's
>   `#discovery`]. The non-variance rule of `#discovery` applies to the storage
>   description equally: the service entry's presence MUST NOT vary by requester.
> - **Authentication** is JLWS authentication ([JLWS-CORE] *Authorization*): RFC 9068
>   `at+jwt` Bearer baseline with negotiated PoP — satisfying this spec's `#authentication`
>   requirement that the endpoint authenticates exactly like any other storage resource.
> - **Authorization / GET-equivalence** maps onto the JLWS decision surface: "the requester
>   is authorized to read the resource" (`#read-visibility`) means the JLWS server's own
>   read decision (grants ∩ token audience ∩ RFC 9396 narrowing — [JLWS-CORE]
>   *Rich authorization details*), not WAC/ACP specifically. This spec is already
>   authorization-model-agnostic by design (`#relationship`: WAC **or** ACP); JLWS grants
>   are a third instantiation of the same seam.
> - **Resource graphs** (`#resource-graphs`) are the JLWS storage's RDF-readable data
>   resources — those covered by an advertised `ContentNegotiation` capability under the
>   RDF Content Transformation Profile (`rdf-transform.html`). Non-RDF-readable resources
>   contribute no graph, matching this spec's treatment of non-RDF resources.
> - The availability precondition is `rdf-transform.html#indexing`: the service MUST NOT be
>   advertised on a storage without the RDF profile.

No normative change to AC-SPARQL's query semantics, dataset mapping, non-disclosure
invariants, or result formats: they transfer verbatim.

## 3. Test-vector plan

New suite `test-vectors/vectors/ac-sparql/` in this repo (format per D20; **gated** — see
§5). Cases, each pinning clauses of both specs:

| id | operation | expected | pins |
|---|---|---|---|
| `sd-gated-on-rdf-profile` | build storage description, RDF profile OFF | no `SparqlQueryService` entry | `rdf-transform.html#indexing`; core `#capability-registry` |
| `sd-advertised-when-on` | build storage description, RDF profile ON + query on | entry present with `conformsTo` ac-sparql-1 | core `#discovery-model` |
| `get-equivalence-positive` | query as agent readable on resource A | solutions from A's graph present | AC-SPARQL `#read-visibility`; core `#query-services` |
| `get-equivalence-negative` | same query, agent unreadable on resource B | no solution mentions B's triples | AC-SPARQL `#read-visibility` |
| `revocation-immediate` | query after grant revocation | reduced result set, no cache echo | core `#query-services` invariants |
| `counts-visible-only` | `COUNT(*)` over mixed-visibility dataset | count = visible view only | core `#query-services`; D12 |
| `service-desc-no-graph-oracle` | GET the endpoint (no query) | service description names no unreadable graph; no `sd:UnionDefaultGraph` | AC-SPARQL `#service-description`, `#non-disclosure-invariants` |
| `udg-optin-advertised-iff-implemented` | service description with/without the mode | `sd:feature solid-sparql:UnionDefaultGraphOptIn` iff implemented | AC-SPARQL `#union-default-graph`, `#service-description` |

(8 cases. The AC-SPARQL spec's own conformance surface — dataset mapping, concrete
syntaxes, cross-graph rules — belongs to its own future suite; these vector only the
**composition**: gating, discovery, and the shared authorization invariants.)

## 4. `feat/lws` implementation seam

- **New module `src/lws/query.rs`** mounting the endpoint (SPARQL 1.1 Protocol GET/POST
  per AC-SPARQL `#protocol-operations`), route present only when `LwsConfig` has the RDF
  transform on **and** the query service is configured.
- **Storage-description builder** (`src/lws/mod.rs`, the D5 document): emit the service
  entry + `conformsTo` addition under the same condition.
- **Per-solution authorization filtering** delegates to SPARQ's `query_as`/`decide` seam —
  the contract mirrored in `solid-sparql-query/design/sparq-992-mirror.md`. This is the
  hard dependency: **gated on `jeswr/sparq#992`**. The `src/lws/mod.rs` M4 note already
  reserves exactly this seam ("the `SparqlQueryService`/AC-SPARQL companion (a gated
  increment on `sparq#992`)").
- Non-disclosure at the HTTP layer reuses the existing oracle-freedom discipline
  (M2 `auth.rs` 403-vs-404; core `#oracle-freedom`).

## 5. Sequencing

**Gated on `sparq#992`** (increment D in the [alignment sequence](./README.md#sequence)).
Buildable-now precursors: the biblio fix (done), the `solid-sparql-query`
Relationship-to-LWS section (docs-only), and the vector suite's *discovery* cases
(`sd-gated-on-rdf-profile`, `sd-advertised-when-on` — they exercise only the
storage-description builder, which exists today).
