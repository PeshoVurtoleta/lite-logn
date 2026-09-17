# 0006 -- SkipList: the D-01 bind, the PRNG, randomized honesty, level columns (D-06)

- Status: ACCEPTED
- Severity: S1 (binds the cross-package NodePool direction D-01 for the first
  pointer-based member; sets the family's randomized-member honesty contract)
- Date: 2026-09-17
- Session: SkipList (v0.4.0)

## Context

SkipList is the family's FIRST randomized member and its FIRST pointer-based one.
Where BinaryHeap / Fenwick / SegmentTree embed a fixed-shape tree in index
arithmetic and need no allocator, a skip list's shape is random, so it needs real
per-node links -- exactly the pressure D-01 (decisions/0001-nodepool.md) deferred to
"the first pointer member". Four calls had to be settled before code:

1. **The D-01 bind.** D-01 recorded the INTENT to reconcile the pointer-free slot
   allocator against `@zakkster/lite-o1`'s `SlotPool` "leaning toward re-exporting /
   depending on lite-o1". SkipList is where that binds. Depend on lite-o1 at
   runtime, or ship an in-file private pool?
2. **The PRNG.** A skip list needs a random level per node. Which generator, and how
   is a level drawn without allocating?
3. **Randomized honesty.** A hot op is EXPECTED O(log n), not worst-case. How is
   that disclosed so the witness does not sell an expectation as a guarantee?
4. **The memory risk.** Level columns at `capacity * MAXLEVEL` dominate memory. Grow
   them lazily, or size them up front?

## Decision

**1. D-01 binds to an IN-FILE PRIVATE `NodePool`, as DESIGN-PARITY -- NOT a runtime
dep on lite-o1.** SkipList ships a private `NodePool` class in `LogN.js`: a
pointer-free free-list (a LIFO free-stack over a `Uint32Array`) that hands out a
slot INDEX in `[1, capacity]`, `NIL = 0`, slot 0 reserved as the head sentinel,
allocating an index -- never a heap object. "Reconcile, not fork" (D-01, ROADMAP
section 6) is honored as DESIGN-PARITY: the identical free-list CONTRACT (allocate
an index, `NIL = 0`, slot 0 reserved) and the identical conservation INVARIANT
`activeSlots + freeListLength === capacity` as lite-o1's private pools (FreqO1 /
BucketQueue / TimerWheel each carry one) and its deferred public `SlotPool` -- the
same primitive, proven the same way, NOT shared code.

A RUNTIME DEPENDENCY on lite-o1 was REJECTED for two reasons: (a) the suite's
zero-runtime-deps law is absolute -- a micro-library may not pull another package
into a consumer's tree; and (b) lite-o1's public `SlotPool` was DEFERRED (lite-o1
ADR-0003) and never shipped, so there is nothing public to depend on. Design-parity
gives the suite ONE correctness story for the primitive without four subtly
different code copies drifting apart, while keeping each package independently
installable. The `NodePool` is shaped so a later pointer member (Treap) can reuse it
(a plain capacity-parameterised class, no SkipList coupling) without over-
engineering it now (no generality the first two consumers do not need).

**2. PRNG: the repo's Numerical-Recipes LCG, instance-local, HIGH bits for the
level.** `s' = (s*1664525 + 1013904223) >>> 0` -- the repo's single generator, no
`Math.random`, no module state, no new PRNG. The seed is instance-local (a
constructor argument, default fixed), so a fixed seed replays an IDENTICAL structure
and a different seed diverges -- deterministic and reproducible. A level is drawn in
ONE LCG step with NO array: `level = 1 + Math.clz32(word)`, clamped to the allocated
column count. Counting the LEADING zeros (the HIGH bits) is deliberate: the LOW bits
of any power-of-two-modulus LCG are periodic -- here `a` and `c` are both odd, so the
lowest bit strictly ALTERNATES, which would make "count trailing halvings" from the
low end non-random and fail a chi-square test. The high bits are the well-mixed
ones; `1 + clz32` yields the geometric `P(level = k) = 2^-k` a fair-coin tower needs.
This is validated by a deterministic chi-square test (df = 15, p > 0.001, over ~1e6
levels driven through the REAL `set` path).

