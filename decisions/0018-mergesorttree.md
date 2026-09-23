# 0018 -- MergeSortTree: a static, immutable offline range-rank tree (D-MST1..D-MST6)

- Status: ACCEPTED
- Severity: S1 (the family's FIRST truly immutable member and its FIRST offline range-RANK structure;
  picks a static build-once contract over a mutable timeline, a single flat level-packed Float64Array
  over a node pool, plain O(log^2 n) over fractional cascading, the countLE / rangeCount range-rank
  primitives over an order-statistic kth, an O(n log n) BUILD + O(n log n) SPACE disclosed co-headline,
  and the query witness lane on the SQUARED-log (log2 n)^2 axis)
- Date: 2026-09-22
- Session: MergeSortTree (v0.16.0)

## Context

MergeSortTree is the sixteenth member. It is a STATIC, IMMUTABLE offline range-rank structure: over any
INDEX range `[lo, hi]` of a fixed sequence it answers "how many stored values are <= x" (`countLE`) or
"how many fall in the value-window `[vlo, vhi]`" (`rangeCount`) in worst-case O(log^2 n),
zero-allocation. It is the family's SECOND static member after SortedArray, but the FIRST that is truly
immutable: SortedArray is read-optimized-but-mutable (set / delete with an O(n) copyWithin), whereas
MergeSortTree copies its source in at construction and exposes NO mutators. This is the SparseTable /
lite-o1 static-member honesty contract landed in lite-logn (see the lite-o1 static-members-admitted
call): the query is worst-case O(1)-per-node zero-alloc, but the O(n log n) BUILD and O(n log n) SPACE
are a DISCLOSED co-headline, never hidden. There is no max-single-op line (a build-once immutable tree
has no randomization and no amortization).

## Decision

**D-MST1 static build-once + IMMUTABLE, NOT a mutable timeline.** `new MergeSortTree(values)` (or the
`MergeSortTree.build(values)` factory) COPIES a snapshot of `values` into an internal Float64Array;
mutating the caller's array afterward never changes a result. There are NO mutators (no set / update /
insert / delete / clear) -- the tree is frozen at construction, so every query is a read-only descent.
This is the DELIBERATE distinction from SortedArray (D-SA, decisions/0016), which stays mutable to keep
its ordered-map role; MergeSortTree trades mutability for the offline range-rank power SortedArray
cannot give. Because it is immutable it is a benchmark SUBJECT but NOT a clear-witness (there is no
fill / clear / refill invariant to witness -- named with a reason in Matrix.CLEAR_WITNESS_EXCLUDED,
never silently dropped).

**D-MST2 (THE LOAD-BEARING IDIOM) layout = a segment tree of SORTED RUNS packed by LEVEL into ONE flat
Float64Array, NOT a node pool.** The tree is laid over a power-of-two slot count `m = 2^H`
(`H = ceil(log2 n)`, computed by an exact integer loop, never `Math.log2` which can mis-round a power of
two). At depth `d` the tree partitions `[0, m)` into `2^d` slots; the real elements (indices `[0, n)`)
whose index falls in a slot form that node's SORTED run. Every level holds all n real elements once
(concatenated in index order), so the table is exactly `(H + 1)` levels x `n` cells = `n *
(ceil(log2 n) + 1)`, stored in one preallocated `_t` Float64Array. A node covering real index range
`[rl, rr)` at level d has its run at flat offset `d * n + rl` (length `rr - rl`) -- the
"level * n + nodeStart" address. The leaf level (d = H) is the source in index order (trivially-sorted
1-element runs); each higher level is built BOTTOM-UP by MERGING each node's two adjacent child runs,
which live in the NEXT level's region (a disjoint region, so the merge writes in place with NO scratch
buffer), giving the O(n log n) build. This flat, pointer-free layout is why every query is 0 B/op and
why the space is a clean `n * (H + 1)` cells -- there is no NodePool (D-01), no per-node object, no
child pointers.

