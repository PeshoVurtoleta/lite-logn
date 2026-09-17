# Changelog

All notable changes to `@zakkster/lite-logn` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PeshoVurtoleta/lite-logn/releases/tag/v0.1.0
