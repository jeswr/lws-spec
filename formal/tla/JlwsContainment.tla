---------------------------- MODULE JlwsContainment ----------------------------
(***************************************************************************)
(* AUTHORED-BY Claude Fable 5                                              *)
(*                                                                         *)
(* Containment integrity under the JLWS atomic-membership discipline       *)
(* (index.html#containment, #http-create-post, #http-delete, #metadata;    *)
(* JLWSC-CTN-3/4, JLWSC-POST-6, JLWSC-MD-2; DECISIONS.md D3/D4):           *)
(* creation MUST atomically add the resource to its parent's items list;   *)
(* deletion MUST atomically remove it; `Depth: infinity` DELETE removes    *)
(* the whole subtree; linkset/membership updates are atomic with the       *)
(* resource operation.                                                     *)
(*                                                                         *)
(*   AtomicSpec     — resource existence and parent membership change in   *)
(*                    one step.  All invariants HOLD: no orphans, the      *)
(*                    listing is exactly the live children, no dangling    *)
(*                    members, the storage root persists.                  *)
(*   SplitPhaseSpec — the implementation the MUSTs forbid: existence and   *)
(*                    membership updated in separate steps.  TLC refutes   *)
(*                    MembershipExact in one step (a created resource not  *)
(*                    yet listed) and NoDanglingMembers via the deletion   *)
(*                    phases (a listing naming a deleted resource — an     *)
(*                    existence oracle per #oracle-freedom).               *)
(*                                                                         *)
(* The URI universe is a fixed path-aligned tree (D4: child URI = parent   *)
(* URI + one segment), so acyclicity is structural — checked once as an    *)
(* ASSUME over the constant Parent relation, not as a state invariant.     *)
(***************************************************************************)
EXTENDS FiniteSets

Root == "s"                                        \* the storage root container
Uris == {"s", "s/a", "s/a/x", "s/a/y", "s/b"}
Containers == {"s", "s/a"}
Parent == [u \in Uris \ {Root} |->
             IF u \in {"s/a", "s/b"} THEN "s" ELSE "s/a"]

(* Descendants via the (depth-2) parent closure of this fixed universe.    *)
Under(c) ==
  LET kids == {u \in Uris \ {Root} : Parent[u] = c}
  IN  kids \cup {u \in Uris \ {Root} : Parent[u] \in kids}

ASSUME \A u \in Uris \ {Root} : u \notin Under(u)   \* path alignment is acyclic
ASSUME \A u \in Uris \ {Root} : Parent[u] \in Containers

VARIABLES
  exists,  \* live resources
  listed   \* resources currently present in their parent's items list

vars == <<exists, listed>>

TypeOK == exists \subseteq Uris /\ listed \subseteq Uris \ {Root}

Init == exists = {Root} /\ listed = {}

--------------------------------------------------------------------------------
(* Atomic discipline — what the spec mandates                              *)

CreateAtomic(r) ==   \* create + membership in one step
  /\ r \in Uris \ exists
  /\ Parent[r] \in exists
  /\ exists' = exists \cup {r}
  /\ listed' = listed \cup {r}

DeleteAtomic(r) ==   \* delete the subtree + its membership in one step
                     \* (Depth: infinity; for a data resource the subtree
                     \* is just itself)
  /\ r \in exists \ {Root}
  /\ LET gone == {r} \cup (Under(r) \cap exists)
     IN  /\ exists' = exists \ gone
         /\ listed' = listed \ gone

AtomicNext == \E r \in Uris : CreateAtomic(r) \/ DeleteAtomic(r)

AtomicSpec == Init /\ [][AtomicNext]_vars

--------------------------------------------------------------------------------
(* Split-phase discipline — what the MUSTs forbid                          *)

CreatePhase1(r) ==   \* resource written, membership not yet updated
  /\ r \in Uris \ exists
  /\ Parent[r] \in exists
  /\ exists' = exists \cup {r}
  /\ UNCHANGED listed

CreatePhase2(r) ==   \* membership catches up
  /\ r \in exists \ ({Root} \cup listed)
  /\ listed' = listed \cup {r}
  /\ UNCHANGED exists

DeletePhase1(r) ==   \* resource gone, membership still names it
  /\ r \in exists \ {Root}
  /\ Under(r) \cap exists = {}
  /\ exists' = exists \ {r}
  /\ UNCHANGED listed

DeletePhase2(r) ==   \* membership catches up
  /\ r \in listed
  /\ r \notin exists
  /\ listed' = listed \ {r}
  /\ UNCHANGED exists

SplitNext == \E r \in Uris :
  CreatePhase1(r) \/ CreatePhase2(r) \/ DeletePhase1(r) \/ DeletePhase2(r)

SplitPhaseSpec == Init /\ [][SplitNext]_vars

--------------------------------------------------------------------------------
(* INVARIANTS                                                              *)

RootPersists == Root \in exists

(* Every live resource hangs off a live parent — no orphans.               *)
NoOrphans == \A u \in exists \ {Root} : Parent[u] \in exists

(* The listing is exactly the live children (fail-closed steady state of   *)
(* #containment + D12): violated by SplitPhaseSpec in one step.            *)
MembershipExact == listed = exists \ {Root}

(* A listing never names a resource that does not exist — the weaker half; *)
(* a dangling member is an existence/deletion oracle (#oracle-freedom).    *)
NoDanglingMembers == listed \subseteq exists
================================================================================
