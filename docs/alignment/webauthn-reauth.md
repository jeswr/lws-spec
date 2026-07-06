<!-- AUTHORED-BY Claude Fable 5 -->

# Alignment: WebAuthn Re-Auth × JLWS

**Spec aligned:** the redirect-free WebAuthn re-authentication profile — wire contract
shipped as [`jeswr/solid-webauthn-reauth`](https://github.com/jeswr/solid-webauthn-reauth)
(`./protocol` module); companion editor's draft `jeswr/solid-webauthn-reauth-spec`
(local-only pending publication — a standing `needs:user`).

## 1. Composition verdict: (c) an AUTH-layer profile — specifically, a JLWS AUTHENTICATION SUITE

JLWS's authentication architecture is suite-pluggable (`index.html#suites`): a suite is "a
defined serialization and validation mechanism for a concrete class of authentication
credential, identified by an OAuth token-type URI" (`index.html#terminology`), presented as
the `subject_token` of the RFC 8693 exchange (`index.html#token-exchange`). The WebAuthn
re-auth profile is *already* absorbed at exactly that seam: `index.html#suite-webauthn`
adopts its wire contract verbatim — "packaged for presentation as an RFC 8693
`subject_token` exactly as specified by the wire contract of [[WEBAUTHN-REAUTH]]", with
"Token type: the URI minted by that contract"
(`urn:solid:token-type:webauthn-assertion`, the spec's `#token-exchange`).

Note the **generalisation** this composition performs: in its Solid-OIDC home the profile
is a *re*-authentication fast path (an Application that already holds a session refreshes
without redirect); in JLWS the same assertion-bundle-as-subject-token contract serves as a
**first-class authentication suite** — the passkey registration at the authorization
server (`#registration`) is the only prerequisite, with no prior interactive OIDC flow
required by the JLWS layering. That is precisely why D7 ships it in the core suite set.

It is **not** a storage-description capability (auth suites are an authorization-server
surface, advertised via RFC 8414 `subject_token_types_supported` —
`index.html#credential-model`, `#authz-discovery`) and not a PoP *presentation* profile
(that is DPoP/DPoP-SK's layer; this suite governs what happens *before* issuance).

## 2. Concrete alignment edits

### 2.1 In `jeswr/lws-spec` (this repo)

None now. `#suite-webauthn` already binds the wire contract, and the `[[WEBAUTHN-REAUTH]]`
biblio entry's status line ("companion editor's draft in preparation") is accurate while
`solid-webauthn-reauth-spec` remains unpublished. **Follow-up on publication** (the
`needs:user`): repoint the biblio to the published spec and cite its section anchors
instead of the library's `./protocol` module.

### 2.2 In `jeswr/solid-webauthn-reauth-spec` — a "Relationship to LWS (JLWS)" section

Add after its `#relationship` ("Relationship to existing specifications") — ready-to-land
text:

> **Linked Web Storage (JLWS).** [JLWS-CORE] adopts this profile's assertion bundle as its
> WebAuthn authentication suite ([JLWS-CORE] *WebAuthn suite*): the bundle is the
> `subject_token` of a JLWS RFC 8693 token exchange, under this specification's
> `subject_token_type`, with the OP-side verification of `#verification`,
> `#challenge-lifecycle`, and `#errors` applying unchanged. Three mappings:
> - **Trust link.** This profile's RS↔OP trust is Solid-OIDC's `solid:oidcIssuer`
>   (`#rs-trust`); in JLWS the identical link is the CID service entry of type
>   `jlws:OpenIdProvider` in the subject's controlled identifier document ([JLWS-CORE]
>   *Identity documents* — its stated analogue of `solid:oidcIssuer`). As here, the JLWS
>   storage server needs no WebAuthn awareness: it validates the issued access token only.
> - **Suite advertisement.** A JLWS authorization server offering this suite lists this
>   specification's `subject_token_type` in `subject_token_types_supported`
>   ([JLWS-CORE] *Authentication credential data model*).
> - **Issued-token profile.** This specification issues only DPoP-bound tokens
>   (`#token-exchange`: "there is no Bearer variant"); JLWS's baseline presentation is
>   Bearer with proof-of-possession as a negotiated option ([JLWS-CORE] *Token
>   presentation*). These compose without conflict, in this profile's favour: when the
>   subject token is a WebAuthn assertion under this specification, the exchange carries a
>   DPoP proof and the issued JLWS `at+jwt` carries `cnf.jkt` — a JLWS server then never
>   accepts it bare ([JLWS-CORE] *Validation by the storage server*, step 5). A JLWS
>   deployment wanting Bearer issuance from passkey authentication is operating outside
>   this profile and takes on the Bearer risk analysis of [JLWS-CORE] itself; this
>   specification's no-Bearer rule is unchanged.
> - The re-authentication framing generalises: a JLWS client MAY use this suite as its
>   only authentication mechanism (registration per `#registration` being the
>   prerequisite), not merely as a session-refresh fast path.

The issued-token paragraph is the one genuinely load-bearing reconciliation: it keeps this
spec's "only sender-constrained tokens" invariant intact (scoped to exchanges under this
profile) while leaving JLWS's D9 Bearer baseline intact (scoped to everything else).

## 3. Test-vector plan

**STATUS: LANDED** — the 4 cases below plus an advisory negative twin of the
advertisement case (`webauthn-suite-omitted-flagged`), as `auth/webauthn-*` (auth suite
now 36 cases; operations 15–16 in `test-vectors/README.md`).

Small extension to this repo's existing `test-vectors/vectors/auth/` suite (the exchange
side is already vectored there — 31 cases at the time of this design). New cases, all
deterministic (the wire contract's decode is dependency-free and fail-closed):

| id | operation | expected | pins |
|---|---|---|---|
| `webauthn-bundle-decode-ok` | decode a valid assertion bundle fixture | accepted; fields extracted | wire contract (`./protocol`); core `#suite-webauthn` |
| `webauthn-bundle-noncanonical-b64url` | decode with non-canonical base64url padding/alphabet | rejected (fail-closed) | wire contract canonical-base64url rule |
| `webauthn-suite-advertised` | RFC 8414 metadata fixture | `subject_token_types_supported` includes the suite's token-type URI | core `#credential-model`, `#authz-discovery` |
| `webauthn-issued-token-pop-bound` | validate an at+jwt issued via this suite, presented bare | rejected (`cnf` present ⇒ never bare) | core `#rs-validation` step 5; spec `#token-exchange` |

(4 cases. The full OP-side verification matrix — origin binding, signCount regression,
challenge replay, the coarse `invalid_grant` error contract — belongs to
`solid-webauthn-reauth-spec`'s own planned vectors: it is AS behaviour, not storage-server
behaviour, and this suite vectors the JLWS server + metadata surfaces only.)

## 4. `feat/lws` implementation seam

**None in `solid-server-rs`** — by design on both sides: the spec's `#rs-trust` ("A
Resource Server MUST NOT need any WebAuthn awareness") and JLWS's suite architecture (the
RFC 8693 exchange "is the authorization server's job (lws-keycloak); this server only
verifies the resulting token" — `src/lws/mod.rs` M2 notes). M2's `LwsBearerAuth` is
suite-agnostic and already enforces the one server-visible consequence (`cnf`-bound ⇒
never bare). The implementation home is **`jeswr/lws-keycloak`** (the AS prototype): the
WebAuthn suite's challenge issuance, registration, and exchange verification land there,
outside `feat/lws`.

## 5. Sequencing

**Docs buildable now; implementation external.** Increment C (docs) covers the
Relationship-to-LWS section and the 4 vector cases (the first three need no
implementation at all — decode + fixture shape; the fourth reuses M2's landed bare-`cnf`
refusal). AS-side implementation is `lws-keycloak` work, sequenced independently of
`feat/lws`; the spec-repo publication remains a `needs:user`, after which the lws-spec
biblio upgrade in §2.1 lands.