**3. Randomized honesty: the witness prints the MAX single-op.** A hot op is
EXPECTED O(log n). An unlucky seed can build a tall thin tower and spike a single
op. The witness fits the clean average line (a hot fixed-path full-height descent
that isolates the level count, the skip-list analog of Fenwick's fixed full-height
walk) AND separately measures + PRINTS the MAX single insert over a REALISTIC
randomized build trace -- the unlucky-tower tail a mean hides. The MAX is a
DISCLOSURE, not a gate: an expected-time member must report its true tail so the
straight line is never mistaken for a worst-case guarantee. The gated slope band is
the member's own (median-of-15 fit-runs x [0.6, 1.4], the D-08 procedure); the
shared R^2 floor (0.958) is inherited unchanged -- never widened.

**4. Memory: size the level columns UP FRONT to the capacity's real need, do NOT
grow lazily.** The `_next` links are a SINGLE flat `Uint32Array(columns * (capacity
+ 1))`. A full `capacity * 32` column set would dominate memory, so `columns` is
sized to `ceil(log2 capacity) + 1` (clamped to MAXLEVEL = 32) at construction, and
level generation CLAMPS to it. Lazy growth (reallocating `_next` when the observed
max level rises) was REJECTED: it is a cold, rare event, but a reallocation landing
inside a measured window would spike the per-op allocation and break the inviolable
0-B/op torture gate. Sizing up front to the real need makes `_next` NEVER reallocate
-- trivially 0 B/op on every hot lane -- for a memory cost of `~log2(cap)` columns,
not 32. The clamp only ever bites the extreme geometric tail (probability
`~2^-log2(cap)`), which cannot change ordering or membership: a node merely stops
gaining express lanes above the ceiling. `SL_MAX_CAPACITY = 0x03FFFFFF` (2^26 - 1):
slot indices must fit an unsigned 32-bit word, `NIL = 0` reserves slot 0, and
`columns * (capacity + 1)` must stay an addressable typed-array length -- the index
arithmetic, not the byte count, is the hard ceiling.

## Consequences

- `LogN.js` gains `_lcgNext`, `SL_MAXLEVEL`, `_levelCap`, `SL_DEFAULT_SEED`, the
  private `NodePool` class, `SL_MAX_CAPACITY`, and the `SkipList` class, appended
  after SegmentTree; BinaryHeap / Fenwick / SegmentTree stay BYTE-IDENTICAL.
- The witness inherits the D-08 rule: shared R^2 floor 0.958, OWN per-op slope bands
  (`get` and `set`, median-of-15 x [0.6, 1.4]); the gated sweep is EXACT powers of
  two in `[2^10, 2^16]`. The sorted-array-insert foil (O(n) shift) leaves the line
  on the insert axis; a linear-scan foil (O(n) search) leaves it on the get axis.
- The NodePool is available for a later Treap without a fork or a runtime dep.
- `successor` / `predecessor` are STRICT (strictly greater / strictly less);
  `rangeIter` is a version-stamped iterator (mutation mid-iteration throws
  `[lite-logn]`); `set` on an existing key updates the value in place.

## Alternatives rejected

- **Depend on lite-o1's SlotPool at runtime.** Rejected: violates the zero-runtime-
  deps law, and that SlotPool was never shipped. Design-parity gives the shared
  correctness story without the dependency.
- **Fork a fourth private pool with a different contract.** Rejected: that is the
  exact substrate drift D-01 refuses. The contract + invariant match lite-o1's.
- **Count trailing halvings from the LCG's low bits.** Rejected: the low bits of a
  power-of-two LCG are periodic (the lowest bit alternates), which is non-random and
  fails the chi-square gate. The high bits (`clz32`) are the well-mixed ones.
- **Grow the level columns lazily by observed max level.** Rejected: a reallocation
  inside a measured window would break the 0-B/op gate. Sizing to the capacity's
  real need up front is never-reallocating for a `~log2(cap)`-column memory cost.
- **`Math.random` or a new PRNG.** Rejected: non-deterministic (no reproducible
  structure) and against the one-generator rule; the repo LCG is the standard.
