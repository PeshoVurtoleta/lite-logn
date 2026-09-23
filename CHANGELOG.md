# Changelog

All notable changes to `@zakkster/lite-logn` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-23

### Changed

- **Promoted to 1.0.0 -- API stable, sixteen members frozen.** No shipped-code change since 0.16.0
  other than the `VERSION` bump: `LogN.js` is byte-identical apart from the `VERSION` constant, and
  all sixteen classes (BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap,
  SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D, SortedArray,
  PersistentSegTree, MergeSortTree) are unchanged.
- **Docs capstone.** README benchmark section resynced to sixteen subjects / twenty-one gated
  op-rows / 128 cells (D1 table completed with `PersistentSegTree.query` + `MergeSortTree.countLE`;
  D3 / D5 / D7 / D8 extended to all sixteen members; SegmentTree2D D1 slopes resynced to
  `benchmark/results.json` at 6.4 / 5.8). GUIDE "measured cost" ladder completed to the full gated
  op set.

### Added

- **Interactive demo (repo-only, not shipped).** An interactive demo covering all sixteen members
  (`demo/`, the 4-file `kernels.mjs` + `index.html` + `Demo.test.mjs` + `serve.mjs`). Repo-only:
  never in the npm tarball / `package.json` `files[]`.

### Fixed

- None (shipped code).

### Removed

- None.

## [0.16.0] - 2026-09-22

### Added

- **MergeSortTree** -- the sixteenth member and the family's FIRST truly IMMUTABLE member and its FIRST
  offline range-RANK structure: a STATIC merge sort tree that answers, over any INDEX range `[lo, hi]` of
  a fixed sequence, `countLE(lo, hi, x)` (how many stored values are <= x) and `rangeCount(lo, hi, vlo,
  vhi)` (how many fall in the value-window `[vlo, vhi]`) in WORST-CASE O(log^2 n), zero-allocation. It is
  the SECOND static member after SortedArray, but the first that is truly immutable: SortedArray is
  read-optimized-but-mutable, whereas MergeSortTree COPIES its source in at construction and has NO
  mutators (the SparseTable / lite-o1 static-member honesty contract). Surface: `countLE` / `rangeCount`,
  `length` / `size` / `cells` getters, and the static `MergeSortTree.build(values)`. See
  `decisions/0018-mergesorttree.md`.
- **Segment tree of SORTED runs in ONE flat Float64Array (D-MST2, the load-bearing idiom).** Every node
  stores the SORTED array of its index-range, packed by LEVEL into ONE preallocated `Float64Array` of
  exactly `n * (ceil(log2 n) + 1)` cells (a node at level d covering real index range `[rl, rr)` has its
  run at flat offset `d * n + rl`). The leaf level is the source in index order; each higher level is
  built BOTTOM-UP by MERGING each node's two adjacent child runs into a disjoint region (no scratch
  buffer), giving the O(n log n) build. countLE descends the O(log n) CANONICAL nodes fully inside
  `[lo, hi]` and branch-free binary-searches each node's sorted run (O(log n) nodes x O(log n) per search
  = O(log^2 n)); rangeCount is `countLE(vhi) - countLT(vlo)` over the same decomposition (a private
  STRICT-less descent), exact even for float bounds.
- **PLAIN O(log^2 n), NO fractional cascading (D-MST4).** Fractional cascading would buy O(log n) queries
  but requires interleaved bridge pointers that wreck the flat, pointer-free zero-GC layout and the clean
  space bound, and is far harder to teach -- rejected for the honest, teachable plain form. The
  kth-smallest-in-range ORDER STATISTIC is DELIBERATELY NOT shipped (a different algorithm; routed to a
  future WaveletTree) -- this member ships the range-RANK primitives only.
