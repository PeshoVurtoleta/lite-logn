# 0017 -- PersistentSegTree: a fully persistent (branching) segment tree via path-copying (D-PST1..D-PST6)

- Status: ACCEPTED
- Severity: S1 (the family's FIRST persistent / branching member and its FIRST bump/append allocator;
  picks path-copying over a mutable timeline, the monotonic bump allocator over the free-list
  NodePool, the version-count capacity model with a FLOAT-product node-arena guard, the SegmentTree
  fold-menu parity, the absolute point-set value semantics, and the query witness lane on the DEFAULT
  log2(n) axis)
- Date: 2026-09-22
- Session: PersistentSegTree (v0.15.0)

## Context

PersistentSegTree is the fifteenth member. It is the FULLY PERSISTENT (BRANCHING) segment tree: every
version is preserved and queryable forever, and any version can be branched off. It is the time-travel
complement to the flat SegmentTree (member 3): that one is a single mutable timeline over a
`Float64Array(2n)`; this one is a persistent DAG of immutable nodes. `update(fromVersion, i, value)`
does NOT mutate `fromVersion`; it returns a new dense version whose root shares every off-path subtree
with its parent and owns a freshly-copied O(log n) root-to-leaf path. Its gated hot op `query` is a
worst-case O(log n) read-only descent, so it fits the DEFAULT log2(n) witness axis (a single log, not
the squared-log Fenwick2D / SegmentTree2D introduced).

## Decision

**D-PST1 persistence = PATH-COPYING (fully persistent / branching), NOT a mutable timeline or a
copy-on-write snapshot array.** `update` copies exactly the root-to-leaf path (H + 1 nodes, H =
ceil(log2 n)) and shares every off-path subtree with the parent version, so a new version costs
O(log n) time AND O(log n) new nodes. Versions are DENSE integers in creation order: version 0 is the
initial tree; each successful `update` returns the next integer. Because the parent is untouched, ANY
existing version can be branched off (not just the latest) -- the "branching" / fully-persistent
contract, not the weaker partially-persistent (append-only latest) one. `query(version, lo, hi)` folds
`[lo, hi]` INCLUSIVE against the requested version's root; `at(version, i)` is the O(log n) point read.

**D-PST2 (THE LOAD-BEARING IDIOM) allocator = a monotonic BUMP/APPEND allocator, NOT the free-list
NodePool the other pointer members use.** Persistent nodes are IMMUTABLE, SHARED across versions, and
NEVER individually freed -- freeing a node would corrupt every version that still points at it. So the
allocator is a single monotonic `_next` cursor into the preallocated columns `_val` (Float64Array),
`_left` / `_right` (Uint32Array), with `NIL = 0` reserving slot 0 (null is not zero: slot 0 is never
allocatable and is never read as a real node). This is the DELIBERATE DISTINCTION from SkipList /
Treap / Scapegoat / SplayTree, which bind the free-list `NodePool` (D-01, decisions/0006): those
members recycle slots on delete because their nodes are mutable and owned by ONE timeline; a persistent
tree cannot recycle, so it does not carry a free-list, an `activeSlots` counter, or a `free()` path at
all. The ONLY reset is `clear()` (rewind `_next` to 1, re-seed v0). `_roots` is a `Uint32Array(version
Capacity + 1)` mapping each version to its root slot. Sharing this cheaply refutes a "just reuse the
NodePool" review note: the NodePool's LIFO free-stack + conservation invariant are meaningless here (no
free ever happens), and its `alloc()`-returns-0-on-exhaustion contract is replaced by a loud
fail-closed throw.

**D-PST3 capacity = BY VERSION COUNT; node arena sized INTERNALLY with a FLOAT-product guard.**
`new PersistentSegTree(length, versionCapacity, kind)` takes the max number of updates (extra versions
beyond v0). The node budget is computed internally: `nodeBudget = 1 (NIL) + (2n - 1) v0 nodes +
versionCapacity * (H + 1)`, H = ceil(log2 n). An update copies at most H + 1 nodes; for a power-of-two
n every leaf sits at depth H, so each update copies EXACTLY H + 1 and the arena fills EXACTLY at the
budget after `versionCapacity` updates (test-enforced). The budget is a PRODUCT, so it is guarded with
a FLOAT multiply against `PST_MAX_NODES = 0x7FFFFFFF` -- never `| 0`, which would wrap a large product
to a small / negative int and pass the door (fail OPEN -> under-allocation -> OOB). The float
arithmetic is exact to 2^53, so a genuine overflow fails CLOSED -- mirroring S2D_MAX_CELLS /
F2D_MAX_CELLS (decisions/0014, 0015). `PST_MAX_LENGTH = 0x3FFFFFFF` (= SEGTREE_MAX) is the clean
per-argument door for `length` (so `2n` stays a positive int32).

