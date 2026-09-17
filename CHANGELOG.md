# Changelog

All notable changes to `@zakkster/lite-logn` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/PeshoVurtoleta/lite-logn/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/PeshoVurtoleta/lite-logn/releases/tag/v0.1.0