- **STATIC / IMMUTABLE + a FLOAT-product cell guard, fail closed (D-MST1, D-MST5).** The source is COPIED
  in at construction (mutating the caller's array afterward changes nothing) and there are NO mutators.
  The source must be an array-like of FINITE numbers (typeof-guarded FIRST; Symbol / BigInt / NaN /
  +-Infinity fail closed), the length an integer in `[1, MST_MAX_LENGTH]` (`0x7FFFFFFF`, 2^31-1), and the
  `(H+1)*n` cell product is guarded by a FLOAT multiply against `MST_MAX_CELLS` (`0x7FFFFFFF`) -- never
  `| 0`, which would wrap a large product and fail OPEN (the PST_MAX_NODES / S2D_MAX_CELLS precedent).
  Query bounds are integers with `0 <= lo <= hi < length`; the value-window needs `vlo <= vhi`.
- **O(n log n) BUILD and O(n log n) SPACE a DISCLOSED co-headline.** The tree is `n * (ceil(log2 n) + 1)`
  cells; the fast query is never allowed to hide the build + space cost.

### Changed

- Witness harness gates twenty-one ops (was twenty): MergeSortTree `countLE` on the SQUARED-log axis
  (`nsPerOp = intercept + slope*(log2 n)^2`, the family's THIRD such lane after Fenwick2D / SegmentTree2D)
  -- shared R^2 floor 0.958, OWN slope band `[3.13, 7.31]` ns per (log2 n)^2 unit (median ~5.2, MEDIAN of
  7 sweep-fits), sweep `[2^13, 2^18]`; its O(n) linear-scan-count foil is exponential on that axis and
  leaves the line. WORST-CASE member: no max-single-op line.
- Benchmark applicability matrix + dimensions cover 16 subjects (was 15), 21 gated op-rows (was 20),
  16 x 8 = 128 cells (was 120). MergeSortTree is a SUBJECT but NOT a clear-witness (static/immutable, no
  clear()) -- named in `CLEAR_WITNESS_EXCLUDED` with a reason, never silently dropped.
- `package.json` keywords add `merge-sort-tree`, `range-rank`, `offline-range-query`, `static`; the
  description enumerates MergeSortTree.

### Fixed

- Nothing (additive minor).

### Removed

- Nothing.

## [0.15.0] - 2026-09-22

### Added

- **PersistentSegTree** -- the fifteenth member and the family's FIRST persistent / branching structure
  and its FIRST bump/append allocator: a FULLY PERSISTENT (BRANCHING) segment tree via PATH-COPYING. An
  associative range-fold (min / max / sum / gcd, frozen at construction) over a fixed-length array where
  EVERY version is preserved and queryable forever, and any version can be branched off.
  `update(fromVersion, i, value)` does NOT mutate `fromVersion`; it returns a NEW dense version whose
  root SHARES every off-path subtree with the parent and owns a freshly-copied O(log n) root-to-leaf
  path (H + 1 nodes, H = ceil(log2 n)). It is the time-travel complement to the flat SegmentTree
  (member 3): that one is a single mutable timeline over a `Float64Array(2n)`; this one is a persistent
  DAG of immutable nodes. Surface: `query` / `at` / `update` / `clear`, `length` / `versions` /
  `versionCapacity` / `kind` getters, and the static `PersistentSegTree.build(values, versionCapacity,
  kind)`. See `decisions/0017-persistentsegtree.md`.
- **BUMP/APPEND allocator, NOT the free-list NodePool (D-PST2, the load-bearing idiom).** Persistent
  nodes are IMMUTABLE, SHARED across versions, and NEVER individually freed -- freeing a shared node
  would corrupt every version that still points at it. So the allocator is a single monotonic `_next`
  cursor into three preallocated columns (`_val` `Float64Array`, `_left` / `_right` `Uint32Array`;
  `NIL = 0` reserves slot 0). This is the DELIBERATE distinction from SkipList / Treap / Scapegoat /
  SplayTree, which bind the free-list `NodePool` (their nodes are mutable and owned by ONE timeline).
  There is no `free()`; `clear()` is the only reset (rewind `_next`, re-seed v0).
- **Capacity BY VERSION COUNT + a FLOAT-product node-arena guard (D-PST3).** `new PersistentSegTree(
  length, versionCapacity, kind)` takes the max updates (extra versions beyond v0); the node budget
  `1 + (2n-1) + versionCapacity*(H+1)` is computed INTERNALLY and guarded by a FLOAT multiply against
  `PST_MAX_NODES` (`0x7FFFFFFF`, 2^31-1) -- never `| 0`, which would wrap a large product to a small /
  negative int and pass the door (fail OPEN -> under-allocation -> OOB); the float arithmetic is exact
  to 2^53, so a genuine overflow fails CLOSED (the S2D_MAX_CELLS / F2D_MAX_CELLS precedent).
  `PST_MAX_LENGTH` (`0x3FFFFFFF`, 2^30-1) is the per-argument door for `length`.
- **Fail-closed capacity, BOTH arenas (D-PST4).** The VERSION arena fails closed (the
  `versionCapacity + 1`-th update throws; the version guard fires first, before any node overflow); the
  NODE arena's overflow throw is DEAD-CODE by construction but kept as a loud fail-closed defense
  (the SparseTable r<l / SortedArray `_full` precedent). Every door is typeof-guarded FIRST (Symbol /
  BigInt / NaN / +-Infinity fail closed), and a failing door is a genuine NO-OP (no slot consumed, no
  version created).
- **Fold menu = EXACT SegmentTree parity, ABSOLUTE point-set (D-PST5).** min / max / sum / gcd chosen
  ONCE at construction, cached as a small-int `_k` combined by an INLINE switch on every hot body (no
  function ref, no closure, no megamorphic call site), reusing the shared `segGcd` helper. Identity:
  sum -> 0, min -> +Infinity, max -> -Infinity, gcd -> 0; an unwritten cell reads the fold identity
  (v0 seeds every leaf to it). The value door is typeof-first and the gcd kind additionally rejects
  negative / non-integer values -- byte-for-byte the SegmentTree contract. `PersistentSegTree.build`
  seeds v0 in O(n) (a snapshot, NOT n updates), failing closed on non-array-like / non-finite /
  out-of-domain-gcd entries before the tree is usable.
- **The witness's twentieth gated op, on the DEFAULT log2(n) axis (D-PST6).** `PersistentSegTree.query`
  (a read-only descent over a random existing version, WORST-CASE O(log n)) is the gated hot op. It
  inherits the FROZEN family R^2 floor 0.958 and calibrates its OWN slope band by the shared ADR-0004
  method: median 39.25 ns/level, band `[23.55, 54.95]` (median * `[0.6, 1.4]`), gated over EXACT powers
  2^11..2^17. A persistent path-copying query chases scattered bump-allocated slots across the node
  arena, so its per-level slope sits with the pointer-chasing members and its post-torture run has
  scheduler / thermal residue -- so the lane opts into the MEDIAN of 7 independent sweep-fits as
  measurement-quality insurance (the frozen 0.958 floor and slope band are UNTOUCHED). The O(n)
  linear-scan foil leaves the line. WORST-CASE member: no max-single-op line.

### Changed

- Version bumped to 0.15.0 across the trinity (`package.json`, `LogN.js` `VERSION`, `llms.txt`).
- The benchmark grid grows to 15 subjects x 8 dimensions = 120 cells; D1 emits 20 gated witness
  op-rows. `LogN.js`'s prior fourteen classes are byte-identical (VERSION line + one appended class).
- `package.json` keywords add `persistent`, `persistent-segment-tree`, `versioned`, `path-copying`,
  `fully-persistent`, `immutable`.

### Fixed

- Nothing.

### Removed

- Nothing.

## [0.14.0] - 2026-09-22

### Added

- **SortedArray** -- the fourteenth member and the family's READ-OPTIMIZED ordered map: a DYNAMIC
  key -> value ordered map over TWO parallel SORTED `Float64Array` columns (`_key` ascending +
  `_value` at the same index). The family's FIFTH ordered structure (after SkipList / Treap /
  Scapegoat / SplayTree); its differentiator is CONTIGUOUS storage. `get` / `has` / `rank` /
  `successor` / `predecessor` are O(log n) via ONE shared branch-free lower-bound binary search
  (`_lb`); `select` / `keyAt` / `valueAt` are O(1) (a raw array index) and `min` / `max` are O(1)
  (index 0 / size-1); `forEach` is the fastest in the family (a contiguous cache-friendly scan). It
  is literally the sorted-array FOIL the earlier ordered members were measured against, now a
  first-class member. Surface: `get` / `has` / `set` / `delete` / `rank` / `select` / `keyAt` /
  `valueAt` / `successor` / `predecessor` / `min` / `max` / `rangeIter` / `clear` / `forEach`, `size`
  / `capacity` getters, and the static `SortedArray.build(keys, values)`. See
  `decisions/0016-sortedarray.md`.
- **Parallel sorted Float64Array columns + shared lower-bound (D-SA1 / D-SA3).** Keys AND values are
  finite numbers, typeof-guarded FIRST (before any coercion) at every mutating door, so Symbol /
  BigInt / NaN / +-Infinity fail closed (null is not zero). Unique keys; `set` UPDATES the value in
  place when the key exists (O(log n), no shift). `_lb` never early-exits on equality -- it always
  narrows to the lower bound and callers do ONE equality check, so get / has / rank / successor /
  predecessor / the set-probe all reuse the same hot search.
- **Dynamic member with a plain O(n) in-place shift, not static / batched (D-SA2).** A genuine `set`
  insert `copyWithin`-shifts the tail up one slot and `delete` shifts it down one -- in the
  preallocated column, no temp, no spread -- so the O(n) write is still 0 B/op. Fixed capacity: `set`
  overflow throws `[lite-logn]`, never silently drops.
- **O(1) select / keyAt / valueAt / min / max -- the differentiator (D-SA4).** Order statistics are a
  raw array index (no augmentation, unlike Treap / Scapegoat which carry subtree-size columns), and
  the extremes are the two ends of the sorted column.
- **Version-stamped rangeIter (D-SA6).** `rangeIter(lo, hi)` is O(log n + k): a lower-bound seek then
  a contiguous walk; it captures the map's version and throws `[lite-logn]` on any structural mutation
  mid-iteration rather than yield stale data. Bounds may be +-Infinity; NaN or `lo > hi` fails closed.
- **O(n log n) build + `SA_MAX_CAPACITY` (D-SA1).** `SortedArray.build(keys, values)` sorts once by
  key then loads a fresh map sized to the count; it fails closed BEFORE the map is usable on a
  non-array-like, length mismatch, count outside [1, 2^31-1], any non-finite key / value, or a
  DUPLICATE key. `SA_MAX_CAPACITY = 0x7FFFFFFF` (2^31-1) caps the index arithmetic.
- **The witness's nineteenth gated op, back on the default log2(n) axis.** `SortedArray.get` is the
  gated hot op -- a WORST-CASE O(log n) contiguous lower-bound binary search (the deterministic
  Scapegoat.get analogue, no RNG): R^2 0.98 (median-of-7 fits), slope ~1.0 ns/level, band
  `[0.59, 1.38]` (median 0.984 * [0.6, 1.4]), sweep `[2^12, 2^18]` at 1e6 iterations/point. It is the
  family's SHALLOWEST per-level slope (a packed search touches fewer cache lines per level than a
  pointer-chasing descent), so the lane widens the sweep + raises iterations and adds the median-of-7
  fit as measurement-quality insurance -- the frozen 0.958 floor and slope band are UNTOUCHED. The
  O(n) linear-scan foil leaves the line (R^2 ~ 0.78). The O(n) insert (a tail shift) is a DISCLOSED
  max-single-op bar, NEVER gated.

### Changed

- Version bumped to 0.14.0 across the trinity (`package.json`, `LogN.js` `VERSION`, `llms.txt`).
- The benchmark grid grows to 14 subjects x 19 op-rows; D1 emits 19 gated witness op-rows. `LogN.js`'s
  prior thirteen classes are byte-identical (VERSION line + one appended class).
- `package.json` keywords add `sorted-array`, `sorted-map`, `binary-search`, `ordered-array`,
  `cache-friendly`, `read-optimized`.

### Fixed

- **SplayTree** documented iteration complexity corrected (docs only; no code change --
  describes existing v0.8.0 behavior). `forEach` / `[Symbol.iterator]` are `O(n * depth)`
  and `rangeIter` is `O((k + 1) * depth)`, not the previously stated `O(n log n)`: the
  non-splaying walk re-descends by key each step, so a tree built by pure sorted insertion
  with no intervening access (a depth-n chain) makes a full walk `O(n^2)`. README / llms.txt /
  GUIDE now state this and advise splaying a key (or inserting in mixed order) before a large
  walk. The library `forEach` itself is unchanged (the lean non-splaying walk is by design).

### Removed

- Nothing.

## [0.13.0] - 2026-09-22

### Added

- **SegmentTree2D** -- the thirteenth member and the general 2D rectangle FOLD a 2D BIT cannot do: a
  segment tree OF segment trees (a tree of trees) that folds min / max / sum / gcd over any
  axis-aligned rectangle. BOTH point-`update` AND rectangle-`query` in O(log^2 n) = O(log rows *
  log cols) over a SINGLE flat `Float64Array(4 * rows * cols)`. It completes the 2D range story
  Fenwick2D opened -- SegmentTree2D : Fenwick2D :: SegmentTree (1D) : Fenwick (1D) -- lifting the
  exact rectangle MIN / MAX / GCD Fenwick2D lists as its documented not-for. Surface: `query` /
  `update` / `at` / `clear` / `forEach`, `rows` / `cols` / `kind` getters, and the static
  `SegmentTree2D.build(matrix, kind)`. See `decisions/0015-segmenttree2d.md`.
- **Flat 2R x 2C tree-of-trees layout (D-S2-1).** One `Float64Array(4*rows*cols)`, row stride
  `_w = 2*cols`; leaf rows `[rows, 2*rows)`, leaf cols `[cols, 2*cols)`, index 0 unused. `query`
  descends the OUTER row dim half-open collecting O(log rows) boundary row-nodes, and for each does
  an INNER col-range fold (double `l&1` / `r&1` picks in both dims). No pointers, no per-op alloc.
- **Inner-then-outer point-update order (D-S2-2, the correctness site).** `update` writes the leaf,
  climbs the leaf ROW's col-tree at column c, THEN climbs the ROW-tree -- at each row-ancestor it
  recomputes the changed leaf column from its two row-children FIRST, then fixes that row-node's
  col-tree up column c's path. The differential fuzz queries AFTER interleaved updates (not only
  after build) to bite this order.
- **min / max / sum / gcd frozen at ctor, COMMUTATIVE-ONLY (D-S2-3).** The fold is a ctor-cached
  small-int `_k` combined by an INLINE switch (no fn ref / closure / megamorphic site; `gcd` reuses
  `segGcd`). The order-agnostic 2n layout is correct ONLY for commutative + associative folds.
  Identity fills cleared / unused cells and is a legal RESULT (a cleared min grid queries
  `+Infinity`) but never a legal INPUT: NaN / +-Infinity fail closed typeof-first, and the `gcd`
  kind additionally rejects negatives / non-integers.
