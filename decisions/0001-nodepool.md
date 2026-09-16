# 0001 -- NodePool direction (D-01)

- Status: ACCEPTED (direction only; binding deferred to SkipList v0.4.0)
- Severity: S1 (outlives many members; the single most consequential
  cross-package call)
- Date: 2026-09-17
- Session: S0 (scaffold)

## Context

Pointer-based members (SkipList, and the later Treap / Scapegoat / SplayTree /
OrderStatTree) need a pointer-free slot allocator: a free-list over parallel
`Uint32Array` link columns, `NIL = 0` with slot 0 unused, allocating a slot
INDEX rather than a heap object so nothing is collected per insert. This is the
SAME primitive as `@zakkster/lite-o1`'s `SlotPool` and `@zakkster/lite-arena`'s
Arena.

The failure mode is forking it three ways: lite-o1 already has private pools
(FreqO1 / BucketQueue / TimerWheel each carry one), its public `SlotPool` was
DEFERRED (lite-o1 ADR-0003) and never shipped, and lite-arena has its own. If
lite-logn adds a fourth private fork, the suite has four subtly-different
allocators and no shared correctness story.

Note the scope of the problem: this call BLOCKS only pointer-based members.
The array-embedded Tier-1 members -- BinaryHeap, Fenwick, SegmentTree -- live in
flat typed arrays with index arithmetic and need NO NodePool at all. So the
direction must be coherent now (so the array members do not paint the substrate
into a corner), but the IMPLEMENTATION is not needed until the first pointer
member.

## Decision

**Depend on ONE shared pointer-free slot-allocator primitive; do NOT fork it
three ways.** lite-logn records the INTENT to reconcile into a single shared
primitive (leaning toward re-exporting / depending on lite-o1's `SlotPool` once
it is made public, rather than shipping a fourth private variant). Until a
pointer-based member (SkipList, v0.4.0) actually needs it, lite-logn ships
NOTHING public and NOTHING private for the pool -- there is no implementation in
this session.

The array-embedded members (BinaryHeap / Fenwick / SegmentTree) do NOT use a
NodePool and are unaffected by this decision.

## Consequences

- S0 through SegmentTree (v0.3.0) ship with no allocator code at all.
- SkipList (v0.4.0) is where D-01 BINDS: it must reconcile against the shared
  primitive, not fork a private one. That session owns the final call (re-export
  lite-o1 `SlotPool`, depend on lite-arena, or promote a single shared
  primitive) and records it in its own ADR.
- The suite-wide invariant stated in ROADMAP section 6 holds: one free-list slot
  allocator across the suite, reconciled, never forked.

## Alternatives rejected

- **Fork a private lite-logn pool now.** Rejected: it is the exact substrate
  failure the suite refuses, and nothing in S0..v0.3.0 needs it.
- **Implement a public NodePool member in S0.** Rejected: the S0 non-goals
  forbid a NodePool implementation; deciding the direction is enough, and the
  real design pressure (what SkipList needs) is not present yet.
