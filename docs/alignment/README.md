<!-- AUTHORED-BY Claude Fable 5 -->

# Spec alignment — the maintainer's Solid specs × JLWS

How each of the six sibling specifications composes with the JLWS clean-slate substrate
([`index.html`](../../index.html) core + [`rdf-transform.html`](../../rdf-transform.html)
RDF companion), what each side needs to say, which conformance vectors cover the
composition, and where each lands in the `solid-server-rs` `feat/lws` implementation.
This is the design record for directive step 8 (align the other proposed specs with the
now-public LWS spec); the implementation follows on `feat/lws`.

The four composition modes considered per spec:
**(a)** a PROFILE on the LWS substrate (like Solid-on-JLWS,
`rdf-transform.html#solid-profile`); **(b)** a CAPABILITY/SERVICE advertised in the LWS
storage description (`index.html#capability-registry`); **(c)** an AUTH-layer profile
negotiated via the RFC 9728 discovery surfaces (`index.html#authz-discovery`,
`#presentation-pop`, `#suites`); **(d)** an independent layer that REFERENCES LWS.

## Verdicts at a glance

| Spec | Verdict | One line | Doc |
|---|---|---|---|
| AC-SPARQL (`solid-sparql-query`) | **(b) service** | the reserved `SparqlQueryService` slot (`index.html#query-services`); advertised only when the RDF profile is on (`rdf-transform.html#indexing`); binding profile URI `https://w3id.org/jeswr/lws/query/ac-sparql-1` | [ac-sparql.md](./ac-sparql.md) |
| DPoP-SK (`dpop-sk-spec`) | **(c) auth: PoP presentation profile** | negotiated via the `pop_session` PRM member beside `jlws_storage_description`; `dpop_bound_access_tokens_required` covers it (no separate required-member — index.html corrected on this branch) | [dpop-sk.md](./dpop-sk.md) |
| A2A RDF extension (`a2a-rdf-extension`) | **(d) reference** (+ optional extension service) | agent-layer protocol; JLWS is its document substrate (hash-stable across rdf-1 representations); optional `…/a2a-rdf/v1#AgentInteractionService` extension entry | [a2a-rdf.md](./a2a-rdf.md) |
| WebAuthn re-auth (`solid-webauthn-reauth[-spec]`) | **(c) auth: authentication SUITE** | already absorbed as `index.html#suite-webauthn` (assertion bundle = RFC 8693 `subject_token`); issued tokens stay DPoP-bound under the profile, reconciled with the D9 Bearer baseline | [webauthn-reauth.md](./webauthn-reauth.md) |
| Agentic Solid Note (`agentic-solid-note`) | **(d) reference** (informative umbrella) | gains a substrate-portability bullet + a JLWS maturity row; AS-0 definition untouched | [agentic-solid-note.md](./agentic-solid-note.md) |
| agentic-solid-conformance | **(d) shared conformance fabric** | this repo's `test-vectors/` already adopts its format (D20); alignment = the homing rule + the new composition vector families | [conformance-vectors.md](./conformance-vectors.md) |

## Storage-description / discovery-surface additions (consolidated)

1. **No new core capability TERM is required by any of the six.** `SparqlQueryService` is
   already registered (`index.html#capability-registry`); PoP profiles and auth suites are
   discovered on the RFC 9728/8414 surfaces, not the storage description; the a2a-rdf
   affordance uses the registry's extension-URI mechanism.
2. **Minted by this alignment:** `https://w3id.org/jeswr/lws/query/ac-sparql-1` — the
   `conformsTo` binding-profile URI for a `SparqlQueryService` implementing [[AC-SPARQL]]
   under JLWS bindings (joins the storage's `conformsTo` when on).
3. **Defined by `a2a-rdf-extension` (extension service, optional):**
   `https://w3id.org/jeswr/a2a-rdf/v1#AgentInteractionService` — `serviceEndpoint` = the
   controller-agent's A2A Agent Card URL; `conformsTo` = the extension URI.
4. **PRM contract on a JLWS realm** (normative pieces all pre-existing):
   `jlws_storage_description` (core `#authz-discovery`) + `dpop_signing_alg_values_supported`
   (DPoP offered) + `pop_session` (DPoP-SK offered, its `#discovery`) +
   `dpop_bound_access_tokens_required: true` (PoP required — covers both profiles).
5. **RFC 8414 AS metadata:** `subject_token_types_supported` lists the WebAuthn suite's
   token-type URI alongside the other suites (core `#credential-model`).

## Edits applied on this branch (lws-spec itself)

- `index.html` localBiblio `[[AC-SPARQL]]`: repointed from the stale `solid-server-rs`
  design-doc URL to the published editor's draft (`jeswr/solid-sparql-query`).
- `index.html#presentation-pop`: the PoP-required signal for DPoP-SK corrected — no
  "analogous required-member" exists or is needed; `dpop_bound_access_tokens_required`
  governs both profiles, `pop_session` signals DPoP-SK availability (finding recorded in
  [dpop-sk.md §2.1](./dpop-sk.md)).
- `DECISIONS.md` D21 records the six composition verdicts.
- `suite.json` refreshed to the repo's public status.

Each of the five per-spec "Relationship to LWS" sections is specified as ready-to-land
text in its alignment doc; those edits land in their own repos (increment C below).

## <a id="sequence"></a>The sequenced implementation plan (`feat/lws` + siblings)

| # | Increment | Where | Depends on | Status |
|---|---|---|---|---|
| A | **DPoP-SK over LWS**: `pop_session` in the LWS-extended PRM; DPoP-SK attestation accepted at the `LwsBearerAuth` PoP chokepoint (rs-validation step 5); `channel_bindings: ["none"]` first | `src/lws/auth.rs` + existing `src/pop/sk/*` | M2 auth (landed `d0e97d5`) | **buildable now** (`tls-exporter` flavour gated on in-process TLS) |
| B | **a2a-rdf affordance + hash-stability vectors**: config-gated `AgentInteractionService` SD entry; 2 pure-function cases in agentic-solid-conformance | `src/lws/mod.rs` (SD builder); `agentic-solid-conformance/vectors/a2a-rdf/` | M1 (landed) | **buildable now** (trivial) |
| C | **Docs fan-out**: the five "Relationship to LWS" sections + Note maturity row + the A/B-riding vector suites (`dpop-sk`, auth+4, discovery+1) | the five sibling repos + `test-vectors/` | this design | **buildable now** |
| D | **AC-SPARQL service**: `src/lws/query.rs` endpoint; SD advertisement gated on the RDF profile; per-solution filtering via SPARQ `query_as`/`decide`; `ac-sparql` vector suite (its 2 discovery cases can precede) | `src/lws/query.rs` + SD builder | **`jeswr/sparq#992`** + rdf-transform (landed) | **gated** |
| E | **WebAuthn suite AS-side**: challenge/registration/exchange verification | `jeswr/lws-keycloak` (not `feat/lws`) | spec-repo publication = `needs:user`; AS work independent | **external** |

Order within the buildable set: A → B → C can proceed in parallel (disjoint files; A is
the only one touching `src/lws/auth.rs`); D the moment `sparq#992` lands; E on its own
track. Every increment lands with its vectors and the `test-vectors/manifest.json` +
`GAPS.md` bookkeeping per [conformance-vectors.md §3.1](./conformance-vectors.md).