- **The product-overflow door is a FLOAT multiply, never `| 0` (D-S2-4).** `S2D_MAX_CELLS`
  (`0x7FFFFFFF`) caps `4 * rows * cols`. The guard computes the product as a JS float (exact to
  2^53) and throws when it exceeds the ceiling -- `| 0` would wrap a large product to a small /
  negative int and PASS (fail OPEN -> under-allocation -> OOB). Pinned in the boundary suite.
- **O(rows*cols) two-phase build (D-S2-5).** `SegmentTree2D.build(matrix, kind)` seeds every leaf,
  folds each leaf ROW's col-tree, THEN folds the ROW-tree POSITION-WISE (the 2D fold is separable)
  -- NOT rows*cols individual updates. The behavioral suite proves `build` equals the same cells
  inserted by repeated `update` (backing arrays byte-identical).
- **SPACE co-headline: 4*rows*cols cells (~4x Fenwick2D).** The honest price for the general
  (non-invertible) folds a BIT cannot do. WORST-CASE member: no max-single-op line.
- **The witness's SECOND squared-log lane.** Two gated lanes on the `(log2 n)^2` axis Fenwick2D
  introduced (shared R^2 floor 0.958): `SegmentTree2D.update` slope 5.638 ns/level^2 band
  [3.38, 7.89]; `SegmentTree2D.query` slope 5.105 ns/level^2 band [3.06, 7.15] (median-of-15;
  both rock-steady single-fit, R^2 >= 0.994 / 0.9999). Foils = O(n^2) grid rebuild / rectangle scan.

### Changed

- Version bumped to 0.13.0 across the trinity (`package.json`, `LogN.js` `VERSION`, `llms.txt`).
- The benchmark grid grows to 13 subjects x 8 dimensions = 104 cells; D1 emits 18 gated witness
  op-rows. `LogN.js`'s prior twelve classes are byte-identical (VERSION line + one appended class).

## [0.12.0] - 2026-09-21

### Added

- **Fenwick2D** -- the twelfth member and the family's FIRST 2D / multi-dimensional structure: a 2D
  Binary Indexed Tree that lifts the 1D Fenwick's lowest-set-bit walk (`i & -i`) to a rectangle.
  BOTH point-`update` AND 2D-`prefix` (and therefore arbitrary axis-aligned RECTANGLE sums via
  inclusion-exclusion) in O(log^2 n) = O(log rows * log cols) over a SINGLE flat
  `Float64Array((rows+1)*(cols+1))` (row 0 / col 0 the unused identity sentinels; 1-based
  internally, 0-based public coords). Surface: `update` / `prefix` / `rectSum` / `at` / `set` /
  `clear` / `forEach`, `rows` / `cols` getters, and the static `Fenwick2D.build(matrix)`. Values
  are finite numbers (negatives allowed; typeof-guarded before coercion; NaN / +-Infinity /
  non-number / Symbol / BigInt fail closed). See `decisions/0014-fenwick2d.md`.
- **Flat SoA layout + nested `i & -i` (D-F2-1).** `update` climbs BOTH dims by the lowest set bit
  (an outer rows loop, an inner cols loop, one `_t` touch per (i, j) level pair); `prefix` descends
  both. Row stride `_w = cols + 1`. No pointers, no per-op allocation.
- **The product-overflow door is a FLOAT multiply, never `| 0` (D-F2-2).** `F2D_MAX_CELLS`
  (`0x7FFFFFFF`) caps `(rows + 1) * (cols + 1)`. The guard computes the product as a JS float
  (exact to 2^53) and throws when it exceeds the ceiling -- `| 0` would wrap a large product to a
  small / negative int32 and PASS (fail OPEN), handing back a degenerate zero-cell tree. The
  adversarial case `rows+1 = cols+1 = 65536` (true product 2^32 > 2^31-1, but `(2**32) | 0 === 0`)
  is pinned in the boundary suite.
- **Two-pass LINEAR build + rectSum base case (D-F2-3).** `Fenwick2D.build(matrix)` is
  O(rows*cols): seed each cell, then propagate in TWO SEPARATE passes (cols within each row, THEN
  rows). Fusing them into one nested loop DOUBLE-COUNTS -- the behavioral suite proves `build`
  equals the same cells inserted by repeated `update`. `rectSum` inlines the 2D inclusion-exclusion
  `P(r2,c2) - P(r1-1,c2) - P(r2,c1-1) + P(r1-1,c1-1)`; when `r1 == 0` / `c1 == 0` the `P(-1, .)`
  terms vanish by a `k = 0` loop-skip (never a `prefix(-1)` / `_t[-1]` read).
- **SUM-ONLY, index-addressed (D-F2-3/4, the 1D Fenwick's boundary lifted).** Like the 1D Fenwick,
  rectSum works ONLY because subtraction inverts addition -- there is deliberately NO 2D min / max /
  gcd (a BIT has no inverse for them; a future 2D SegmentTree owns those) and NO changeKey / rank /
  select. WORST-CASE member: no max-single-op line.

### Verified

- **Witness (D-F2-4) -- the family's FIRST SQUARED-log axis.** Fenwick2D's ops are O(log^2 n), so
  its witness lane fits `nsPerOp = intercept + slope * (log2 n)^2` via a per-lane `xOf` axis hook
  added to both `test/witness.mjs` and `benchmark/Dimensions.mjs` (default `xOf = Math.log2` keeps
  every prior lane BYTE-IDENTICAL). Two ops are gated on the squared-log axis over exact power-of-two
  SQUARE SIDES 2^5..2^11, both inheriting the FROZEN family R^2 floor 0.958: `update` slope band
  `[2.13, 4.96]` (median-of-fits, median 3.542 x `[0.6, 1.4]`) and `rectSum` slope band
  `[2.90, 6.77]` (median 4.832 x `[0.6, 1.4]`). Each op's O(n^2)-per-op FOIL (a dense rectangle
  rescan) leaves the squared-log line. The prior eleven members stay ON-LINE / unchanged.
- **Zero-GC.** `node --expose-gc test/torture.mjs` -- 0 B/op on the update / prefix / rectSum / at /
  set lanes, gc major = 0, the deliberately-allocating control lane still non-zero (teeth),
  conservation / leak clean. `npm run test:perf` -- `grows === 0` on every Fenwick2D scenario.

### Notes

- `LogN.js` gains `F2D_MAX_CELLS` + the `Fenwick2D` class, appended after FibonacciHeap; the prior
  ELEVEN classes stay BYTE-IDENTICAL (only the `VERSION` const changes above the append point).
  Version bumped to 0.12.0 across `package.json`, `LogN.js`, and `llms.txt`. See
  `decisions/0014-fenwick2d.md`.

## [0.11.0] - 2026-09-21

### Added

- **FibonacciHeap** -- the eleventh member and the mergeable-heap arc's FINALE: the textbook-optimal
  ADDRESSABLE mergeable priority queue (Fredman & Tarjan 1984). `push` / `meld` / `decreaseKey` are
  O(1) AMORTIZED; `popMin` / `remove` are O(log n) AMORTIZED. Where PairingHeap (0012) reaches the
  same amortized bounds with a lean two-pass combine (and usually WINS wall-clock), FibonacciHeap
  reaches them by the full textbook machine: a lazy forest of heap-ordered trees on CIRCULAR
  doubly-linked lists, a CASCADING-cut `decreaseKey` governed by a per-node MARK bit, and a
  degree-CONSOLIDATING `popMin`. Surface: `push` / `popMin` / `peekMin` / `peekMinKey` /
  `decreaseKey` / `remove` / `has` / `keyOf` / `meld` / `clear` / `forEach` / `[Symbol.iterator]`,
  `size` / `capacity` / `kind` getters, and the static `FibonacciHeap.arena(capacity, kind, count)`
  factory. Keys are finite numbers (typeof-guarded before coercion; key checked FIRST).
- **HONESTY (the load-bearing claim).** This member is textbook-optimal in ASYMPTOTICS but OFTEN
  SLOWER wall-clock than Pairing / Binary on real hardware (large constant factors, long spikes).
  It is shipped for completeness and teaching, NOT because it is the fastest on this machine -- the
  benchmark says so plainly and the witness DISCLOSES (never gates) the spikes.
- **ADDRESSABLE, ARENA-WIDE-UNIQUE ids (D-FH1, reused from PairingHeap).** Caller ids are UNIQUE
  integers in [0, capacity); the reverse map `_pos` (id -> slot, sentinel -1) is SHARED across every
  heap drawing the arena; a per-slot `_owner` tag makes `decreaseKey(id)` / `remove(id)` on a
  sibling-owned id an O(1)-detected `[lite-logn]` throw; pushing an id live ANYWHERE in the arena
  throws. Eight pointer-free columns (`_key` Float64, `_id` / `_left` / `_right` / `_child` /
  `_parent` / `_degree` Uint32, `_mark` Uint8) + the arena-wide `_pos` Int32 + a per-slot `_owner` +
  a union-find `_alias` + the per-arena `_bucket` consolidation scratch, over a private free-list
  (NodePool); NIL = 0 reserves slot 0. `kind` 'min' | 'max' frozen at ctor. `decreaseKey` operates
  TOWARD the extreme; a move away fails closed.
- **Cascading cut + a MARK BIT as a Uint8 column (D-FH2).** `decreaseKey` cuts a heap-order-violating
  node's subtree to the root and CASCADES up its former parent chain (a marked parent is cut too; the
  first unmarked non-root parent is marked and the walk stops). The mark is a dedicated `_mark` Uint8
  COLUMN -- a packed bitset buys no GC and costs hot-body mask/shift bytes (hot-path law). The cascade
  is ITERATIVE (a native loop, no recursion) so decreaseKey stays 0 B/op.