**D-MST3 primitives = countLE + rangeCount (range RANK); kth-in-range DEFERRED to a future
WaveletTree.** `countLE(lo, hi, x)` descends from the root and, at each of the O(log n) CANONICAL nodes
fully inside `[lo, hi]`, runs a branch-free binary search of that node's sorted run for the count of
values <= x -- O(log n) nodes x O(log n) per search = worst-case O(log^2 n). `rangeCount(lo, hi, vlo,
vhi)` is `countLE(vhi) - countLT(vlo)` over the same canonical decomposition (a private STRICT-less
descent), so the inclusive value-window is exact even for float bounds. The lower-bound midpoint idiom
(`s + ((e - s) >>> 1)`, SortedArray's) keeps both searches overflow-safe and branch-light. The
kth-smallest-in-range ORDER STATISTIC is DELIBERATELY NOT shipped: it is a different algorithm (a
fractional-cascading or wavelet descent) that this plain O(log^2 n) layout cannot answer in one pass. It
is routed to a future WaveletTree, so this member ships the range-RANK primitives only (see What this is
not).

**D-MST4 PLAIN O(log^2 n), NO fractional cascading.** Fractional cascading would drop the per-node
binary search to an O(1) follow-pointer and buy O(log n) queries, but it requires bridge/fraction
pointer arrays interleaved into every node's run -- which WRECKS the flat, pointer-free
`n * (H + 1)`-cell Float64Array layout (D-MST2) that makes the member zero-GC and space-clean, and it is
markedly harder to teach. The honest, teachable form is the plain merge sort tree: O(log^2 n) queries
over one contiguous table. The squared log is the honesty hook (the per-node search is not free), so the
query is classed OLOGN2_WORST in the benchmark, never understated as a single log -- the Fenwick2D /
SegmentTree2D precedent.

**D-MST5 fail closed on every unverified state.** The source must be an array-like of FINITE numbers
(typeof-guarded FIRST -- Symbol / BigInt / NaN / +-Infinity each throw `[lite-logn]`; null is not zero),
the length must be an integer in `[1, MST_MAX_LENGTH]` (`0x7FFFFFFF`), and the `(H + 1) * n` cell count
is a PRODUCT guarded by a FLOAT multiply against `MST_MAX_CELLS` (`0x7FFFFFFF`) -- never `| 0`, which
would wrap a large product to a small / negative int and pass the door (fail OPEN -> under-allocation ->
OOB). The float arithmetic is exact to 2^53, so a genuine overflow of the cell budget fails CLOSED --
the PST_MAX_NODES / S2D_MAX_CELLS / F2D_MAX_CELLS lesson (decisions/0014, 0015, 0017). Query bounds are
integers with `0 <= lo <= hi < length`; `x` must be a number (NaN throws, +-Infinity is a legal
threshold); the value-window needs `vlo <= vhi` -- each an invalid state that throws (via cold-path
string-concat throw builders off the hot body), never a silent wrong answer.

**D-MST6 witness = `countLE` on the SQUARED-log (log2 n)^2 axis, WORST-CASE, NO max-single-op line.**
countLE's O(log^2 n) cost is a straight line on the `(log2 n)^2` x-axis (the `xOf` witness-registry hook
Fenwick2D introduced), NOT on a single log. The gated sweep is EXACT powers of two 2^13..2^18 over the
widest window `[1, n-2]` with 1024 cycled random thresholds. Shared R^2 floor 0.958 (D-08 /
decisions/0004), FROZEN. MergeSortTree's OWN slope band = median-of-fit-runs * [0.6, 1.4], centered on
the MEDIAN (5.218 ns/level^2 on this machine -> band [3.13, 7.31]); the lane opts into the
median-of-fits hook (like Fenwick2D / PST) for post-torture thermal robustness. The O(n) linear-scan
foil (a naive count of values <= x over the index range) is EXPONENTIAL on the `(log2 n)^2` axis and
MUST miss the floor. There is DELIBERATELY NO max-single-op disclosure line: a static immutable member
has no randomized tail and no amortized spike (the Fenwick2D / SegmentTree2D / SortedArray-read
precedent).

## Consequences

- The family gains its FIRST truly immutable member and its FIRST offline range-rank structure -- a
  clean teaching contrast with the mutable ordered maps (build-once + query-forever vs churn).
- Queries are 0 B/op: countLE / rangeCount are read-only descents over the flat table (recursion runs on
  the native call stack, depth O(log n), like Treap / Scapegoat / PST). Proven by
  `node --expose-gc test/torture.mjs` (a per-cycle build/discard tracker lane + a hot countLE churn lane
  on an immutable tree held OUTSIDE the loop + an arrayBuffer soak).
- The O(n log n) BUILD and O(n log n) SPACE (`n * (ceil(log2 n) + 1)` cells) are a DISCLOSED co-headline
  in llms / README / GUIDE, surfaced as D3's overheadRatio (bytesPerLive / 8 ~ ceil(log2 n) + 1), never
  hidden behind the fast query.
- Space is a fixed single table sized at construction (fail-closed float-product guard); there is no
  grow path, so the backing store is never reallocated.

## Alternatives rejected

- **A mutable / incremental variant.** Rejected (D-MST1): the offline power (a sorted run per canonical
  node) depends on knowing all values up front; supporting inserts would force per-node run maintenance
  and break both the flat layout and the O(log^2 n) bound. SortedArray already covers the mutable
  ordered-map role.
- **Fractional cascading (O(log n) queries).** Rejected (D-MST4): it buys one log but requires
  interleaved bridge pointers that wreck the flat, pointer-free zero-GC layout and the clean space
  bound, and it is far harder to teach. The plain O(log^2 n) form is the honest, teachable one.
- **Shipping kth-smallest-in-range now.** Rejected (D-MST3): the order statistic is a different
  algorithm this layout cannot answer in one pass; routed to a future WaveletTree rather than bolted on.
- **A per-node object / NodePool layout.** Rejected (D-MST2): per-node objects or pooled slots defeat
  the 0-B/op query and inflate space; the single level-packed Float64Array is contiguous, pointer-free
  and cache-friendly.
- **A `| 0` cell-budget guard.** Rejected (D-MST5): it fails OPEN on overflow. The FLOAT product fails
  CLOSED.
