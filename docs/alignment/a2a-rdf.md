<!-- AUTHORED-BY Claude Fable 5 -->

# Alignment: A2A RDF Extension × JLWS

**Spec aligned:** [RDF Protocol Documents — an A2A Extension](https://github.com/jeswr/a2a-rdf-extension)
(extension URI `https://w3id.org/jeswr/a2a-rdf/v1`).

## 1. Composition verdict: (d) an independent layer that REFERENCES LWS as its document substrate

The A2A RDF extension is an **agent-to-agent protocol** extension, declared in an A2A Agent
Card and negotiated per-exchange (`#declaration`, `#handshake`) — the storage server never
speaks it. Its touchpoints with a storage are all **document hosting**: Protocol Documents
are dereferenceable HTTPS resources pinned by hash (`#pd-model`, `#pd-hashing`); the ODRL
policies and Agent Authorization Credentials it binds by reference (`#authorization`) are
"ordinary pod resources under ordinary access control" ([AGENTIC-SOLID-NOTE]
`#relationship`). So the composition is **reference, not capability**: JLWS is the natural
substrate the extension's documents live on, and nothing in either spec changes.

**One optional discovery affordance** (a small (b)-flavoured addition, using the registry's
existing extension mechanism — `index.html#capability-registry`: "Extension services use
absolute URIs"): a storage whose controller operates an A2A agent MAY advertise it, so a
client that discovered the storage can find the agent that speaks for it:

```json
{
  "type": "https://w3id.org/jeswr/a2a-rdf/v1#AgentInteractionService",
  "serviceEndpoint": "https://agent.example/.well-known/agent-card.json",
  "conformsTo": "https://w3id.org/jeswr/a2a-rdf/v1"
}
```

`serviceEndpoint` is the **A2A Agent Card URL** (the card, not the A2A endpoint — the card
carries the endpoint and the `capabilities.extensions` declaration per `#declaration`);
`conformsTo` asserts the agent declares this extension. The term is minted in the
a2a-rdf namespace and defined by the a2a-rdf spec's Relationship-to-LWS section (§2.2), so
the JLWS core registry needs **no edit** — consumers that don't recognise it ignore it
(`index.html#discovery-model` forward-compatibility rule).

## 2. Concrete alignment edits

### 2.1 In `jeswr/lws-spec` (this repo)

None normative. The extension-service mechanism already covers §1's affordance.

### 2.2 In `jeswr/a2a-rdf-extension` — extend its `#relationship` section

Add one paragraph (informative, matching the section's existing register):

> **Linked Web Storage (JLWS).** A JLWS storage ([JLWS-CORE]) is a natural substrate for
> this extension's documents: Protocol Documents, ODRL policies, credential chains, and
> PROV traces are ordinary JLWS data resources under ordinary JLWS authorization. Two
> properties of that substrate matter here. (1) **Hash stability across representations:**
> the protocol hash is computed over the RDFC-1.0 canonicalization of the *parsed graph*
> (`#pd-hashing`), not over bytes — so a PD stored as Turtle and served as JSON-LD under
> JLWS's advertised `ContentNegotiation` capability (RDF Content Transformation Profile,
> `rdf-transform.html#round-trip`: the transformation preserves the graph) pins
> identically in either representation. (2) **Discovery:** a storage MAY advertise its
> controller's agent with the extension service entry
> `https://w3id.org/jeswr/a2a-rdf/v1#AgentInteractionService` (this document hereby
> defines that term: `serviceEndpoint` = the agent's A2A Agent Card URL; `conformsTo` =
> this extension's URI) in its storage description, using [JLWS-CORE]'s extension-service
> mechanism. Neither property adds a requirement to A2A agents or to JLWS servers.

### 2.3 Authorization-layer echo (no edit, recorded for completeness)

The extension's `#authorization` binds ODRL policies + AAC chains by reference. JLWS's
access layer is also strict ODRL (`index.html#access-requests-grants`, D15) with the ODRL
delegation extension adopted by reference (`index.html#delegation`). An agent whose
verified AAC chain warrants access can therefore have that access **materialised** as a
JLWS grant through the storage's `AccessRequestService` — same policy family end to end.
That flow is a runtime composition (accountable-agent-runtime territory), not a spec edit.

## 3. Test-vector plan

Two pure-function cases extending `agentic-solid-conformance`'s existing
`vectors/a2a-rdf/` suite (14 cases today; reference impl `@jeswr/solid-a2a`) — they need no
server, only a transform fixture:

| id | operation | expected | pins |
|---|---|---|---|
| `a2a-rdf/pd-hash-stable-across-representations` | `verify-pd-pin` of the same PD graph as Turtle **and** as JSON-LD (an rdf-1-faithful rendering) against one pin | both accept | a2a-rdf `#pd-hashing`; `rdf-transform.html#round-trip` |
| `a2a-rdf/pd-hash-rejects-graph-change` | `verify-pd-pin` of a JSON-LD rendering whose graph differs by one triple | reject | a2a-rdf `#pd-hashing` (the hash is the trust anchor) |

Plus the discovery cases in **this repo's** `test-vectors/vectors/discovery/` suite —
**LANDED** as `sd-agent-interaction-service` + `sd-agent-interaction-service-hostile-fails-closed`
(the second: a non-https `serviceEndpoint` fails closed under core#ssrf at the
consumption boundary; spec-derived discovery-shape cases, which D20 permits ahead of the
config-gated SD-builder implementation):

| id | operation | expected | pins |
|---|---|---|---|
| `sd-agent-interaction-service` | parse a storage description carrying the extension entry | agent-card URL extracted; unknown-type consumers unaffected | core `#discovery-model`, `#capability-registry` |

## 4. `feat/lws` implementation seam

Nearly nil — that is the point of verdict (d):

- **PD/policy/credential hosting**: already M1 (byte-native resources; RDF-readable under
  the landed transform opt-in).
- **`AgentInteractionService` entry**: one config-gated addition to the
  storage-description builder in `src/lws/mod.rs` (env-configured card URL; entry emitted
  only when set). No route, no auth change, no new module.

## 5. Sequencing

**Buildable now, trivial** (increment B in the [alignment sequence](./README.md#sequence)).
The two agentic-solid-conformance cases need only `@jeswr/solid-a2a` (published) and an
rdf-1 fixture pair; the storage-description entry is a one-liner behind config. The
relationship paragraph in `a2a-rdf-extension` is docs-only.
