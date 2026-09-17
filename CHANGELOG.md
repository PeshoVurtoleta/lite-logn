# Changelog

All notable changes to `@zakkster/lite-logn` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PeshoVurtoleta/lite-logn/releases/tag/v0.1.0