- **Circular lists + degree consolidation; the degree bucket is sized to the GOLDEN-RATIO bound
  (D-FH3).** `popMin` splices the min root's children into the root list then CONSOLIDATES by degree
  via the preallocated per-arena `_bucket` (Uint32), cleared PER CALL in O(maxDegree) (only touched
  slots reset, NEVER stale -- a stale entry would silently corrupt the forest). The bucket is sized
  to the Fibonacci degree bound D(n) <= floor(log_phi n) ~ 1.44 * log2 n, NOT the naive ceil(log2
  cap): a bucket one level short would let a consolidation write past its end (a silent typed-array
  no-op whose read of `undefined` corrupts the link loop). See `decisions/0013-fibonacciheap.md`.
- **SHARED-ARENA, O(1) meld WITHOUT an O(|b|) retag (D-FH4).** `a.meld(b)` concatenates the two
  circular root lists + a union `_alias` redirect of b's heap id to a's + a cached-extreme update,
  INDEPENDENT of |b|. The alias is EXACTLY how PairingHeap avoids re-tagging b's nodes (a per-node
  `_owner` retag would make meld O(|b|), the rejected alternative). `a.meld(b)` CONSUMES b (empty,
  size 0, DEAD -- every later op throws); a melded-in id stays reprioritizable via the survivor.
  Cross-arena is column identity (`a._key !== b._key`); a kind mismatch, a non-FibonacciHeap arg, a
  self-meld, or a consumed operand each throw. Conservation across meld is a hard invariant: nodes
  MOVE root lists but NEVER pools (torture-tested every soak cycle, incl. the addressable paths).

### Verified

- **Witness (D-FH5).** `FibonacciHeap.popMin` is the gated O(log n) witness op. It inherits the
  FROZEN family R^2 floor 0.958 and calibrates its OWN slope band by the shared ADR-0004 method:
  median-of-15 popMin fit-runs = 45.296 ns/level (samples 43.24 44.40 44.46 44.32 44.93 45.30 45.27
  45.59 45.28 45.56 45.71 45.62 46.08 46.14 45.84), band = median x `[0.6, 1.4]` = `[27.18, 63.41]`,
  gated over EXACT powers 2^11..2^17. This is the FAMILY's STEEPEST per-level slope (a lazy forest
  consolidated on demand -- the largest constant factors of any heap here), as expected. AMORTIZED
  member: the MAX single popMin (a long consolidation) AND the MAX single decreaseKey (a cascading-
  cut spike) are DISCLOSED, not gated. The O(n) foil is a linear min-scan-and-splice (OFF the line).
- **Witness RELIABILITY (median-of-fits, honest R^2 spread).** A Fibonacci-heap full-drain average
  has even MORE run-to-run SHAPE variance than the pairing two-pass, so a SINGLE sweep-fit's R^2 is
  FLAKY -- a batch of 15 single fits ranged ~0.981..0.988 on this machine, and across meta-runs a
  single fit CAN dip below the 0.958 floor even while the slope stays in-band. The lane therefore
  gates on the MEDIAN of 7 independent sweep-fits (the `fitRuns` hook) -- measurement-quality only
  (the frozen 0.958 floor + slope band are UNTOUCHED; a real O(n) shape fails all fits). NO
  unreproducible "every run >= floor" is claimed; the TRUE, weaker claim is that the median-of-7
  clears the floor reliably (`node test/witness.mjs` re-run several times back-to-back was ON-LINE
  every time; the observed median R^2 range is recorded in `decisions/0013-fibonacciheap.md`).
- **Zero-GC.** `node --expose-gc test/torture.mjs` -- 0 B/op on the push / popMin / decreaseKey /
  remove / read / meld / arena-churn / forEach lanes, gc major = 0, the deliberately-allocating
  control lane still non-zero (teeth), the free-list conservation invariant holds ACROSS MELD (nodes
  move root lists, not pools) AND across the addressable decreaseKey/remove paths, arrayBuffers do
  not grow across fill/clear soak cycles. `npm run test:perf` -- 0 scavenges + `grows === 0` on every
  FibonacciHeap scenario (push/popMin, decreaseKey, remove, read, meld).

### Notes

- `LogN.js` gains `FH_MAX_CAPACITY` (`0x7FFFFFFF`, named distinctly from the identically-valued
  `BH_MAX_CAPACITY` / `PH_MAX_CAPACITY`) + `FH_LOG2_PHI` + the `FibonacciHeap` class, appended after
  PairingHeap; the prior TEN classes stay BYTE-IDENTICAL (only the `VERSION` const changes above the
  append point -- a two-hunk diff). The mergeable-heap arc is now COMPLETE: BinomialHeap (lean) /
  PairingHeap (addressable, fast) / FibonacciHeap (addressable, textbook-optimal-but-slower). Version
  bumped to 0.11.0 across `package.json`, `LogN.js`, and `llms.txt`. See
  `decisions/0013-fibonacciheap.md`.

## [0.10.0] - 2026-09-21

### Added

- **PairingHeap** -- the tenth member and the mergeable-heap arc's ADDRESSABLE priority queue: a
  single multi-way heap-ordered tree (left-child / right-sibling) whose defining ops are a cut-and-
  link `decreaseKey` (AMORTIZED O(log n)) and an O(1) `meld` (Fredman, Sedgewick, Sleator, Tarjan
  1986). `push` / `peekMin` / `peekMinKey` / `meld` are O(1); `popMin` / `decreaseKey` / `remove`
  are AMORTIZED O(log n). `popMin` unlinks the root then does a TWO-PASS combine of the root's
  child list (pair left-to-right, then fold right-to-left) -- iterative and POINTER-FREE, the
  `_sibling` links ARE the work list, so NO temporary array (0 B/op). Surface: `push` / `popMin` /
  `peekMin` / `peekMinKey` / `decreaseKey` / `remove` / `has` / `keyOf` / `meld` / `clear` /
  `forEach` / `[Symbol.iterator]`, `size` / `capacity` / `kind` getters, and the static
  `PairingHeap.arena(capacity, kind, count)` factory. Keys are finite numbers (typeof-guarded
  before coercion -- Symbol / BigInt / NaN / +-Infinity fail closed, key checked FIRST).
- **ADDRESSABLE, ARENA-WIDE-UNIQUE ids (D-PH1).** Caller ids are UNIQUE integers in [0, capacity),
  and the reverse map `_pos` (id -> slot, sentinel -1) is SHARED across EVERY heap drawing the
  arena -- a user-visible contract difference vs BinomialHeap's opaque, non-unique ids. A per-slot
  `_owner` tag makes `decreaseKey(id)` / `remove(id)` on an id owned by a DIFFERENT live sibling
  heap an O(1)-detected `[lite-logn]` throw (never a silent cross-heap cut); pushing an id live
  ANYWHERE in the arena throws. Five pointer-free typed-array columns (`_key` Float64, `_id` /
  `_child` / `_sibling` / `_parent` Uint32 -- `_parent` is a dual-role PREV pointer for O(1) cut)
  + the arena-wide `_pos` Int32 reverse map + a per-slot `_owner` + a union-find `_alias` over
  heap ids, over a private free-list (NodePool); NIL = 0 reserves slot 0. `kind` 'min' | 'max' is
  frozen at construction (a ctor-cached `_isMin` boolean drives the hot compare). `decreaseKey`
  operates TOWARD the heap's extreme (decrease for 'min', increase for 'max'); a move away fails
  closed.
