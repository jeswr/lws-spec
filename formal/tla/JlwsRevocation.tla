---------------------------- MODULE JlwsRevocation ----------------------------
(***************************************************************************)
(* AUTHORED-BY Claude Fable 5                                              *)
(*                                                                         *)
(* The JLWS access-grant + revocation lifecycle                            *)
(* (index.html#grants-are-records, #oracle-freedom; DECISIONS.md D22).     *)
(*                                                                         *)
(* One state space, two disciplines:                                       *)
(*                                                                         *)
(*   SplitClockSpec — the REFUTED predecessor text ("Grant creation and    *)
(*   revocation MUST be reflected in enforcement within a bounded,         *)
(*   documented interval" + "Derived views ... MUST reflect revocation     *)
(*   immediately"): derived views answer from the grant RECORD, request    *)
(*   enforcement answers from a lagging decision state, and the record     *)
(*   operation (the DELETE of the grant resource) is acknowledged at       *)
(*   once.  TLC refutes NoOracleWindow and NoUseAfterAckedRevocation on    *)
(*   this spec — the two-clocks oracle-window finding.                     *)
(*                                                                         *)
(*   SingleClockSpec — the published fix: every authorization-observing    *)
(*   surface evaluates against ONE decision state; propagation from the    *)
(*   record is bounded (Bound ticks; SHOULD-immediate = Bound 0); the      *)
(*   record operation is acknowledged only after the decision state        *)
(*   reflects it.  Every property below holds.                             *)
(*                                                                         *)
(* The probe is one fixed request (agent, action, resource); Covering is   *)
(* the set of grants whose permission rules cover it under the strict      *)
(* ODRL decision function (semantics/access-decision.n3 — that rule set    *)
(* is the decision-level semantics; this module is the temporal layer     *)
(* over WHICH recorded state each surface consults).  Grant-record URIs   *)
(* are never reused after DELETE (re-granting mints a new record), which   *)
(* is what makes NoResurrection well-formed.                               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  Grants,      \* universe of grant-record URIs
  Covering,    \* the subset whose permission rules cover the probe request
  Bound        \* the "bounded, documented interval", abstracted to ticks

ASSUME Covering \subseteq Grants /\ Bound \in Nat

VARIABLES
  recorded,       \* grant records currently in the grant container
  decision,       \* the decision state request enforcement consults
  pendingRevoke,  \* revocations applied to the record, response withheld
  ackedRevoke,    \* revocations acknowledged (the DELETE response returned)
  revokedEver,    \* history: every grant ever revoked (URIs are not reused)
  lag             \* ticks since `decision` last equalled `recorded`

vars == <<recorded, decision, pendingRevoke, ackedRevoke, revokedEver, lag>>

TypeOK ==
  /\ recorded \subseteq Grants
  /\ decision \subseteq Grants
  /\ pendingRevoke \subseteq Grants
  /\ ackedRevoke \subseteq Grants
  /\ revokedEver \subseteq Grants
  /\ lag \in 0..Bound

Init ==
  /\ recorded = {} /\ decision = {} /\ pendingRevoke = {}
  /\ ackedRevoke = {} /\ revokedEver = {} /\ lag = 0

(* The authorization-observing surfaces, for the fixed probe request.      *)
PermitEnforced      == Covering \cap decision /= {}  \* direct request enforcement
DerivedFromRecord   == Covering \cap recorded /= {}  \* derived views, split-clock text
DerivedFromDecision == PermitEnforced                \* derived views, single-clock fix

--------------------------------------------------------------------------------
(* Actions shared by both disciplines                                      *)

Create(g) ==       \* the storage controller records a new grant
  /\ g \in Grants \ (recorded \cup revokedEver)
  /\ recorded' = recorded \cup {g}
  /\ UNCHANGED <<decision, pendingRevoke, ackedRevoke, revokedEver, lag>>

Propagate ==       \* the decision state catches up with the record
  /\ decision' = recorded
  /\ lag' = 0
  /\ UNCHANGED <<recorded, pendingRevoke, ackedRevoke, revokedEver>>

Tick ==            \* time passes while stale; the documented bound caps it
  /\ decision /= recorded
  /\ lag < Bound
  /\ lag' = lag + 1
  /\ UNCHANGED <<recorded, decision, pendingRevoke, ackedRevoke, revokedEver>>

--------------------------------------------------------------------------------
(* Split-clock discipline — the refuted predecessor text                   *)

RevokeImmediateAck(g) ==  \* DELETE the record; 2xx at once; decision lags
  /\ g \in recorded
  /\ recorded'    = recorded \ {g}
  /\ ackedRevoke' = ackedRevoke \cup {g}
  /\ revokedEver' = revokedEver \cup {g}
  /\ UNCHANGED <<decision, pendingRevoke, lag>>

SplitNext ==
  \/ Propagate
  \/ Tick
  \/ \E g \in Grants : Create(g) \/ RevokeImmediateAck(g)

SplitClockSpec == Init /\ [][SplitNext]_vars /\ WF_vars(Propagate)

--------------------------------------------------------------------------------
(* Single-clock discipline — the published fix                             *)

RevokeStart(g) ==  \* DELETE the record; the response is withheld
  /\ g \in recorded
  /\ recorded'      = recorded \ {g}
  /\ pendingRevoke' = pendingRevoke \cup {g}
  /\ revokedEver'   = revokedEver \cup {g}
  /\ UNCHANGED <<decision, ackedRevoke, lag>>

AckRevoke(g) ==    \* acknowledge only once the decision state reflects it
  /\ g \in pendingRevoke
  /\ g \notin decision
  /\ pendingRevoke' = pendingRevoke \ {g}
  /\ ackedRevoke'   = ackedRevoke \cup {g}
  /\ UNCHANGED <<recorded, decision, revokedEver, lag>>

SingleNext ==
  \/ Propagate
  \/ Tick
  \/ \E g \in Grants : Create(g) \/ RevokeStart(g) \/ AckRevoke(g)

SingleClockSpec ==
  /\ Init /\ [][SingleNext]_vars
  /\ WF_vars(Propagate)
  /\ \A g \in Grants : WF_vars(AckRevoke(g))

--------------------------------------------------------------------------------
(* PROPERTIES                                                              *)

(* THE FINDING (invariant; VIOLATED on SplitClockSpec, trace:              *)
(* Create -> Propagate -> RevokeImmediateAck): a direct request is still   *)
(* honored while every derived view already hides the resource — an        *)
(* observable split-clock window contradicting #oracle-freedom, which      *)
(* defines every derived surface by what the requesting agent can read.    *)
(* Under SingleClockSpec both surfaces read `decision`, so the             *)
(* corresponding SurfacesAgree below holds by construction — the fix       *)
(* eliminates the window structurally, not by tuning timing.               *)
NoOracleWindow == ~(PermitEnforced /\ ~DerivedFromRecord)

(* The creation-direction inconsistency of the same two-clocks text: a     *)
(* derived view lists a member the agent cannot yet fetch (also violated   *)
(* on SplitClockSpec, in one step — Create alone).                         *)
NoCreationWindow == ~(DerivedFromRecord /\ ~PermitEnforced)

(* Single-clock interface property: the surfaces can never disagree.       *)
SurfacesAgree == PermitEnforced <=> DerivedFromDecision

(* Once every covering grant's revocation is acknowledged (none recorded,  *)
(* none pending), no subsequent request is honored under them.  VIOLATED   *)
(* on SplitClockSpec (acknowledgment outruns enforcement); holds on        *)
(* SingleClockSpec (the acknowledgment barrier).                           *)
NoUseAfterAckedRevocation ==
  (Covering \cap (recorded \cup pendingRevoke) = {}) => ~PermitEnforced

(* An acknowledged-revoked grant never re-enters the decision state.       *)
AckedNeverEnforced == ackedRevoke \cap decision = {}

(* No resurrection: a revoked grant record never reappears (URIs are not   *)
(* reused; re-granting mints a NEW record — a new justification).          *)
NoResurrection == recorded \cap revokedEver = {}

(* Monotonic revocation (action property): the revoked set only grows.     *)
MonotonicRevocation == [][revokedEver \subseteq revokedEver']_vars

(* REFUTED MISREADING (action property; VIOLATED on either spec): that     *)
(* revoking A covering grant denies the request.  The counterexample is    *)
(* exactly the revoke-one-covering-grant-still-permitted test vector —     *)
(* another recorded grant still covers it; deny is the closed-world        *)
(* absence of EVERY covering grant (#grants-are-records, JLWSC-GR-5).      *)
NaiveRevocationDenies ==
  [][ \A g \in Covering : RevokeStart(g) => Covering \cap recorded' = {} ]_vars

(* Liveness (SingleClockSpec): every revocation is eventually              *)
(* acknowledged, and full revocation converges to permanent denial.        *)
EveryRevocationAcked ==
  \A g \in Grants : (g \in pendingRevoke) ~> (g \in ackedRevoke)

FullRevocationConverges ==
  [] ( (Covering \subseteq revokedEver) => <>[] ~PermitEnforced )
================================================================================
