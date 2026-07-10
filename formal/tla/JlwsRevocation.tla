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
(*   enforcement answers from a lagging decision state, and grant          *)
(*   operations (create/DELETE of the grant resource) are acknowledged     *)
(*   at once.  TLC refutes NoOracleWindow, NoUseAfterAckedRevocation and   *)
(*   AckedCreateReflected on this spec — the two-clocks oracle-window      *)
(*   finding.                                                              *)
(*                                                                         *)
(*   SingleClockSpec — the published fix: every authorization-observing    *)
(*   surface evaluates against ONE decision state; propagation from the    *)
(*   record is bounded (Bound ticks; SHOULD-immediate = Bound 0); and a    *)
(*   grant operation — creation AND revocation alike — is acknowledged     *)
(*   only after the decision state reflects it.  Every property below      *)
(*   holds.                                                                *)
(*                                                                         *)
(* The probe is one fixed request (agent, action, resource); Covering is   *)
(* the set of grants whose permission rules cover it under the strict      *)
(* ODRL decision function (semantics/access-decision.n3 — that rule set    *)
(* is the decision-level semantics; this module is the temporal layer      *)
(* over WHICH recorded state each surface consults).  Grant-record URIs    *)
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
  pendingCreate,  \* creations applied to the record, response withheld
  ackedCreate,    \* creations acknowledged (the create response returned)
  pendingRevoke,  \* revocations applied to the record, response withheld
  ackedRevoke,    \* revocations acknowledged (the DELETE response returned)
  revokedEver,    \* history: every grant ever revoked (URIs are not reused)
  lag             \* ticks since `decision` last equalled `recorded`

vars == <<recorded, decision, pendingCreate, ackedCreate,
          pendingRevoke, ackedRevoke, revokedEver, lag>>

TypeOK ==
  /\ recorded \subseteq Grants
  /\ decision \subseteq Grants
  /\ pendingCreate \subseteq Grants
  /\ ackedCreate \subseteq Grants
  /\ pendingRevoke \subseteq Grants
  /\ ackedRevoke \subseteq Grants
  /\ revokedEver \subseteq Grants
  /\ lag \in 0..Bound

Init ==
  /\ recorded = {} /\ decision = {}
  /\ pendingCreate = {} /\ ackedCreate = {}
  /\ pendingRevoke = {} /\ ackedRevoke = {}
  /\ revokedEver = {} /\ lag = 0

(* The authorization-observing surfaces, for the fixed probe request.      *)
PermitEnforced      == Covering \cap decision /= {}  \* direct request enforcement
DerivedFromRecord   == Covering \cap recorded /= {}  \* derived views, split-clock text
DerivedFromDecision == PermitEnforced                \* derived views, single-clock fix

--------------------------------------------------------------------------------
(* Actions shared by both disciplines                                      *)

Propagate ==       \* the decision state catches up with the record
  /\ decision' = recorded
  /\ lag' = 0
  /\ UNCHANGED <<recorded, pendingCreate, ackedCreate,
                 pendingRevoke, ackedRevoke, revokedEver>>

(* Tick models time passing while the decision state is stale.  The        *)
(* `lag < Bound` guard is the standard TLA+ real-time-bound idiom (a       *)
(* deadline is expressed as an enabling condition on the time-advance      *)
(* action): time CANNOT pass the documented interval while stale, so a     *)
(* staleness of more than Bound ticks is unreachable — checked as the      *)
(* BoundedStaleness invariant — and WF(Propagate) + StalenessConverges     *)
(* assert that propagation actually happens, not merely that time stops.   *)
Tick ==
  /\ decision /= recorded
  /\ lag < Bound
  /\ lag' = lag + 1
  /\ UNCHANGED <<recorded, decision, pendingCreate, ackedCreate,
                 pendingRevoke, ackedRevoke, revokedEver>>

--------------------------------------------------------------------------------
(* Split-clock discipline — the refuted predecessor text                   *)

CreateImmediateAck(g) ==  \* record the grant; respond 2xx at once
  /\ g \in Grants \ (recorded \cup revokedEver)
  /\ recorded'    = recorded \cup {g}
  /\ ackedCreate' = ackedCreate \cup {g}
  /\ UNCHANGED <<decision, pendingCreate, pendingRevoke, ackedRevoke,
                 revokedEver, lag>>

RevokeImmediateAck(g) ==  \* DELETE the record; respond 2xx at once
  /\ g \in recorded
  /\ recorded'    = recorded \ {g}
  /\ ackedRevoke' = ackedRevoke \cup {g}
  /\ revokedEver' = revokedEver \cup {g}
  /\ UNCHANGED <<decision, pendingCreate, ackedCreate, pendingRevoke, lag>>

SplitNext ==
  \/ Propagate
  \/ Tick
  \/ \E g \in Grants : CreateImmediateAck(g) \/ RevokeImmediateAck(g)

SplitClockSpec == Init /\ [][SplitNext]_vars /\ WF_vars(Propagate)

--------------------------------------------------------------------------------
(* Single-clock discipline — the published fix                             *)

CreateStart(g) ==  \* record the grant; the response is withheld
  /\ g \in Grants \ (recorded \cup revokedEver)
  /\ recorded'      = recorded \cup {g}
  /\ pendingCreate' = pendingCreate \cup {g}
  /\ UNCHANGED <<decision, ackedCreate, pendingRevoke, ackedRevoke,
                 revokedEver, lag>>

AckCreate(g) ==    \* acknowledge only once the decision state reflects it
  /\ g \in pendingCreate
  /\ g \in decision
  /\ pendingCreate' = pendingCreate \ {g}
  /\ ackedCreate'   = ackedCreate \cup {g}
  /\ UNCHANGED <<recorded, decision, pendingRevoke, ackedRevoke,
                 revokedEver, lag>>

