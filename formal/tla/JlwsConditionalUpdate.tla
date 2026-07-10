------------------------- MODULE JlwsConditionalUpdate -------------------------
(***************************************************************************)
(* AUTHORED-BY Claude Fable 5                                              *)
(*                                                                         *)
(* Lost-update freedom under the JLWS strict conditional-write discipline  *)
(* (index.html#http-update, #metadata-updates; JLWSC-UPD-1, JLWSC-MU-4):   *)
(* a server MUST reject an unconditional PUT/PATCH to an existing          *)
(* resource with 428 Precondition Required, and a stale If-Match with 412  *)
(* Precondition Failed (strong comparison).                                *)
(*                                                                         *)
(*   StrictSpec         — every applied write carries If-Match equal to    *)
(*                        the version its writer last observed.            *)
(*                        NoLostUpdate HOLDS.                              *)
(*   UnconditionalSpec  — a server that additionally accepts               *)
(*                        unconditional overwrites.  TLC refutes           *)
(*                        NoLostUpdate (trace: both writers read v1; one   *)
(*                        applies a conditional write; the other           *)
(*                        overwrites unconditionally without ever having   *)
(*                        observed the first write) — the counterexample   *)
(*                        justifying the MUST-428 rule.                    *)
(*                                                                         *)
(* `version` abstracts the resource's strong ETag (rotated on every        *)
(* applied write).  A rejected write (428/412) changes no server state,    *)
(* so it needs no action: stuttering covers it; the writer re-reads.       *)
(* Per-writer PROGRESS is deliberately not asserted — optimistic           *)
(* concurrency admits livelock between racing writers; retry policy is a   *)
(* client concern, not a server MUST.                                      *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  Writers,     \* concurrent clients
  MaxVersion   \* finitization bound on the version counter

ASSUME MaxVersion \in Nat /\ MaxVersion >= 1

VARIABLES
  version,   \* the resource's current version — its strong ETag
  observed,  \* observed[w] = the version w last read (0 = never read)
  lost       \* TRUE once a write overwrote a state its writer never observed

vars == <<version, observed, lost>>

TypeOK ==
  /\ version \in 1..MaxVersion
  /\ observed \in [Writers -> 0..MaxVersion]
  /\ lost \in BOOLEAN

Init ==
  /\ version = 1
  /\ observed = [w \in Writers |-> 0]
  /\ lost = FALSE

Read(w) ==              \* GET: the writer captures the current ETag
  /\ observed' = [observed EXCEPT ![w] = version]
  /\ UNCHANGED <<version, lost>>

WriteConditional(w) ==  \* PUT/PATCH with If-Match = the observed ETag;
                        \* applies only when current (a stale If-Match is
                        \* a 412 no-op — stuttering)
  /\ observed[w] = version
  /\ version < MaxVersion
  /\ version' = version + 1
  /\ observed' = [observed EXCEPT ![w] = version + 1]  \* response ETag
  /\ UNCHANGED lost

WriteUnconditional(w) == \* the write the spec forbids a server to accept
  /\ version < MaxVersion
  /\ version' = version + 1
  /\ observed' = [observed EXCEPT ![w] = version + 1]
  /\ lost' = (lost \/ observed[w] /= version)
       \* applied over a state the writer never observed: an update is lost

StrictNext == \E w \in Writers : Read(w) \/ WriteConditional(w)

UnconditionalNext ==
  \E w \in Writers : Read(w) \/ WriteConditional(w) \/ WriteUnconditional(w)

StrictSpec        == Init /\ [][StrictNext]_vars
UnconditionalSpec == Init /\ [][UnconditionalNext]_vars

--------------------------------------------------------------------------------
(* No applied write ever overwrites a state its writer did not observe.    *)
NoLostUpdate == ~lost
================================================================================