- **SHARED-ARENA, O(1) meld (D-PH3).** `a.meld(b)` is a SINGLE root-link plus a union alias
  redirecting b's heap id to a's -- <= ~6 column writes, INDEPENDENT of |b| (BETTER than
  BinomialHeap's O(log n) meld). It CONSUMES b: b becomes empty (size 0) AND DEAD -- every later
  op on b throws `[lite-logn]`. The alias is a tiny path-halved union-find over heap ids, so a
  node melded in from b still resolves its owner to a in ~O(1) WITHOUT re-tagging every node (a
  per-heap map would make meld O(|b|), the rejected alternative in D-PH1); a melded-in id stays
  reprioritizable via the surviving heap. Cross-arena detection is COLUMN IDENTITY
  (`a._key !== b._key`); a kind mismatch, a non-PairingHeap arg, a self-meld, or a consumed
  operand each throw. Conservation across meld is a hard invariant: nodes MOVE between root lists
  but NEVER between pools (torture-tested every soak cycle, incl. the addressable decreaseKey/remove
  paths).

### Verified

- **Witness (D-PH2).** `PairingHeap.popMin` is the gated O(log n) witness op (the pairing heap's
  tallest honest walk -- the two-pass combine). It inherits the FROZEN family R^2 floor 0.958 and
  calibrates its OWN slope band by the shared ADR-0004 method: median-of-15 popMin fit-runs =
  21.799 ns/level (samples 20.96 21.70 21.82 21.74 21.80 21.18 21.54 21.81 21.79 21.97 21.49 21.88
  22.19 22.08 22.24), band = median x `[0.6, 1.4]` = `[13.08, 30.52]`, gated over EXACT powers
  2^11..2^17 (the cache-resident pointer-chasing window). AMORTIZED member: the MAX single popMin
  (a long two-pass fold) is DISCLOSED, not gated. The O(n) foil is a linear min-scan-and-splice
  extract-min (OFF the line).
- **Witness RELIABILITY (median-of-fits).** A pairing-heap full-drain average has genuine
  run-to-run SHAPE variance, so a SINGLE sweep-fit's R^2 is FLAKY -- individual single-fit R^2
  ranges ~0.945..0.985 on this machine and dips below the 0.958 floor in a minority of runs (even
  while the slope stays in-band). The PairingHeap lane therefore gates on the MEDIAN of 5
  independent sweep-fits (the `fitRuns` hook), rejecting the occasional tilted sweep on both ends
  -- measurement-quality only (the frozen 0.958 floor + slope band are UNTOUCHED; a real O(n) shape
  fails all fits). Measured: the median-of-5 fit R^2 ranges 0.9907..0.9974 over 15 back-to-back
  meta-runs (0/15 below the floor), and `node test/witness.mjs` re-run 12x back-to-back was ON-LINE
  every time (observed R^2 range recorded in `decisions/0012-pairingheap.md`).
- **Zero-GC.** `node --expose-gc test/torture.mjs` -- 0 B/op on the push / popMin / decreaseKey /
  remove / read / meld / arena-churn / forEach lanes, gc major = 0, the deliberately-allocating
  control lane still non-zero (teeth), the free-list conservation invariant holds ACROSS MELD
  (nodes move root lists, not pools) AND across the addressable decreaseKey/remove paths,
  arrayBuffers do not grow across fill/clear soak cycles. `npm run test:perf` -- 0 scavenges +
  `grows === 0` on every PairingHeap scenario (push/popMin, decreaseKey, remove, read, meld).

### Notes

- `LogN.js` gains `PH_MAX_CAPACITY` (`0x7FFFFFFF`, named distinctly from BinaryHeap's identically-
  valued `BH_MAX_CAPACITY` to avoid a module-scope redeclaration) + the `PairingHeap` class,
  appended after BinomialHeap; the prior nine classes stay BYTE-IDENTICAL (only the `VERSION` const
  changes above the append point -- a two-hunk diff). Version bumped to 0.10.0 across
  `package.json`, `LogN.js`, and `llms.txt`. See `decisions/0012-pairingheap.md`.

## [0.9.0] - 2026-09-21

### Added

- **BinomialHeap** -- the ninth member and the family's first MERGEABLE priority queue: a forest
  of heap-ordered binomial trees whose defining op is `meld` (union two heaps) in O(log n)
  WORST-case via a BINARY CARRY over the two order-sorted root lists -- the structural analogue
  of adding two binary numbers (Vuillemin 1978). `push` is O(1) AMORTIZED (O(log n) worst),
  `popMin` is O(log n) worst (unlink the extreme root, reverse its child list into a new root
  list, union back, rescan the O(log n) roots), and `peekMin` is O(1) via a cached `_min` root
  maintained INLINE (never rescanned on the hot path). Surface: `push` / `popMin` / `peekMin` /
  `peekMinKey` / `meld` / `clear` / `forEach` / `[Symbol.iterator]`, `size` / `capacity` /
  `kind` getters, and the static `BinomialHeap.arena(capacity, kind, count)` factory. Keys are
  finite numbers (typeof-guarded before coercion -- Symbol / BigInt / NaN / +-Infinity fail
  closed with a `[lite-logn]` throw, key checked FIRST, then the opaque id).
- **LEAN + NON-ADDRESSABLE (D-BH1).** The id is an OPAQUE Uint32 payload in [0, 2^32) -- not
  unique, no reverse map (the MinMaxHeap idiom) -- so there is deliberately NO decreaseKey /
  remove / changeKey / rank / select. Six pointer-free typed-array columns (`_key` Float64,
  `_id` / `_parent` / `_child` / `_sibling` / `_order` Uint32) over a private free-list
  (NodePool); NIL = 0 reserves slot 0. `kind` 'min' | 'max' is frozen at construction (a ctor-
  cached `_isMin` boolean drives the hot compare).
- **SHARED-ARENA, O(log n) meld (D-BH2).** A meld rewires roots in place, so two heaps can meld
  only if they draw from the SAME backing arena. A standalone `new BinomialHeap(capacity, kind)`
  owns its own arena; `BinomialHeap.arena(capacity, kind, count)` hands out `count` arena-
  sharing heaps (the Treap.split/merge `_view` precedent). `a.meld(b)` CONSUMES b: b becomes
  empty (size 0) AND DEAD -- every later op on b throws `[lite-logn]` rather than silently re-
  enter the now-shared roots (the consume idiom, hardened with a `_consumed` flag). Cross-arena
  detection is COLUMN IDENTITY (`a._key !== b._key`); a kind mismatch, a non-BinomialHeap arg,
  a self-meld, or a consumed operand each throw. Conservation across meld is a hard invariant:
  nodes MOVE between root lists but NEVER between pools (torture-tested every soak cycle).

### Verified

- **Witness (D-BH2).** `BinomialHeap.popMin` is the gated O(log n) witness op (the mergeable
  heap's tallest honest walk). It inherits the FROZEN family R^2 floor 0.958 and calibrates its
  OWN slope band by the shared ADR-0004 method: median-of-15 popMin fit-runs = 44.821 ns/level
  (runs spanned 44.25..45.35, R^2 0.9786..0.9840), band = median x `[0.6, 1.4]` =
  `[26.89, 62.75]`, gated over EXACT powers 2^11..2^17 (a binomial popMin chases scattered
  forest slots, so it needs the cache-resident exact-power window the pointer-chasing members
  use; the [1e4..1e6] band curves at the memory wall). WORST-case member: NO max-single-op
  disclosure line. The O(n) foil is a linear min-scan-and-splice extract-min (OFF the line).
- **Zero-GC.** `node --expose-gc test/torture.mjs` -- 0 B/op on the push / popMin / read /
  meld / arena-churn / forEach lanes, gc major = 0, the deliberately-allocating control lane
  still non-zero (teeth), the free-list conservation invariant holds ACROSS MELD (nodes move
  root lists, not pools), arrayBuffers do not grow across fill/clear soak cycles. `npm run
  test:perf` -- 0 scavenges + `grows === 0` on every BinomialHeap scenario.

### Notes

- `LogN.js` gains `BINH_MAX_CAPACITY` (`0x7FFFFFFF`, named distinctly from BinaryHeap's
  identically-valued `BH_MAX_CAPACITY` to avoid a module-scope redeclaration) + the
  `BinomialHeap` class, appended after SplayTree; the prior eight classes stay BYTE-IDENTICAL
  (only the `VERSION` const changes above the append point -- a two-hunk diff). Version bumped
  to 0.9.0 across `package.json`, `LogN.js`, and `llms.txt`. See `decisions/0011-binomialheap.md`.

## [0.8.0] - 2026-09-21

### Added

- **SplayTree** -- the eighth member and the family's SELF-ADJUSTING BST ordered map
  (key -> value): every access SPLAYS -- a chain of rotations that walks the touched node
  (or, for an absent key, the last node on the search path) to the root (Sleator & Tarjan
  1985). Recently / frequently used keys ride near the top, giving AMORTIZED O(log n) per op
  and genuinely FASTER-than-log behaviour on skewed / working-set access. Surface: `get` /
  `has` / `set` / `delete` / `successor` / `predecessor` / `rangeIter` / `forEach` /
  `[Symbol.iterator]` / `clear`, and `size` / `capacity` getters. Keys and values are finite
  numbers (typeof-guarded before coercion -- Symbol / BigInt / NaN / +-Infinity fail closed
  with a `[lite-logn]` throw, key checked FIRST).
- **Iterative TOP-DOWN splay, zero-stack (D-SP1).** A single downward pass assembles a left
  and a right tree, handling zig / zig-zig / zig-zag in place. Slot 0 (the NIL sentinel)
  DOUBLES as the splay's dummy header; two fixed scratch hands (`_hl` / `_hr`) grow the two
  trees. NO parent column, NO path stack, NO recursion -- so every hot op is 0 B/op and no
  degenerate chain can overflow the native stack. The header columns are restored to 0 before
  the splay returns (the NIL invariant holds between ops).
- **A READ MUTATES (D-SP2).** `get` / `has` / `successor` / `predecessor` SPLAY the touched
  (or closest) node to the root and BUMP the iteration version -- the defining property that
  keeps hot keys shallow. So an in-flight `rangeIter` fails closed even on a READ.
  `rangeIter` / `forEach` / `[Symbol.iterator]` are the only non-mutating reads: NON-splaying
  in-order walks that leave `_root` + `_version` byte-identical. `delete` splays the target up
  then JOINS its subtrees (splay the max of the left subtree up, hang the right there).
- **LEAN + DETERMINISTIC (D-SP3 / D-SP4).** Four columns (`_key` / `_value` Float64, `_left` /
  `_right` Uint32) over the shared free-list, plus a scalar size counter -- NO subtree-size
  column and therefore deliberately NO rank / select / split / merge (Treap / Scapegoat carry
  the augmented surface; the documented asymmetry). No RNG, no seed argument: the shape is a
  deterministic function of the access sequence.

### Verified

- **Witness (D-SP5).** `SplayTree.get` is the gated O(log n) witness op, measured over a
  UNIFORM-RANDOM working set of size n (so the splay churns the full height and the AMORTIZED
  line shows; a skewed pattern would flatten it -- the member's speedup, not what a straight-
  log witness measures). It inherits the FROZEN family R^2 floor 0.958 and calibrates its OWN
  slope band by the shared ADR-0004 method: median-of-15 get fit-runs = 27.316 ns/level (runs
  spanned 26.75..27.71, R^2 0.9750..0.9872), band = median x `[0.6, 1.4]` = `[16.39, 38.24]`,
  gated over 2^12..2^17. AMORTIZED + DETERMINISTIC: the harness DISCLOSES the MAX single get (a
  cold deep splay), never gates it. The O(n) foil is a linear scan (OFF the line).
- **Zero-GC.** `node --expose-gc test/torture.mjs` -- 0 B/op on the get (splays!) / working-set
  / set / delete+re-set / successor / forEach / rangeIter lanes, gc major = 0, the deliberately-
  allocating control lane still non-zero (teeth), the free-list conservation invariant holds,
  arrayBuffers do not grow across fill/clear soak cycles. `npm run test:perf` -- 0 scavenges +
  `grows === 0` on every SplayTree scenario.

### Notes

- `LogN.js` gains `SP_MAX_CAPACITY` (`0x7FFFFFFF`) + the `SplayTree` class, appended after
  MinMaxHeap; the prior seven classes stay BYTE-IDENTICAL (only the `VERSION` const changes
  above the append point -- a two-hunk diff). Version bumped to 0.8.0 across `package.json`,
  `LogN.js`, and `llms.txt`. See `decisions/0010-splaytree.md`.

## [0.7.0] - 2026-09-20

### Added

- **MinMaxHeap** -- the seventh member and the family's DOUBLE-ENDED priority queue
  (DEPQ): a single array-embedded binary heap whose levels ALTERNATE min / max (Atkinson,
  Sack, Santoro & Strothotte 1986). Even depth (the root is depth 0) is a MIN level, odd
  depth a MAX level, so the global minimum sits at the root and the global maximum is the
  LARGER of the root's up-to-two children. `peekMin` / `peekMax` / `peekMinKey` /
  `peekMaxKey` are O(1); `push` / `popMin` / `popMax` are all WORST-case O(log n) from that
  ONE heap (no second heap, no paired-heap correspondence). Surface: `push(id, key)` /
  `popMin` / `popMax` / `peekMin` / `peekMax` / `peekMinKey` / `peekMaxKey` / `clear` /
  `forEach` / `[Symbol.iterator]`, and `size` / `capacity` getters, plus a Floyd O(n)
  `MinMaxHeap.build(ids, keys, capacity)` (deepest-first, level-aware sift-down). Keys are
  finite numbers (typeof-guarded before coercion -- Symbol / BigInt / NaN / +-Infinity fail
  closed with a `[lite-logn]` throw, key checked FIRST, then the id, then a full heap).
- **id + key payload, NON-addressable (the asymmetry vs BinaryHeap).** Two parallel
  pointer-free typed-array columns (`_id` Uint32Array + `_key` Float64Array), the BinaryHeap
  id+key idiom -- but with NO `_pos` reverse map, and therefore deliberately NO `changeKey` /
  `remove`. The id is an OPAQUE Uint32 payload (NOT unique; the full [0, 2^32) domain, wider
  than BinaryHeap's [0, capacity)). A DEPQ's job is the two extremes; addressability is the
  separable concern BinaryHeap already carries. There is also NO `kind` argument / getter (a
  DEPQ has both ends; a kind getter would be a lie).
- **Classic one-element-per-node min-max heap only.** The interval-heap DEPQ (two elements
  per node) is a deliberately deferred alternative -- named, never silently omitted (see
  `decisions/0009-minmaxheap.md` and "What this is not").
- **Level parity, computed zero-alloc.** Slot i is a MIN level iff
  `((31 - Math.clz32(i + 1)) & 1) === 0`. The sifts are hole-punching (one write per level,
  only local scalar temporaries): `push` compares to the parent to pick the own-level vs
  other-level chain then bubbles by grandparents; `popMin` / `popMax` trickle down over the
  up-to-six descendants (children + grandchildren), bound-checking every grandchild index
  against the live size (the classic min-max off-by-one, verified at n = 1, 2, 3, 4).

### Verified

- **Witness (D-M5).** `MinMaxHeap.popMin` is the gated O(log n) witness op (the full-height
  level-aware trickle-down). It inherits the FROZEN family R^2 floor 0.958 and calibrates its
  OWN slope band by the shared ADR-0004 method: median-of-15 popMin fit-runs = 10.30 ns/level
  (runs spanned 9.38..10.59, R^2 0.9897..0.9991), band = median x `[0.6, 1.4]` = `[6.18, 14.42]`.
  A DEPQ whose push / popMin / popMax are ALL worst-case, so there is NO max-single-op line.
  The O(n) foil is a linear min-scan-and-splice extract-min (R^2 ~ 0.77, OFF the line).
- **Zero-GC.** `node --expose-gc test/torture.mjs` -- 0 B/op on the popMin / popMax / mixed
  push+popMin+popMax churn and the peek read lanes, gc major = 0, the deliberately-allocating
  control lane still non-zero (teeth), arrayBuffers do not grow across fill/clear soak cycles.
  `npm run test:perf` -- 0 scavenges + `grows === 0` on every MinMaxHeap scenario.

### Notes

- `LogN.js` gains `MMH_MAX_CAPACITY` (`0x7FFFFFFF`) + the `MinMaxHeap` class, appended after
  Scapegoat; the prior six classes stay BYTE-IDENTICAL (only the `VERSION` const changes above
  the append point). Version bumped to 0.7.0 across `package.json`, `LogN.js`, and `llms.txt`.

## [0.6.0] - 2026-09-20

### Added

- **Scapegoat** -- the sixth member and the family's DETERMINISTIC balanced BST, the
  honest PAIR to Treap: a weight-balanced binary search tree that is ALSO an
  order-statistic tree (an AUGMENTED ordered map key -> value). Where a treap randomizes
  its shape to be balanced IN EXPECTATION, a scapegoat keeps a hard WORST-CASE height
  bound -- so `get` is O(log n) WORST-case (never merely expected) -- and pays for it with
  AMORTIZED O(log n) `set` / `delete`, where an occasional subtree rebuild absorbs the
  imbalance. A subtree-size column `_size` (maintained in the same pass as every link
  rewrite and every rebuild) adds O(log n) order statistics. Surface: `get` / `has` /
  `set` (updates the value in place on an existing key) / `delete` (idempotent) /
  `rank(x)` (count of keys STRICTLY less than x) / `select(k)` (the k-th smallest key,
  0-based) / `successor` (strictly greater) / `predecessor` (strictly less) /
  `rangeIter(lo, hi)` (a VERSION-STAMPED iterator over `[lo, hi]` inclusive, ascending;
  `+-Infinity` bounds allowed, structural OR value mutation mid-iteration throws) /
  `forEach` / `clear`, and `size` / `capacity` / `alpha` getters. Keys and values are
  finite numbers (typeof-guarded before coercion -- Symbol / BigInt / NaN / +-Infinity
  fail closed with a `[lite-logn]` throw).
- **NO priorities, NO RNG (fully deterministic).** Unlike Treap, Scapegoat draws no random
  priority and uses no LCG / `Math.random` anywhere: the tree shape is a deterministic
  function of the insert / delete order. `alpha` (the weight-balance factor) is validated
  to the OPEN interval `(0.55, 0.75)` -- both ends throw -- and frozen at construction
  (default `2/3`); the alpha-derived depth constant `_invAlpha = 1/alpha` is ctor-cached so
  the hot insert path uses no per-op `Math.log` (the depth test is `_invAlpha^d > size`).
- **Zero-GC rebuild over preallocated scratch (the load-bearing design call).** No fresh
  array per rebuild: ONE `_flat` (`Uint32Array(capacity)`) + ONE `_stack`
  (`Uint32Array(capacity+1)`) are allocated at construction and reused every rebuild. An
  ITERATIVE, Morris-free in-order flatten (via `_stack`) writes sorted slot indices into
  `_flat`; a bounded log-depth balanced rebuild re-links `_left` / `_right` / `_size` on
  the native call stack. Proven 0 B/op even under a rebuild-HEAVY ascending-insert trace by
  the torture gate and a dedicated PerfGate scavenge-clean scenario
  (decisions/0008-scapegoat.md).
- **Third bind of the shared NodePool.** Nodes are slot INDICES in five flat columns
  (`_key` / `_value` Float64; `_left` / `_right` / `_size` Uint32, `NIL = 0`) over the SAME
  private free-list (`NodePool`) SkipList and Treap ship -- design-parity, not a fork or a
  runtime dep. The conservation invariant `activeSlots + freeListLength === capacity` holds
  after every op, INCLUDING across rebuild storms. `SG_MAX_CAPACITY = 0x7FFFFFFF` (2^31 - 1:
  slot indices + subtree counts fit a `Uint32`).
- **The documented asymmetry vs Treap: NO `split` / `merge`.** A scapegoat has no priority
  heap to merge by, and an honest deterministic split/merge would be O(n) rebuilds
  (forfeiting the sub-linear headline), so Scapegoat's surface is the ordered-map +
  order-statistic core and split/merge are deliberately absent -- named on the public
  surface (JSDoc + `llms.txt` + README + the `.d.ts`), not hidden.
- **Witness: `Scapegoat.get` gated + the amortized-trace assertion.** `get` (a
  deterministic weight-balanced descent) is gated ON the O(log n) line in its own
  calibrated band `SCAPEGOAT_GET_SLOPE_LO/HI = [2.41, 5.63]` (median-of-15 slope 4.02
  ns/level * [0.6, 1.4], MEDIAN-centered per ADR-0004), inheriting the FROZEN shared R^2
  floor 0.958; its O(n) linear-scan foil leaves the line. The rebuild spike lives on the
  AMORTIZED `set` path and is NEVER gated as a per-op line; instead the amortized-trace
  assertion proves the amortization -- the cumulative ascending-insert (rebuild-heavy)
  cost/op tracks a LOG curve (last/first ratio ~1.5x, gated `< 4x`) where a rebuild-less
  BST would blow to ~64x. The five prior members' bands are UNTOUCHED.

### Notes

- Append-only: `LogN.js` gains `SG_MAX_CAPACITY` + the `Scapegoat` class after Treap;
  BinaryHeap / Fenwick / SegmentTree / SkipList / Treap are BYTE-IDENTICAL (only the
  `VERSION` const changes). The repo-only benchmark admits Scapegoat as the 6th SUBJECT
  (matrix 5x8=40 -> 6x8=48, a new `OLOGN_AMORTIZED` honesty class for `set` / `delete`).

## [0.5.0] - 2026-09-20

### Added

- **Treap** -- the fifth member and the family's balanced BST: a randomized,
  self-balancing binary search tree that is ALSO an order-statistic tree (an AUGMENTED
  ordered map key -> value). A BST order on `_key` x a MAX-HEAP order on a per-node
  random priority `_prio` gives EXPECTED O(log n) height, and a subtree-size column
  `_size` (maintained in the SAME pass as every link rewrite) adds O(log n) order
  statistics + set surgery. Surface: `get` / `has` / `set` (updates the value in place
  on an existing key) / `delete` (idempotent) / `rank(x)` (count of keys STRICTLY less
  than x) / `select(k)` (the k-th smallest key, 0-based) / `successor` (strictly
  greater) / `predecessor` (strictly less) / `rangeIter(lo, hi)` (a VERSION-STAMPED
  iterator over `[lo, hi]` inclusive, ascending; `+-Infinity` bounds allowed,
  structural OR value mutation mid-iteration throws) / `forEach` / `clear` / `split`,
  the static `Treap.merge(a, b)`, and `size` / `capacity` getters. Keys and values are
  finite numbers (typeof-guarded before coercion -- Symbol / BigInt / NaN / +-Infinity
  fail closed with a `[lite-logn]` throw).
- **Pointer-free, zero-GC, second bind of the shared NodePool.** Nodes are slot
  INDICES in six flat columns (`_key` / `_value` Float64; `_left` / `_right` / `_prio`
  / `_size` Uint32, `NIL = 0`) over the SAME private free-list (`NodePool`) SkipList
  ships -- design-parity, not a fork or a runtime dep (decisions/0007-treap.md). The
  conservation invariant `activeSlots + freeListLength === capacity` holds after every
  op. `TR_MAX_CAPACITY = 0x7FFFFFFF` (2^31 - 1: slot indices + subtree counts fit a
  `Uint32`). Rotations rewrite one child link pair + two `_size` cells; `set` / `delete`
  / `split` / `merge` recurse over slot indices on the native CALL STACK (not the GC
  heap), so every hot op is 0 B/op.
- **Priority via the repo LCG.** One instance-local Numerical-Recipes LCG draw per
  inserted node; a fixed seed replays an identical structure, ties break by key, so the
  tree shape is a deterministic function of the (key, priority) set.
- **split / merge are O(log n) EXPECTED (arena-sharing).** `split(key)` returns
  `[left (keys < key), right (keys >= key)]` by rewiring in place, so the two treaps
  SHARE the source's backing arena and the source is CONSUMED (left empty);
  `Treap.merge(a, b)` requires `a` / `b` to share an arena (all keys of a < all of b)
  and consumes both. Fails closed on non-Treap inputs, cross-arena treaps, or an
  overlapping key range.
- **EXPECTED, not worst-case.** A hot op is EXPECTED O(log n) (the randomized
  priority heap); the MAX single insert (rotation chain) is DISCLOSED by the witness,
  never gated -- the same honesty contract as SkipList.
- **Witness: one more log line.** `test/witness.mjs` gains `Treap.get` (a BST descent)
  against a linear-scan O(n) foil. Measured on this machine (shared, FROZEN R^2 floor
  0.958, the four prior members' bands UNTOUCHED): `get` R^2 ~ 0.988, slope ~ 4.03
  ns/level, in its OWN band `[2.55, 5.95]` = median-of-15 fit-runs (median 4.25) x
  `[0.6, 1.4]`, centered on the median (ADR-0004). A treap descent touches one node per
  level, so its per-level slope is lower than SkipList.get's (~8.78) -- expected, which
  is why only the R^2 floor is shared. The linear-scan foil MISSES the floor
  (R^2 ~ 0.79). All EIGHT gated op-rows are ON-LINE; MAX single insert disclosed
  (~54 us on the cold shuffled build trace).
- **Types + docs.** `LogN.d.ts` gains the `Treap` ambient block; `llms.txt` gains the
  Treap roster entry + full export surface; `decisions/0007-treap.md` records D-06/D-07
  (the balanced-BST pick, the augmentation, the NodePool reuse, the arena-sharing
  split/merge, and the recursion-depth disclosure).

### Verified

- Torture: 0 B/op on every Treap hot lane (get / set / delete / rank / select /
  successor / forEach / rangeIter) + the mixed steady-state churn; `gc major = 0`;
  leak `size 0/0`; the private-pool conservation invariant after every soak cycle; a
  32 B/op control lane proving the instrument has teeth. Prior four members still green.
- `test/perf/PerfGate.test.mjs`: four Treap scenarios (get / set / delete / rank-select-
  successor mix) at 0 scavenges, backing buffers fixed (the `grows` counter reads 0).
- `test/Treap.test.mjs`: a >= 1e5 mixed-op differential fuzz vs a Map + sorted-array
  oracle (0 divergences), the three treap invariants checked throughout (BST order,
  heap order, subtree-size correctness), rank/select/split/merge correctness, the
  fail-closed doors ([lite-logn] tag pinned), determinism, and conservation.
- `LogN.js`: the prior four classes are BYTE-IDENTICAL; only the `VERSION` const and
  the appended `Treap` section changed.

## [0.4.0] - 2026-09-17

### Added

- **SkipList** -- the fourth member and the family's FIRST randomized, pointer-based
  member: a pointer-free ordered map (key -> value) whose `get` / `set` / `delete` /
  `successor` / `predecessor` are EXPECTED O(log n) via a probabilistic tower of
  forward links stored as slot INDICES in a SINGLE flat `Uint32Array` of
  `columns * (capacity + 1)` cells (stride-indexed `lvl*(capacity + 1) + slot`,
  `NIL = 0`, slot 0 the head sentinel) over a private free-list (`NodePool`) -- never
  a heap object per op. Surface: `get` / `set` (updates the value in place on an
  existing key) / `delete` (idempotent) / `successor` (strictly greater) /
  `predecessor` (strictly less) / `rangeIter(lo, hi)` (a VERSION-STAMPED iterator
  over `[lo, hi]` inclusive, ascending; `+-Infinity` bounds allowed, mutation
  mid-iteration throws) / `forEach` / `clear`, and `size` / `capacity` getters. Keys
  are finite numbers (typeof-guarded before coercion -- Symbol / BigInt / NaN /
  +-Infinity fail closed with a `[lite-logn]` throw); values are finite numbers.
  Level generation is ONE step of the repo's Numerical-Recipes LCG whose HIGH bits
  draw a geometric height (`1 + clz32(word)`), instance-local seed, deterministic (a
  fixed seed replays an identical structure; the low bits of the LCG are periodic, so
  the high bits are used -- validated by a deterministic chi-square test, df = 15,
  p > 0.001, over ~1e6 levels). `SL_MAX_CAPACITY = 0x03FFFFFF` (2^26 - 1: slot
  indices fit a `Uint32`, `NIL = 0` reserves slot 0, and the column stride stays an
  addressable length). Level columns are sized to `ceil(log2 cap) + 1` up front (NOT
  grown lazily), so `_next` never reallocates -- trivially 0 B/op. `get` / `set` /
  `delete` / `successor` / `predecessor` allocate zero bytes after construction.
  Verified: torture 0 B/op on every hot lane (+ a 32 B/op control lane proving the
  instrument has teeth), the private-pool conservation invariant `activeSlots +
  freeListLength === capacity` after every soak cycle, leak `size 0/0`,
  `gc major = 0`.
- **Witness: two more log lines.** `test/witness.mjs` gains SkipList's `get` and
  `set` entries. Measured on this machine (shared R^2 floor 0.958): `get` R^2 ~
  0.97-0.99, slope ~ 9 ns/level (band `[5.27, 12.30]`, median 8.78 x [0.6, 1.4]),
  gated over `[2^11, 2^17]` for dynamic range; `set` R^2 ~ 0.97-0.99, slope ~ 14
  ns/level (band `[8.36, 19.50]`, median 13.93 x [0.6, 1.4]), gated over the
  cache-resident `[2^9, 2^14]` so the fit sees the structural level count, not DRAM
  latency (each op is measured where its logarithm is visible, not where the cache
  wall is). Both O(n) foils leave the line: the linear-scan search foil (O(n) per
  search) and the sorted-array insert foil (O(n) shift), each below the floor.
  Because the member is EXPECTED (not worst-case) O(log n), the witness ALSO prints
  the MAX single insert over a realistic randomized build trace -- the unlucky-tower
  tail a mean hides.
- **ADR.** [`decisions/0006-skiplist.md`](./decisions/0006-skiplist.md) (D-06):
  binds D-01 to an IN-FILE PRIVATE `NodePool` as DESIGN-PARITY with lite-o1's private
  pools (identical free-list contract + conservation invariant), NOT a runtime dep on
  lite-o1 (rejected: zero-runtime-deps law; SlotPool never shipped); records the PRNG
  choice (NR LCG, high bits for the level), the randomized-honesty note (MAX
  single-op + chi-square df), and the level-column memory decision (size up front,
  never grow lazily, to protect the 0-B/op gate).

### Unchanged

- **BinaryHeap, Fenwick and SegmentTree are byte-identical.** The v0.1.0 / v0.2.0 /
  v0.3.0 member class bodies are untouched; only the file header roster, the
  `VERSION` const, and the appended SkipList block (plus the `_lcgNext` / `NodePool`
  / `_levelCap` helpers) changed in `LogN.js`.

## [0.3.0] - 2026-09-17

### Added

- **SegmentTree** -- the third member: an associative range-query AND a
  point-update, BOTH O(log n), over a SINGLE flat `Float64Array(2 * length)`
  (leaves at `n .. 2n-1`, `_t[0]` unused) via iterative bottom-up walks -- no
  nodes, no pointers, no recursion on the hot path. The fold is chosen ONCE at
  construction (`'min'` / `'max'` / `'sum'` / `'gcd'`) and cached as a small-int
  `_k` combined by an INLINE switch in the hot body (no function ref, no closure,
  no megamorphic call site). Surface: `query(lo, hi)` (INCLUSIVE both ends,
  matching `Fenwick.rangeSum`) / `update(i, value)` (ABSOLUTE leaf set + ancestor
  fix) / `at(i)` (O(1) leaf read), `length` / `kind` getters, `clear`, `forEach`,
  and a static `SegmentTree.build(values, kind)` O(n) bottom-up bulk build (seed
  leaves, then fold each internal node once deepest-first -- not n incremental
  updates). The fold identity fills query accumulators and cleared / fresh leaves
  (`sum -> 0`, `min -> +Infinity`, `max -> -Infinity`, `gcd -> 0`); it is a legal
  RESULT but never a legal INPUT -- the value door rejects user `NaN` /
  `+-Infinity` (and, for the `gcd` kind, negatives + non-integers), typeof-guarded
  before coercion, with a `[lite-logn]` throw. `SEGTREE_MAX = 2^30 - 1` (HALF of
  Fenwick's ceiling: the `2n` layout must keep `2n` a positive int32). `query` /
  `update` / `at` allocate zero bytes after construction. Verified: torture 0 B/op
  on every hot lane (+ a 32 B/op control lane proving the instrument has teeth),
  leak `size 0/0`, `gc major = 0`.
- **Witness: two more straight log lines.** `test/witness.mjs` gains SegmentTree's
  `update` and `query` entries. Measured on this machine (shared R^2 floor 0.958):
  update R^2 ~ 0.99, slope ~ 3.2 ns/level (band `[2.29, 5.35]`, median 3.83 x
  [0.6, 1.4]); query R^2 ~ 0.99, slope ~ 7 ns/level (band `[4.30, 10.04]`,
  median 7.17 x [0.6, 1.4]). The gated sweep is pinned to EXACT powers of two in
  `[2^10, 2^16]` (a segment-tree op touches a node per level spread across the
  `2n` array, so above ~2^16 the tree leaves the steady cache band; exact powers
  keep the range decomposition a regular node count). Both O(n) foils leave the
  line: the whole-tree rebuild (O(n) per update, R^2 ~ 0.85) and the scan-fold
  (O(n) per query, R^2 ~ 0.75), each below the floor.
- **ADR.** [`decisions/0005-segtree.md`](./decisions/0005-segtree.md) (D-05):
  scope is point-update + range-query ONLY (no lazy propagation, no caller-supplied
  fold) for v0.3.0; the fold is injected via a ctor-cached `_k` inline switch, not
  a function ref; and the iterative `2n` layout is order-agnostic, so it is correct
  ONLY for commutative + associative folds -- a future non-commutative fold is
  routed to a pow2 layout instead.

### Unchanged

- **BinaryHeap and Fenwick are byte-identical.** The v0.1.0 and v0.2.0 member class
  bodies are untouched; only the file header roster, the `VERSION` const, and the
  appended SegmentTree block changed in `LogN.js`.

## [0.2.0] - 2026-09-17

### Added

- **Fenwick** (Binary Indexed Tree) -- the second member: BOTH point-update AND
  prefix-sum in O(log n) over a single flat `Float64Array`, via the lowest-set-bit
  walk (`i & -i`). Surface: `update(i, delta)` / `prefix(i)` / `rangeSum(lo, hi)` /
  `at(i)` / `set(i, value)`, a `length` getter, `clear`, `forEach`, and a static
  `Fenwick.build(values)` O(n) LINEAR bulk build (each cell adds itself to its
  parent in one forward pass -- not n incremental updates). Public indices are
  0-based in `[0, length)`; internally 1-based (`_t[0]` the unused identity
  sentinel). `prefix(-1) === 0` is the empty-prefix base case; `rangeSum` and `at`
  are pairs of inlined prefix walks. Values are finite numbers (negatives
  allowed); NaN / +-Infinity / non-number fail closed (typeof-guarded before
  coercion) with a `[lite-logn]` throw. `update` / `prefix` / `rangeSum` / `at` /
  `set` allocate zero bytes after construction. `FENWICK_MAX = 2^31 - 1` (the
  `i & -i` walk relies on signed-int32 two's complement, so indices stay in that
  range). Verified: torture 0 B/op on every hot lane (+ a 32 B/op control lane
  proving the instrument has teeth), leak `size 0/0`, `gc major = 0`.
- **Witness: two straight log lines.** `test/witness.mjs` gains Fenwick's `update`
  and `prefix` entries. Measured on this machine (shared R^2 floor 0.958): update
  R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level (band `[1.84, 4.30]`, median 3.07 x
  [0.6, 1.4]); prefix R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level (band `[1.76, 4.10]`,
  median 2.93 x [0.6, 1.4]). Both O(n) foils leave the line: the prefix-array
  rebuild (O(n) per update) and the naive re-sum (O(n) per query) each fit at
  R^2 ~ 0.76, below the floor.
- **ADR.** [`decisions/0004-witness-band.md`](./decisions/0004-witness-band.md)
  (D-08): the R^2 floor (0.958) is frozen family-wide; each member calibrates its
  OWN per-op slope band = median-of-15 fit-runs x [0.6, 1.4] (the same procedure
  that set BinaryHeap's band). A cheaper op having a lower slope is expected, not
  a regression.

### Unchanged

- **BinaryHeap is byte-identical.** The v0.1.0 member's class body is untouched;
  only the file header roster, the `VERSION` const, and the appended Fenwick block
  changed in `LogN.js`.

## [0.1.0] - 2026-09-17

### Added

- **BinaryHeap** -- the first member: an indexed binary min|max heap (addressable
  priority queue) over three parallel typed arrays (`_key` Float64Array, `_id`
  Uint32Array, `_pos` Int32Array reverse map). Surface: `push` / `pop` / `peek` /
  `topKey` / `keyOf` / `has` / `changeKey` / `remove`, `size` / `capacity` /
  `kind` getters, `clear`, `forEach` / `[Symbol.iterator]` (unspecified order),
  and a static `BinaryHeap.build(kind, ids, keys, capacity)` Floyd O(n) bulk
  build. changeKey / remove address elements by caller-supplied entity id via the
  reverse-index map. push / pop / changeKey / remove are O(log n) with
  hole-punching sift; peek / topKey / keyOf / has are O(1). Fixed-capacity
  fail-closed (overflow, duplicate id, non-member changeKey, out-of-range id, and
  non-finite key all throw `[lite-logn]`; never a silent drop). Zero allocation on
  every hot path.
- **Scaffold release.** Stands up the repo for the O(log n) family, the sibling
  of `@zakkster/lite-o1`. Ships the six `files[]` entries: `LogN.js` (header +
  the `VERSION` const, no member yet), `LogN.d.ts`, `llms.txt`, `README.md`,
  `CHANGELOG.md`, and `LICENSE`. Repo-only (not shipped): `GUIDE.md` and the
  gate harnesses (`test/torture.mjs`, `test/witness.mjs`,
  `test/perf/PerfGate.test.mjs`, `test/QaAudit.test.js`, `test/Bench.test.mjs`).
  With zero members the harnesses run green and empty.
- **The witness harness stub.** The log-linear fit machinery
  (`nsPerOp = intercept + slope*log2(n)`, least-squares `R^2` + slope) and an
  O(n) foil are in place; the `R^2` floor + slope band are deliberately NOT
  gated yet -- they are calibrated in the BinaryHeap session (decision D-02).
- **Design decisions on the record.** [`decisions/0001-nodepool.md`](./decisions/0001-nodepool.md)
  (D-01: reconcile the pointer-free node pool against lite-o1's SlotPool, do not
  fork), [`decisions/0002-spine.md`](./decisions/0002-spine.md) (D-03: the
  ordered-collection spine reach -- offer where honest, force nowhere), and
  [`decisions/0003-pack.md`](./decisions/0003-pack.md) (D-07: `files[]` ships the
  six files only; `test/`, `benchmark/`, `decisions/`, `demo/` are repo-only).

[Unreleased]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.6.0...v0.7.0
[0.4.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PeshoVurtoleta/lite-logn/releases/tag/v0.1.0