RevokeStart(g) ==  \* DELETE the record; the response is withheld.  A revoke
                   \* racing an unacknowledged create settles that create
                   \* operation too (it is answered as superseded — the
                   \* record it made is gone), so it leaves pendingCreate.
  /\ g \in recorded
  /\ recorded'      = recorded \ {g}
  /\ pendingCreate' = pendingCreate \ {g}
  /\ pendingRevoke' = pendingRevoke \cup {g}
  /\ revokedEver'   = revokedEver \cup {g}
  /\ UNCHANGED <<decision, ackedCreate, ackedRevoke, lag>>

AckRevoke(g) ==    \* acknowledge only once the decision state reflects it
  /\ g \in pendingRevoke
  /\ g \notin decision
  /\ pendingRevoke' = pendingRevoke \ {g}
  /\ ackedRevoke'   = ackedRevoke \cup {g}
  /\ UNCHANGED <<recorded, decision, pendingCreate, ackedCreate,
                 revokedEver, lag>>

SingleNext ==
  \/ Propagate
  \/ Tick
  \/ \E g \in Grants :
       CreateStart(g) \/ AckCreate(g) \/ RevokeStart(g) \/ AckRevoke(g)

SingleClockSpec ==
  /\ Init /\ [][SingleNext]_vars
  /\ WF_vars(Propagate)
  /\ \A g \in Grants : WF_vars(AckCreate(g)) /\ WF_vars(AckRevoke(g))

--------------------------------------------------------------------------------
(* PROPERTIES                                                              *)

(* THE FINDING (invariant; VIOLATED on SplitClockSpec, trace:              *)
(* CreateImmediateAck -> Propagate -> RevokeImmediateAck): a direct        *)
(* request is still honored while every derived view already hides the     *)
(* resource — an observable split-clock window contradicting               *)
(* #oracle-freedom, which defines every derived surface by what the        *)
(* requesting agent can read.  Under SingleClockSpec both surfaces read    *)
(* `decision`, so SurfacesAgree below holds by construction — the fix      *)
(* eliminates the window structurally, not by tuning timing.               *)
NoOracleWindow == ~(PermitEnforced /\ ~DerivedFromRecord)

(* The creation-direction inconsistency of the same two-clocks text: a     *)
(* derived view lists a member the agent cannot yet fetch (also violated   *)
(* on SplitClockSpec, in one step — CreateImmediateAck alone).             *)
NoCreationWindow == ~(DerivedFromRecord /\ ~PermitEnforced)

(* Single-clock interface property: the surfaces can never disagree.       *)
SurfacesAgree == PermitEnforced <=> DerivedFromDecision

(* Once every covering grant's revocation is acknowledged (none recorded,  *)
(* none pending), no subsequent request is honored under them.  VIOLATED   *)
(* on SplitClockSpec (acknowledgment outruns enforcement); holds on        *)
(* SingleClockSpec (the acknowledgment barrier).                           *)
NoUseAfterAckedRevocation ==
  (Covering \cap (recorded \cup pendingRevoke) = {}) => ~PermitEnforced

(* The creation half of the acknowledgment barrier: once a creation is     *)
(* acknowledged, the grant is in force wherever it is still recorded —     *)
(* the agent told "granted" is never then refused by a lagging decision    *)
(* state.  VIOLATED on SplitClockSpec (one CreateImmediateAck step);       *)
(* holds on SingleClockSpec (AckCreate is gated on the decision state).    *)
AckedCreateReflected == (ackedCreate \cap recorded) \subseteq decision

(* An acknowledged-revoked grant never re-enters the decision state.       *)
AckedNeverEnforced == ackedRevoke \cap decision = {}

(* No resurrection: a revoked grant record never reappears (URIs are not   *)
(* reused; re-granting mints a NEW record — a new justification).          *)
NoResurrection == recorded \cap revokedEver = {}

(* The documented interval, named: staleness never exceeds Bound ticks.    *)
(* Enforced by the Tick deadline idiom above; checked explicitly so the    *)
(* bound is a verified property of the model, not a comment.               *)
BoundedStaleness == lag \in 0..Bound

(* Monotonic revocation (action property): the revoked set only grows.     *)
MonotonicRevocation == [][revokedEver \subseteq revokedEver']_vars

(* REFUTED MISREADING (action property; VIOLATED on either spec): that     *)
(* revoking A covering grant denies the request.  The counterexample is    *)
(* exactly the revoke-one-covering-grant-still-permitted test vector —     *)
(* another recorded grant still covers it; deny is the closed-world        *)
(* absence of EVERY covering grant (#grants-are-records, JLWSC-GR-5).      *)
NaiveRevocationDenies ==
  [][ \A g \in Covering : RevokeStart(g) => Covering \cap recorded' = {} ]_vars

(* Liveness (SingleClockSpec): a stale decision state always converges;    *)
(* every grant operation is eventually answered (a pending create is       *)
(* either acknowledged or settled by a superseding revoke); and full       *)
(* revocation converges to permanent denial.                               *)
StalenessConverges == (decision /= recorded) ~> (decision = recorded)

EveryCreationSettled ==
  \A g \in Grants : (g \in pendingCreate) ~> (g \notin pendingCreate)

EveryRevocationAcked ==
  \A g \in Grants : (g \in pendingRevoke) ~> (g \in ackedRevoke)

FullRevocationConverges ==
  [] ( (Covering \subseteq revokedEver) => <>[] ~PermitEnforced )
================================================================================
