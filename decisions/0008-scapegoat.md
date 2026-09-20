# 0008 -- Scapegoat: deterministic weight-balanced BST, zero-GC rebuild, the split/merge asymmetry vs Treap (D-S1..D-S6)

- Status: ACCEPTED
- Severity: S1 (picks the family's DETERMINISTIC balanced-BST member + its honesty
  contract; binds the shared NodePool a third time; settles the zero-GC rebuild
  mechanism and the surface asymmetry vs Treap)
- Date: 2026-09-20
- Session: Scapegoat (v0.6.0)

## Context

Scapegoat is the sixth member -- the family's DETERMINISTIC balanced BST, the honest
PAIR to Treap. Treap (0007) is randomized-EXPECTED O(log n); Scapegoat gives a hard
WORST-CASE O(log n) `get` at the price of AMORTIZED O(log n) `set` / `delete`. Six calls
had to be settled before code (D-S1..D-S6 in the planner brief).

## Decision

**D-S1 SURFACE (ordered-map + order-statistic core; NO split/merge).** get(key) /
has(key) / set(key,value) / delete(key) / rank(x) / select(k) / successor(key) /
predecessor(key) / rangeIter(lo,hi) / forEach(fn) / clear() + size / capacity / alpha
getters. rank / select ride a PERSISTED `_size` subtree-count column (the same
augmentation Treap ships). There is deliberately NO `split` / `merge` -- see the
asymmetry note below. Keys and values are finite numbers only (Symbol / BigInt / NaN /
+-Infinity fail closed, typeof-guarded FIRST at every mutating door). Absent get ->
undefined (no throw); select out-of-range -> undefined; a non-integer select index, a
NaN / lo>hi rangeIter bound, and a non-finite key/value all throw `[lite-logn]`;
rangeIter is VERSION-STAMPED (structural OR value mutation mid-iteration throws).

**D-S2 ALPHA (frozen, open interval, ctor-cached).** `new Scapegoat(capacity,
alpha = 2/3)`. alpha is validated to the OPEN interval (0.55, 0.75) -- BOTH 0.55 and
0.75 THROW (typeof-guard first, then range) -- and frozen after construction. The
alpha-derived depth constant is precomputed ONCE as `_invAlpha = 1/alpha`, so the hot
insert path uses NO per-op `Math.log`: the depth bound `h_alpha(n) = floor(_invLog *
log2(n))` (with `_invLog = 1/log2(1/alpha)`) is tested EXACTLY as `_invAlpha^d > n` --
for integer depth d the strict `>` matches the floor -- accumulated with one float
multiply per path level, on the `set` path only.

**D-S3 ZERO-GC REBUILD (load-bearing).** NO fresh array per rebuild. TWO scratch buffers
are allocated ONCE at construction and reused every rebuild: `_flat`
(`Uint32Array(capacity)`, the sorted slot indices) and `_stack`
(`Uint32Array(capacity+1)`, the explicit flatten index-stack). `_flatten` walks the
target subtree in-order ITERATIVELY (Morris-free) via `_stack`, writing sorted slots to
`_flat`; `_buildBalanced` reads that sorted range and re-links `_left` / `_right` /
`_size` via BOUNDED native recursion (depth O(log subtree) <= ~31, because it produces a
perfectly balanced subtree) on the native call stack, never the GC heap. Both are
0 B/op -- proven by a rebuild-HEAVY torture lane (a degenerate ascending-insert trace
that forces repeated subtree rebuilds) and by a dedicated PerfGate scavenge-clean
scenario. The planner's flagged risk (the index-stack costing bytes on the timed path)
did NOT materialise: the preallocated `_stack` column stays 0 B/op, so no fallback to a
disclosed native-stack flatten was needed. (The `delete` and `forEach` recursions run to
a depth = tree height, which is O(log n) WORST-case here -- strictly safer than Treap's
expected bound -- on the native stack, so still 0 B/op; disclosed here + in the class
JSDoc + llms.txt.)

**D-S4 DUAL TRIGGER.** insert: descend recording the path in `_stack`, link the new leaf
at depth d, increment `_size` along the path, bump `_maxCount = max(_maxCount, size)`;
then if the node is too deep (`_invAlpha^d > size`) walk the recorded path back UP to the
SCAPEGOAT (the lowest ancestor whose path-child subtree exceeds `alpha` of its own size)
and rebuild THAT subtree. delete: standard BST delete (in-order-successor copy for the
two-child case; `_size` fixed on the unwind; exactly one slot freed), then when
`size < alpha * _maxCount` rebuild the WHOLE tree and reset `_maxCount = size`. `_size`
stays consistent after every insert / delete / rebuild.