**D-PST4 fail-closed capacity, BOTH arenas.** The VERSION arena fails closed: the
`versionCapacity + 1`-th update throws `[lite-logn]` (the version guard fires first, before any node
overflow). The NODE arena's overflow throw is DEAD-CODE by construction (the budget is the exact worst
case and the version guard pre-empts it) but is KEPT as a loud fail-closed defense and white-box tested
by a controlled cursor-pinning probe -- the SparseTable r<l / SortedArray `_full` precedent (a
redundant-but-safe guard, proven reachable, never silently dropping). An unknown / out-of-range version
throws; every door is typeof-guarded FIRST (Symbol / BigInt / NaN / +-Infinity fail closed), and a
failing door is a genuine NO-OP (no slot consumed, no version created).

**D-PST5 fold menu = EXACT SegmentTree parity (min / max / sum / gcd), ctor-cached `_k` + inline
switch.** The fold is chosen ONCE at construction and cached as a small-int `_k` combined by an INLINE
switch on every hot body (query / build / path-copy) -- no function ref, no closure, no megamorphic
call site. Identity: sum -> 0, min -> +Infinity, max -> -Infinity, gcd -> 0; an unwritten cell reads
the fold identity (v0 seeds every leaf to it). The value door is typeof-first and the gcd kind
additionally rejects negative / non-integer values -- byte-for-byte the SegmentTree contract, reusing
the shared `segGcd` module helper. Value semantics are ABSOLUTE point-set (like SegmentTree.update),
not a delta.

**D-PST6 witness = `query` on a RANDOM existing version, WORST-CASE O(log n), DEFAULT log2(n) axis.**
The query time is independent of which version is read (all versions share the same height), so a
random-version query isolates the O(log n) descent. Shared R^2 floor 0.958 (D-08 / decisions/0004),
FROZEN. PersistentSegTree's OWN slope band = median-of-15 fit runs * [0.6, 1.4], centered on the
MEDIAN. The O(n) linear-scan foil sits OFF the line. `PersistentSegTree.build(values, versionCapacity,
kind)` seeds v0 in O(n) (a snapshot, not n updates), failing closed on non-array-like / non-finite /
out-of-domain-gcd entries before the tree is usable.

## Consequences

- The family gains its FIRST persistent structure and its FIRST bump allocator -- a clean teaching
  contrast with the free-list members (immutable+shared => bump; mutable+owned => free-list).
- Hot ops are 0 B/op: query / at are read-only descents; update bump-allocates ONLY preallocated
  slots. Proven by `node --expose-gc test/torture.mjs` (a per-cycle tracker lane + a hot update/query
  churn lane + an arrayBuffer soak; the update lane refreshes a fixed-capacity tree via `clear()` each
  round so the bump cursor never overflows and the backing store is never reallocated).
- The version-count capacity model puts the memory ceiling in the caller's hands at construction and
  makes the exact node budget a test invariant.
- Recursion (build / query / path-copy) runs on the native call stack (0 B/op), like Treap /
  Scapegoat; depth is O(log n), far under any stack limit for n <= 2^30.

## Alternatives rejected

- **Reuse the free-list NodePool.** Rejected (D-PST2): persistent nodes are never freed, so the
  free-stack, conservation invariant, and `free()` path are all dead weight and actively wrong (a
  recycled slot would corrupt older versions).
- **Partially persistent (append-only latest) only.** Rejected: branching off any version is the
  higher-value contract and costs nothing extra under path-copying.
- **A `| 0` node-budget guard.** Rejected (D-PST3): it fails OPEN on overflow. The FLOAT product fails
  CLOSED.
- **Grow the arena on demand.** Rejected: a lazy grow reallocates the backing typed arrays and breaks
  the 0-B/op gate; fixed capacity fails closed instead.
