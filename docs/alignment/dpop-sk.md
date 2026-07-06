<!-- AUTHORED-BY Claude Fable 5 -->

# Alignment: DPoP-SK × JLWS

**Spec aligned:** [DPoP-SK — Negotiated Symmetric Session Keys for DPoP-Bound Requests](https://github.com/jeswr/dpop-sk-spec)
(unofficial editor's draft; profile URI `https://w3id.org/jeswr/dpop-sk/v1`).

## 1. Composition verdict: (c) an AUTH-layer PoP presentation profile negotiated via RFC 9728

DPoP-SK is a **token-presentation** profile: it changes how an already-issued,
already-DPoP-bound access token is presented (one DPoP proof establishes a session key;
each request then carries an RFC 9421 `hmac-sha256` signature — its `#overview`,
`#attestation`). JLWS already names it as the second of its two negotiated PoP profiles:

- `index.html#presentation-pop`: "**DPoP-SK** [[DPOP-SK]] — the negotiated symmetric fast
  path … Its negotiation is already RFC 9728-based and composes here without change";
- `index.html#authz-discovery`: when PoP is offered, "the DPoP-SK members defined by
  [[DPOP-SK]] appear here" — i.e. in the protected resource metadata (PRM), next to
  the JLWS `jlws_storage_description` extension member.

It is not a storage-description capability: PoP profiles are a property of the **realm's
auth surface**, discovered where the rest of that surface is discovered — the RFC 9728 PRM
(DPoP-SK `#discovery` defines the `pop_session` PRM member for exactly this). Verdict:
**auth-layer profile, RFC 9728-negotiated.**

## 2. Concrete alignment edits

### 2.1 In `jeswr/lws-spec` (this repo) — applied on this branch

`index.html#presentation-pop` previously said a PoP-required realm signals DPoP-SK via
"the analogous required-member defined by [[DPOP-SK]]". **No such member exists** — the
DPoP-SK PRM member set is `pop_session{endpoint, algs, channel_bindings, profile}`
(`#discovery`), with no "required" flag — and none is needed: a DPoP-SK session is
established **from** a DPoP-bound access token (one DPoP proof at establishment,
`#establishment`), so RFC 9728's registered `dpop_bound_access_tokens_required: true`
already covers it; DPoP-SK's *availability* is signalled by `pop_session`'s presence
(the dpop-sk spec's own PRM example carries both members together). The sentence is
corrected accordingly. Net PRM contract on a JLWS realm:

| PRM member | Meaning on the realm |
|---|---|
| `dpop_bound_access_tokens_required: true` | PoP required (Bearer refused) — covers DPoP **and** DPoP-SK |
| `dpop_signing_alg_values_supported` | DPoP offered (RFC 9449) |
| `pop_session {endpoint, algs, channel_bindings, profile}` | DPoP-SK offered (DPoP-SK `#discovery`) |
| `jlws_storage_description` | JLWS storage description URI (core `#authz-discovery`) |

### 2.2 In `jeswr/dpop-sk-spec` — extend its `#relationship` section

Its "Relationship to DPoP and Solid-OIDC" covers only the Solid-OIDC context (where DPoP is
mandatory and "an access token MUST NOT ever be accepted bare"). Add a short subsection
"Relationship to Linked Web Storage (JLWS)" — ready-to-land text:

> **JLWS** ([JLWS-CORE]) discovers its authorization surface through the same RFC 9728
> protected resource metadata this profile negotiates through, so DPoP-SK composes with a
> JLWS realm without any new mechanism: the `pop_session` member appears in the realm's
> PRM beside JLWS's `jlws_storage_description` member. Two scoping notes:
> - JLWS's baseline presentation is **Bearer** ([JLWS-CORE] *Token presentation*), unlike
>   Solid-OIDC. This profile's never-bare rule is a property of **DPoP-bound tokens**:
>   the tokens this profile operates on always carry `cnf`, and a JLWS server already
>   refuses any `cnf`-bound token presented bare ([JLWS-CORE] *Validation by the storage
>   server*, step 5). Bearer tokens without `cnf` on a Bearer-baseline realm are outside
>   this profile's scope — for a non-opting client, a JLWS server is observed unchanged,
>   exactly as this profile already promises for Solid servers.
> - A JLWS realm designated PoP-required signals it with
>   `dpop_bound_access_tokens_required: true`; that single member covers DPoP-SK too,
>   since every DPoP-SK session is established from a DPoP-bound token
>   (`#establishment`). This profile deliberately mints no separate required-member.

No normative change to establishment, key derivation, attestation, anti-replay, lifetime,
or downgrade rules (`#establishment` … `#downgrade`): they transfer verbatim.

## 3. Test-vector plan

**STATUS: LANDED** — `test-vectors/vectors/dpop-sk/`, 14 cases (the 8 below, widened
during spec-derivation with: a second client fail-closed-negotiation case, an
establishment-refused-for-a-non-cnf-token case, a cross-target-transplant case, a
token-substitution case, a verify-then-mark window-integrity case, and a
stripped-attestation/no-bearer-fallback case; the planned `prm-carries-pop-session` /
`pop-required-single-member` / `establish-ok-none-binding` / `attest-*` verdicts are as
tabled, with `establish-ok` pinning response *shape* only — under `cb=none` the key is
CSPRNG output, not a derivable fixture). See `test-vectors/README.md` (operations 12
and the http-exchange `popSession`/`popSkSessions` state).

New suite `test-vectors/vectors/dpop-sk/` in this repo. This **narrows the standing
GAPS.md deferral** (core#rs-validation row: "full DPoP proof matrices belong with the
DPoP-SK spec's own planned vectors") — these are those vectors, homed here because the
system under test is the JLWS server surface. The `channel_bindings: "none"` flavour is
fully deterministic (HKDF from committed TEST-ONLY key material, per D20(e)), so it is
vectorable today; `tls-exporter` cases remain in GAPS.md (they need a live TLS exporter
interface, which no fixture can supply).

| id | operation | expected | pins |
|---|---|---|---|
| `prm-carries-pop-session` | build PRM for a DPoP-SK-enabled realm | `pop_session` + `jlws_storage_description` coexist; `profile: …/dpop-sk/v1` | core `#authz-discovery`; DPoP-SK `#discovery` |
| `prm-unknown-profile-ignored` | client evaluates PRM with unrecognised `pop_session.profile` | client MUST NOT attempt establishment | DPoP-SK `#discovery` (fail-closed negotiation) |
| `pop-required-single-member` | PRM with `dpop_bound_access_tokens_required: true` + `pop_session` | client may use DPoP **or** DPoP-SK; Bearer refused | core `#presentation-pop` (as corrected); DPoP-SK `#establishment` |
| `establish-ok-none-binding` | establishment request, `channel_bindings: none`, valid DPoP proof | session created; deterministic derived key matches fixture | DPoP-SK `#establishment-request`, `#kd-none` |
| `attest-ok` | request signed `hmac-sha256` with session key | accepted | DPoP-SK `#attestation-verification` |
| `attest-bad-sig` | tampered covered component | rejected → standard DPoP challenge | DPoP-SK `#attestation-verification`, `#downgrade` |
| `attest-replay` | same nonce replayed inside window | rejected (verify-then-mark) | DPoP-SK `#anti-replay` |
| `attest-expired-session` | attestation after session lifetime | rejected → re-establishment | DPoP-SK `#lifetime` |

(The GAPS.md `core#rs-validation` row now points at the landed suite, retaining the
`tls-exporter` flavour — plus the profile's stateful/deployment-policy slivers — as
un-vectorable in a dedicated DPoP-SK subsection.)

## 4. `feat/lws` implementation seam

`solid-server-rs` already carries the DPoP-SK engine from the high-throughput-PoP work:
`src/pop/sk/{handlers,derive,sig,store,verify,window}.rs` (establishment handler, HKDF
derivation, RFC 9421 signing base, session store, attestation verify, anti-replay
window), and M2's LWS auth **already reuses** its PRM builder
(`src/lws/auth.rs` extends `crate::pop::sk::handlers::protected_resource_metadata_json`
with `authorization_servers` + `jlws_storage_description` — see `src/lws/mod.rs` M2
notes). What remains is wiring, not construction:

1. **PRM**: ensure the LWS-extended PRM inherits `pop_session` when the SK engine is
   enabled (one merge point, `src/lws/auth.rs`).
2. **Verify chokepoint**: at `LwsBearerAuth`'s PoP step (rs-validation step 5 — the same
   single chokepoint that enforces audience containment and RAR narrowing), accept a
   valid DPoP-SK attestation as satisfying the proof requirement for a `cnf`-bound token,
   delegating to `src/pop/sk/verify.rs`.
3. **Flavour gating**: advertise `channel_bindings: ["none"]` until the server terminates
   TLS in-process (the dpop-sk spec's own constraint: `tls-exporter` MUST NOT be
   advertised behind a TLS-terminating proxy — `#discovery`); `tls-exporter` joins when
   native TLS lands.

This is the M4 seam `src/lws/mod.rs` reserves as "DPoP-bound LWS-audience token validation
for a PoP-required realm (§presentation-pop end-to-end)", widened to both PoP profiles.

## 5. Sequencing

**Buildable now** (increment A in the [alignment sequence](./README.md#sequence)): no
external gate — composes with the landed M2 auth chain (`feat/lws` @ `d0e97d5`) and the
existing `src/pop/sk` engine. The only deferred sliver is the `tls-exporter` flavour
(gated on in-process TLS termination).