**D-S5 WITNESS.** `get` is the gated O(log n) witness op (a DETERMINISTIC weight-balanced
BST descent -- WORST-case, never merely expected). Its band was calibrated by the shared
ADR-0004 method (median-of-15 fit-runs * [0.6, 1.4], MEDIAN-centered): 15 runs on this
machine spanned slope 3.82..4.10 ns/level, R^2 0.965..0.977; MEDIAN slope 4.02 ->
`SCAPEGOAT_GET_SLOPE_LO = 2.41` (4.02*0.6), `SCAPEGOAT_GET_SLOPE_HI = 5.63` (4.02*1.4),
wired into MEMBERS with `r2Floor: BINARYHEAP_R2_FLOOR` (the FROZEN family floor 0.958,
inherited never widened). A scapegoat is MORE balanced than a random treap, so its
per-level slope (~4.02) is a touch LOWER than Treap.get's (~4.25) -- expected, which is
exactly why only the R^2 floor is shared. The rebuild spike lives on the AMORTIZED `set`
path and is NEVER gated as a per-op line; instead the AMORTIZED-TRACE assertion proves
the amortization: the cumulative ascending-insert (rebuild-heavy) cost/op over 2^11..2^17
stays LOG-like (last/first ratio ~1.4..1.7x, gated < 4x), where a rebuild-LESS BST would
degenerate to an O(n)-amortized chain and blow the ratio to ~64x -- a fixed, meaningful
teeth threshold, not a widenable budget. The 5 prior members' bands are UNTOUCHED.

**D-S6 SUBSTRATE (third bind of D-01).** Reuse the in-file private NodePool (LIFO
free-stack over a Uint32Array, `NIL = 0`, slot 0 reserved, conservation
`activeSlots + freeListLength === capacity`). Columns: `_key` / `_value` Float64;
`_left` / `_right` / `_size` Uint32; plus the `_flat` rebuild scratch + the `_stack`
flatten index-stack. `SG_MAX_CAPACITY = 0x7FFFFFFF` (2^31-1) -- slot indices + subtree
counts fit an unsigned 32-bit word. NO `_prio`, NO RNG anywhere (no Math.random, no LCG):
the shape is a deterministic function of the insert / delete order.

## The asymmetry vs Treap (why NO split / merge)

Treap's `split` / `merge` are its arena-sharing set surgery: they REWIRE a randomized
priority heap in place, which is what keeps them O(log n) EXPECTED. A scapegoat has NO
priority heap to merge by, and an honest DETERMINISTIC split/merge over a weight-balanced
tree would require O(n) rebuilds (forfeiting the sub-linear headline). So Scapegoat's
surface is deliberately the ordered-map + order-statistic CORE, and split/merge are
absent -- documented on the public surface (class JSDoc + llms.txt + README + the .d.ts,
which has no split/merge declarations) as the explicit asymmetry vs Treap. A member that
needs set surgery is Treap (0007); a member that needs a hard worst-case single-op bound
without amortization is neither (that is the sibling lite-o1's O(1) contract).

## Consequences

- `LogN.js` gains `SG_MAX_CAPACITY` (`0x7FFFFFFF`) + the `Scapegoat` class, appended after
  Treap; BinaryHeap / Fenwick / SegmentTree / SkipList / Treap stay BYTE-IDENTICAL (only
  the `VERSION` const changes above the append point).
- The witness gains ONE gated op-row, `Scapegoat.get` (a deterministic BST descent),
  against a linear-scan O(n) foil, PLUS the amortized-trace assertion. It inherits the
  FROZEN shared R^2 floor 0.958 (D-08); the five prior members' bands are UNTOUCHED.
- The benchmark (repo-only) admits Scapegoat as the 6th SUBJECT: SUBJECTS 5 -> 6, OP_ROWS
  8 -> 9 (+ `Scapegoat.get`), the matrix 5x8=40 -> 6x8=48 cells, OP_CLASS gains
  `Scapegoat.get` (WORST-case) + `Scapegoat.set` / `.delete` (a NEW third honesty class,
  `OLOGN_AMORTIZED`), CLEAR_WITNESS 5 -> 6, and the ordered D8 workload admits Scapegoat.

## Alternatives rejected

- **A red-black / AVL tree (deterministic, worst-case on ALL ops).** Rejected: a colour
  byte or balance-factor byte + rotation-heavy per-op rewiring is pointer-heavier and a
  DIFFERENT honesty story; a scapegoat is the zero-GC-cleanest deterministic BST (no
  per-node balance metadata at all -- the rebuild absorbs imbalance in bulk) and it PAIRS
  with Treap (worst-case get vs expected get) as a teachable contrast.
- **A per-rebuild fresh array (the textbook flatten-to-Array-then-rebuild).** Rejected:
  that allocates O(subtree) per rebuild -- against the zero-GC law. The ONE preallocated
  `_flat` + `_stack` scratch keeps every rebuild 0 B/op.
- **Shipping split / merge anyway (by copying, or by O(n) rebuilds).** Rejected: copying
  is O(n) and O(n) rebuilds forfeit the O(log n) headline; the honest move is to NOT offer
  what cannot be sub-linear here, and to name the asymmetry rather than hide it. Treap
  carries the set surgery for the family.
- **A separate allocator for Scapegoat.** Rejected: that is the substrate drift D-01
  refuses; the SkipList / Treap NodePool contract + invariant fit exactly (third bind).
- **Gating the rebuild spike as a per-op witness line.** Rejected: the spike is AMORTIZED,
  not per-op; gating it as a single-op line would misrepresent the contract. The amortized-
  trace assertion (cumulative cost/op tracks log n) is the honest gate; the spike itself is
  disclosed, never gated (the same discipline as Treap / SkipList's MAX-single-insert).
