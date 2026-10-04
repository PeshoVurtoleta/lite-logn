# Changelog

All notable changes to `@zakkster/lite-logn` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Test harness: `test/perf/Harness.test.mjs` failed 18 of 44 when the parent environment set
  `FORCE_COLOR` (IDE runners, some terminals). The child shards inherited it, the spec reporter wrapped
  the pass / fail glyphs in ANSI escapes, and the verdict parser read every test as `undefined`. Children
  now run with `NO_COLOR=1` (and no `FORCE_COLOR`), and the parser strips ANSI escapes. Test-only, so no
  module change. Reproduced at 26/44 with `FORCE_COLOR=1`; 44/44 after, with and without it.
- README: the test count read 762; `npm test` runs 765.

## [1.5.1] - 2026-10-04

Docs and demo patch. No runtime behaviour changes: the only `LogN.js` edit is a JSDoc comment, and every
member's code is byte-identical to 1.5.0.

### Changed

- **LinkCutTree `pathAggregate(u, v)` re-root, documented everywhere.** The class doc, `.d.ts`, README API
  table and llms.txt now say the two-argument form RE-ROOTS the tree at `u` (unlike `findRoot` / `connected`
  / one-argument `pathAggregate`, which only splay), that a later `cut` is relative to `u`, and that
  `evert(r)` restores a root. Behaviour unchanged (S3 SETTLED: documented, not restored).

### Fixed

- **LinkCutTree README quick-start threw.** It called `cut(2)` right after `pathAggregate(2, 3)`. The
  two-argument fold everts 2 (F9 / S3), so 2 was the root and `cut(2)` threw "no parent edge". The example
  now shows `findRoot(3) === 2` and restores the root with `evert(0)` before cutting.
- **Demo (repo-only; `demo/` is not in the tarball).** The ROADMAP section 10 audit, DM1-DM7:
  - DM1: the Truth Panel no longer fits a slope / R^2 in the browser. A 4-point sweep timed with the
    coarse browser clock showed negative slopes and R^2 0.12-0.74. It now shows each member's gated
    `npm run witness` slope band from a static `demo/witness-data.mjs`; a test fails if that table drifts
    from `test/witness.mjs`. Live ns/op is whole ns, averaged over >= 2 ms of accumulated steps, so the
    timer quantum no longer shows. The fake "max" value (one 0.1 ms timer tick) is gone.
  - DM2: the demo PRNG returned a uint32, which boxed a HeapNumber on non-inlined calls. It is now
    30-bit. BinaryHeap: 3 -> 0 scavenges per 1M steps; SkipList: 5 -> 0.
  - DM3: the "every frame kernel is 0 B/op" claim now names the documented S7 exception
    (SegmentTree2D.query's return box, 0.65-0.85 B/step in the demo). The 0-B/op gate counts scavenges in a
    child process with a 1 MB semi-space; the old heap-delta-after-GC gate missed short-lived allocation. A
    one-allocation-per-step control fails the new gate (120.6 B/op implied).
  - DM4: no `toFixed` in the rAF loop. Panel text is written only when its integer value changes.
  - DM5: the version-trinity test no longer pins `'1.0.0'`. The page states its scope (16 of the 20
    members; WaveletTree / CartesianTree / LinkCutTree / EulerTourTree are not in it). The GC soak passes
    under its unchanged 64 KB budget (~5 KB projected).
  - DM6: `fillStyle` is set once per color pass, not per rect.
  - DM7: scene 3's empty svg is hidden (`svg[hidden]`), the tabs follow the WAI-ARIA tabs pattern
    (keyboard arrows / Home / End, roving tabindex), and the dead `#profile` import of an uninstalled
    package is removed.

### Testing

- LinkCutTree: new tests pin `cut` after a two-argument `pathAggregate`, the one-argument form keeping the
  root, and the README sequence.
- Demo: `npm run demo` 28/28 (was 27/29).

## [1.5.0] - 2026-10-04

The twentieth member: **EulerTourTree**, the LinkCutTree sibling (decisions/0021 D-LCT6 defers subtree
folds to it). It keeps an UNROOTED forest over a FIXED vertex set under `link` / `cut` and answers
`connected`, whole-COMPONENT folds, and SUBTREE folds in EXPECTED O(log n) with ZERO allocation, via each
tree's Euler tour held in a parent-pointer treap (NON-mutating reads). LCT folds PATHS; ETT folds SUBTREES
and COMPONENTS -- together the dynamic-forest pair. Prior members stay byte-identical.

### Added

- **EulerTourTree** -- the twentieth member and the family's SUBTREE / dynamic-connectivity structure. A
  Henzinger-King Euler-tour tree over a parent-pointer TREAP (seeded instance-local LCG, the Treap one):
  one VERTEX node per vertex (carries the value), two ARC nodes per edge (carry the identity), the tour
  stored as a balanced-BST sequence so `link` splices two tours, `cut` splits a tour at the two arc
  occurrences, and a SUBTREE is one contiguous tour segment (a subtree fold is a RANGE fold). Surface:
  `link(u, v)` / `cut(u, v)` / `setValue(v, x)` / `at(v)` / `connected(u, v)` / `componentAggregate(v)` /
  `componentSize(v)` / `subtreeAggregate(v, p)` / `subtreeSize(v, p)` / `hasEdge(u, v)` / `clear()`, plus
  `capacity` / `kind` / `edges` getters. The fold `kind` (`min` / `max` / `sum` / `gcd`) is frozen at
  construction with per-kind `_pull` stores (no tagged phi) + an always-on vertex-count column (component /
  subtree SIZE for free). Reads are NON-mutating (parent climbs + top-down range folds, no splay), so the
  cost is EXPECTED rather than amortized (as the family already discloses for SkipList / Treap). Edges are
  addressed by endpoints through a private open-addressed arc table (linear probing, BACKWARD-SHIFT delete,
  no tombstones). Split / merge / rank / range-fold are ITERATIVE over preallocated `_stk` scratch (a 2^20
  path does not RangeError). An unset vertex reads the fold IDENTITY (never 0); the sum kind bounds
  `|value| <= MAX_VALUE / (2 * capacity)`. NO path fold and NO evert (LinkCutTree's job); NO forEach /
  iterator. Footprint ~188-236 B/vertex. Witness op = `subtreeAggregate` on the DEFAULT log2(n) axis
  (median-of-9 fit, shared 0.958 R^2 floor; slope band `[55.16, 128.71]` = median-of-15 warm
  post-torture fits 91.936 ns/level x [0.6, 1.4], R^2 0.975-0.993, sweep 2^9..2^17); an O(component)
  adjacency-DFS foil leaves the line (R^2 ~0.78); the MAX single link + cut are DISCLOSED, never gated. Zero allocation on every hot op (the double-returning folds box <= 1 HeapNumber
  per call when not inlined, the documented S7 boundary).
- **`ETT_MAX_CAPACITY`** -- `0x10000000` (2^28), the vertex-count ceiling: the 3V-1 node slots, the
  power-of-two (>= 4V) arc table, and every typed-array length stay < 2^31. A FLOAT-product guard in the
  constructor (never `| 0`) is the real gate.

### Changed

- **LinkCutTree docs point at the shipped sibling.** The "subtree folds deferred to a future EulerTourTree"
  wording (README / llms.txt / GUIDE / decisions/0021 / `LogN.js` JSDoc) now names the shipped member, with
  a two-line "LCT or ETT?" chooser (path fold / evert -> LinkCutTree; subtree or component fold, read-only
  connectivity -> EulerTourTree).

### Fixed

- Witness: SegmentTree.update R^2 flake (median-of-9 fit 0.949, retry 0.944 < 0.958 in the 1.4.1
  release gate; slope 0.739 in band). The update lane's sweep is widened from 2^10..2^16 to
  2^4..2^16, which doubles the log2(n) span on a ~0.7 ns/level line. Measured single-fit R^2 rose
  from 0.890-0.990 to 0.974-0.995, slope 0.62-0.74. The floor, the [0.43, 1.00] band and the foil
  are unchanged. Test-only, so no module change.
- GUIDE: the SegmentTree.update band read `[2.29, 5.35]` (pre-1.4.0); it now reads `[0.43, 1.00]`.
- README D5 table: every row still showed the 1.3.0 all-member bundle (18,603 B gzip) and ratios. It now
  shows the measured 20-member values (all-member 23,948 B; ratios 0.046 MergeSortTree .. 0.134
  EulerTourTree, all < 0.40).
- README: the DEFERRED-map sentence said lanes are "deferred to 1.4.1"; the map has been empty since 1.4.1.

### Testing

- EulerTourTree contract + boundary + fuzz vs a BFS/adjacency oracle (4 kinds x int/frac, >= 80k ops, 0
  mismatches) + an LCT cross-oracle (connected agrees on an 80k link/cut stream) + non-mutating-read
  snapshots + a 2^20 path (no RangeError) + 1e6-op arc-table churn (max probe 18) + `clear()` after
  churn byte-identical to a fresh instance (columns, arc table, pool, PRNG).
- Gates extended to the twentieth member: torture ETT lanes (retention + hot reads + the G9 scavenge
  kinds lanes, all hard GREEN) + the witness `subtreeAggregate` lane + the perf-gate Kinds / noinline `ett`
  group (9 lanes) + benchmark Matrix / Dimensions cells (D7 insertion-order `n/a`, D8 a dynamic-forest
  trace next to LCT). QaAudit is a 20-class surface with the ETT no-path-fold / no-evert assertion.

## [1.4.1] - 2026-10-03

H1 close (ROADMAP 8.5). Empties the 1.4.0 DEFERRED list and closes every remaining H1 finding. The
byte-identical-prior-members invariant is SUSPENDED for the members listed below (LCT unset-vertex
values, PST ctor arity, and the new tagged throws).

### Added

- **Iterator version stamps on `MinMaxHeap`, `BinomialHeap`, `PairingHeap`, `FibonacciHeap`** (S5) --
  each gains a `_version` Smi bumped `(v + 1) | 0` on every mutation; `Symbol.iterator` captures it
  and throws `[lite-logn] <Class> mutated during iteration` on a mismatch (checked on resume, before
  the next node is derived from now-stale links). The Pairing / Fibonacci stackless walkers keep
  their 1.4.0 F2 guarantees (the walk always terminates and never yields a freed id); the stamp adds
  a DETERMINISTIC throw on top. `forEach` documents "no mutation from the callback" (it does not
  version-check). BinaryHeap was already stamped in 1.4.0.

### Changed

- **LinkCutTree unset vertices = the fold identity** (F9 / S2) -- a fresh (and `clear()`-ed) vertex
  now reads the fold identity (`min` +Infinity, `max` -Infinity, `sum` / `gcd` 0), not 0. So `min`
  over values 5 / unset / 7 is 5 (was 0: null is not zero). `at(unset)` returns the identity.
- **LinkCutTree `pathAggregate(u, v)` documents its re-root** (F9 / S3) -- the two-argument form
  everts `u`, leaving the tree ROOTED AT `u` (`findRoot(v) === u` afterwards). This is by design and
  not restored (restoring would cost an access and move the witness slope); now documented and tested.
- **PersistentSegTree constructor arity is 3** (F6) -- the private `_seed` parameter is gone from the
  public signature (the `.d.ts` already declared 3 parameters).
- **New tagged throws** -- the F7 sum bound (SegmentTree2D / PST / LCT) and the F8 arena count bound.

### Fixed

- **F10 Treap / Scapegoat `successor` / `predecessor` / `_ceil`** -- the `best = undefined` phi boxed
  the returned key double even on integer input. Now an integer slot `bs = 0` holds the node index
  and the method returns `bs === 0 ? undefined : K[bs]` (the SplayTree pattern). 0 B/op on integer
  input, <= 1 return box on a fractional / large key; the former DEFERRED cells are now hard GREEN.
- **F16 Treap / Scapegoat `delete`** -- the key double crossed the recursive `_delete` boundary,
  boxing once per call beyond the allowed argument box. The key now rides a `_dkey` Float64Array slot
  and `_delete(t)` reads it inside, so no double flows through a tagged phi.
- **F15 MinMaxHeap `popMin` / `popMax` / `build`** -- these passed the moving key double into the
  non-inlined sift helpers. New slot-form `_siftDownMinAt` / `_siftDownMaxAt` read the key from the
  array slot inside (exactly as BinaryHeap's `_siftDownAt` since 1.4.0); the `ni-minmax` DEFERRED
  cells are now GREEN. **DEFERRED is now EMPTY** in `test/perf/Kinds.mjs` and torture's `G9_DEFERRED`.
- **F6 PersistentSegTree constructor `_seed`** -- the undocumented 4th parameter skipped `build`'s
  validation; `new PersistentSegTree(3, 1, 'gcd', [NaN, 3, 6])` hung inside the constructor (segGcd
  over a NaN leaf). The public constructor now takes only `(length, versionCapacity, kind)`
  (`PersistentSegTree.length === 3`); `build` validates first, then seeds v0 through a module-private
  function. A stray 4th argument is ignored.
- **F7 sum-kind magnitude bound** -- `SegmentTree2D`, `PersistentSegTree` and `LinkCutTree` now bound
  a sum-kind write at the door to `|value| <= MAX_VALUE / (2 * cells)` (cells = `rows*cols` /
  `length` / `capacity`), so a finite input can no longer fold to `Infinity` / `NaN`. The 1e308
  repros throw `[lite-logn]` as a byte-identical no-op; a sweep AT the bound stays finite. NaN-safe
  by construction (`value > bound || value < -bound`). Non-sum kinds are unbounded.
- **F8 `arena(capacity, kind, count)` count bound** -- `BinomialHeap`, `PairingHeap` and
  `FibonacciHeap` now require `count` to be an integer in `[1, capacity]`, throwing a tagged
  `RangeError` BEFORE any allocation. `arena(8, 'min', 1e8)` and `arena(8, 'min', 2**32)` were a V8
  FATAL OOM / "Invalid array length"; both now throw in < 10 ms with no abort.

### Removed

- The undocumented 4th `_seed` parameter of the `PersistentSegTree` constructor (F6). Seeding version 0
  from values goes through `PersistentSegTree.build`, which validates first.

### Testing

- Red-first tests for every finding: Treap/Scapegoat succ/pred/delete (F10/F16) and MinMaxHeap sifts
  (F15) via the now-empty DEFERRED gate; PST arity + gcd-NaN no-hang subprocess (F6); SegmentTree2D /
  PST / LCT sum-bound reject + no-Infinity sweep (F7); arena count reject + subprocess no-abort (F8);
  LCT unset-identity + `pathAggregate` re-root (F9); and a version-stamped iterator mutation test on
  each of the four heaps (S5).

## [1.4.0] - 2026-09-28

H1 hardening, consumer release (ROADMAP 8.4). The byte-identical-prior-members invariant is SUSPENDED
for the members listed below in this release.

### Added

- **`Fenwick.setFrom(src: Float64Array, i)`** and **`SegmentTree.setFrom(src, i)`** -- zero-box
  siblings of `set` / `update` that read the value from a caller-owned `Float64Array` INSIDE the
  method, so a fractional / large value never boxes across a non-inlined call (F11 / S6, the lite-hud
  M5 write path). The plain `set` / `update` remain the documented one-box controls.
- **`Fenwick.search(target) -> index`** and **`Fenwick.searchFrom(src: Float64Array, i) -> index`** --
  the smallest index `i` with `prefix(i) >= target`, an EXACT lower_bound over the library's own
  `prefix()` (the binary-lifting descent sums cells HIGH->LOW, bit-for-bit as `prefix()` does).
  O(log n) ALWAYS -- a zero-run is spanned by O(log n) tree cells, never O(zero-run)/O(n). Returns
  `length` iff `target > total` or `target === +Infinity`; `target <= 0` returns `0`. For exactly-
  representable sums (integers <= 2^53) it matches a BigInt oracle and never returns a zero-weight
  index for `target > 0`; for fractional weights the returned index's prefix is within one ULP of
  `target`. Precondition (documented, not enforced): every element `>= 0`; NaN / non-number throws.
  lite-pick's dynamic-weight sampling op (`search(u)`, `u` uniform in `(0, total]`, picks `i` with
  probability `w_i / total`, up to the rounding of the stored prefix sums). `searchFrom` reads the
  target from a caller-owned `Float64Array` INSIDE (0 B/op, sharing `search`'s body), for lite-pick's
  per-pick call from a non-inlined site where `search`'s one arg box would be 16 B/pick.
- **`WaveletTree.quantileInto(out: Float64Array, j, lo, hi, k)`** -- zero-box sibling of `quantile`
  (writes the k-th value straight into a slot; F11 / S6).
- **`WaveletTree.rebuildFrom(values) -> this`** -- rebuild in place (worst-case buffers allocated once,
  lazily, on the first call; every later rebuild is 0 B/op for any length up to the constructed
  length), producing a structure identical to a fresh
  `new WaveletTree(values)` (F14 / S6). `values.length` must be in `[1, constructed length]` else a
  tagged throw; NaN entries still throw (filtering them is the caller's job).
- **`BinaryHeap` iterator version stamp** (S5) -- the `Symbol.iterator` walk captures a `_version`
  Smi (bumped `(v + 1) | 0` on every mutation) and throws `[lite-logn]` if the heap is mutated
  mid-iteration. `forEach` documents "no mutation from the callback".

### Fixed

- **F1 (Treap `clear()` on a `split()` / `merge()` view)** -- `clear()` reset the SHARED node pool,
  corrupting every sibling view. It now frees only the nodes reachable from its own root (a stackless
  rotate-to-vine teardown), so clearing a view -- or a consumed original -- leaves its siblings intact.
  `clear()` is now O(own nodes) instead of O(capacity). Split views still start from the same
  `_seed`, so their priority streams are identical (disclosed, not changed).
- **F2 (PairingHeap / FibonacciHeap recursion)** -- `clear()`, `forEach` and the iterator recursed on
  child depth and threw an untagged stack RangeError from a few thousand nodes (so `clear()` could
  never recover the heap). All six walkers are now STACKLESS, over the existing links. Mutating the
  heap from a `forEach` callback or mid-iteration is UNSUPPORTED: the walk always terminates and never
  yields a freed or sibling-owned id, but it may throw `[lite-logn]`, or end early / skip / revisit ids.
- **F3 (LinkCutTree `_pull`)** and **F4 (SegmentTree / SegmentTree2D / PersistentSegTree)** -- the
  tagged-phi-into-`segGcd` box per tree level is removed: one loop (or one store) per fold kind, so
  the pure-double sum accumulator is never tainted by `segGcd`'s non-inlined return. A fractional /
  `2^31+` value no longer boxes ~15 HeapNumbers per op. `PersistentSegTree._query` is now ITERATIVE
  (a manual stack + per-kind double accumulator), closing the recursive double-return box (F10).
- **F10 (WaveletTree popcount)** -- `wtPopcount32(word | 0)` at all three call sites keeps a `>= 2^31`
  Uint32 word a Smi argument, so `rank` / `quantile` no longer box on integer input when not inlined.
- **F15 (BinaryHeap `pop` / `remove`)** -- the sift helper is passed the SLOT (the moving key/id are
  read inside), so no key double crosses the non-inlined helper boundary.

### Changed

- **S1 sum overflow, bounded at the door.** `Fenwick` / `Fenwick2D` carry a magnitude budget: a scalar
  upper bound on `sum |element|` (`update` adds `|delta|`, `set` / `setFrom` add `|new - old|`, `build`
  sets `sum |v|`, `clear` resets), budget `MAX_VALUE / 2` (1D) / `MAX_VALUE / 4` (2D). A would-be
  overflow takes an O(n) cold exact recompute that resets the drifted bound and either accepts or
  throws `[lite-logn]` with the state unchanged. Near a true magnitude of ~1e308 the cold path can
  repeat under churn (disclosed). `SegmentTree` sum kind bounds `|value| <= MAX_VALUE / (2 * length)` at
  `update` / `build` / `setFrom`. So a finite input can no longer produce a sticky NaN.
- **S4** -- `WaveletTree` build normalizes `-0` to `+0` (cold), so the distinct table never carries a
  signed zero.
- **`WaveletTree` is now rebuildable in place** via `rebuildFrom`; the worst-case rebuild buffers +
  build scratch (~32 B per constructed element) are allocated LAZILY on the FIRST `rebuildFrom` (a
  one-time cost, disclosed with the byte formula), and every later rebuild is 0 B/op. A never-rebuilt
  instance keeps the 1.3.0 footprint.

### Testing

- New repo-only gates (not in the tarball): `test:perf:kinds` / `test:perf:noinline` (scavenge-count
  lanes over int / fractional / 2^31+ / 2^53 inputs, normal and `--max-inlined-bytecode-size=0`,
  with the S7k boundary-box budget and one-box teeth), `test:perf:harness` (self-tests of that gate),
  `test:perf:reddiff`, and a G9 scavenge gate in `torture`. The perf gate's teeth are now exactly one
  HeapNumber per op. Three witness bands were re-centered after the box fixes made their ops cheaper
  (decisions/0004).

### Deferred to 1.4.1

Tracked in the gate's shrink-only DEFERRED list (ROADMAP 8.4): F6 (PersistentSegTree ctor seed), F7
(LinkCutTree / SegmentTree2D / PersistentSegTree sum bounds), F8 (`arena` count cap), F9 (LinkCutTree
unset-vertex identity + `pathAggregate(u, v)` re-root docs), F10 (Treap / Scapegoat successor /
predecessor boxes), F15 (MinMaxHeap sift), F16 (Treap / Scapegoat delete), S5 stamps on the other
four heaps, and the full README doc sweep (F13).

## [1.3.0] - 2026-09-24

### Added

- **LinkCutTree** -- the nineteenth member and the family's FIRST dynamic-topology structure: a
  Sleator-Tarjan link-cut tree maintaining a FOREST of rooted trees under `link` / `cut` and answering
  PATH aggregates in AMORTIZED O(log n), zero-allocation. The forest is a preferred-path decomposition --
  each preferred path is a splay tree keyed by depth, path-parent pointers stitch the paths -- over eight
  flat columns (`_val` / `_agg` Float64, `_l` / `_r` / `_p` Uint32 with NIL = 0, `_rev` Uint8 lazy-reversal
  flag, `_stk` preallocated splay scratch). The splay / access / push-down are ITERATIVE (never recursion,
  which a degenerate O(n)-deep path would overflow). Surface: `link(child, parent)`, `cut(node)`,
  `evert(u)` (makeRoot), `findRoot(u)`, `connected(u, v)` (`findRoot(u) === findRoot(v)`),
  `pathAggregate(u)` (root -> `u`) and `pathAggregate(u, v)` (the `u..v` path, INCLUSIVE), `setValue(id,
  value)` (absolute), `at(id)` (O(1), non-mutating), and `clear()` (reset the forest to isolated
  singletons in place, O(n), zero-alloc, reusable). Getters: `capacity`, `kind`, `edges`. See
  `decisions/0021-linkcuttree.md`.
- **Full LCT with evert; commutative folds make reversal AGGREGATE-INVARIANT (D-LCT).** `evert(u)`
  re-roots the tree at `u`, which is what enables the two-endpoint `pathAggregate(u, v)`. Because the four
  folds -- `min` | `max` | `sum` | `gcd`, frozen at construction as a small-int read by an inline switch in
  `_pull` -- are all COMMUTATIVE, a path fold does not depend on direction, so `evert` only swaps children
  and flips a lazy `_rev` bit; there is NO mirror-order aggregate to maintain. `gcd` rejects negative /
  non-integer values at the `setValue` door.
- **pathAggregate on the DEFAULT log2(n) witness axis, AMORTIZED, max single-op DISCLOSED not gated.** Each
  `pathAggregate` is an amortized access + splay -- a single log descent -- so it fits
  `nsPerOp = intercept + slope*log2(n)`. The gated witness op is `pathAggregate`; because the member is
  amortized (a single access can splay a long preferred path), the max single-op is DISCLOSED as a
  co-headline and NEVER gated (the SplayTree / PairingHeap / FibonacciHeap contract). Its O(depth) naive
  parent-walk foil goes O(n) on a deep chain and leaves the line. Shared R^2 floor 0.958 UNTOUCHED; the
  lane opts into the median-of-7-fits hook for post-torture thermal robustness.
- **FIXED vertex set, NO allocator; fail closed.** The vertices are fixed at construction (`capacity` of
  them); `link` / `cut` / `evert` flip EDGES only, so there is NO per-op allocation, NO free-list, and NO
  bump allocator -- the buffers are sized once and reset in place by `clear()`. `capacity` is an integer in
  `[1, LCT_MAX_CAPACITY]` (`0x7FFFFFFF`, 2^31-1); every vertex id is typeof-guarded (Symbol / BigInt-safe)
  BEFORE any splay (the mutating-read fail-OPEN lesson from SplayTree). `link` throws `[lite-logn]` as a
  no-op on a self-link or a CYCLE-creating link; `cut` throws on cutting a tree root (no parent edge); a
  two-endpoint `pathAggregate` across different trees throws (no path -- checked before any evert
  half-mutates); `setValue` throws on a non-finite value.
- **Path-only; subtree aggregates deferred to a future EulerTourTree.** LinkCutTree answers PATH folds
  under link / cut; subtree aggregates and unrooted dynamic connectivity with subtree folds are
  deliberately the job of a planned EulerTourTree sibling (the documented boundary).

## [1.2.0] - 2026-09-24

### Added

- **CartesianTree** -- the eighteenth member and the family's range-MINIMUM tree: a STATIC, IMMUTABLE
  heap-ordered Cartesian tree for offline range-minimum / range-maximum (RMQ) over a fixed sequence of
  finite numbers. A single monotonic-stack pass builds the tree in O(n) (the right spine on the stack;
  the STRICT pop rule keeps the EARLIER index as ancestor, so ties resolve to the FIRST occurrence),
  an iterative preorder DFS fills each node's depth, and a binary-lifting ancestor table
  `up[i][k] = 2^k-th ancestor` is built column by column in O(n log n) over a flat
  `n * (ceil(log2 n) + 1)` `Int32Array`. Surface: `rangeMinIndex(lo, hi)` (the INDEX of the extreme in
  the INDEX range `[lo, hi]` INCLUSIVE, via a binary-lifting LCA climb -- the RMQ = LCA bridge),
  `rangeMin(lo, hi)` (its value), `at(i)`, `parent(i)` / `left(i)` / `right(i)` (topology you can walk;
  `-1` when none), `depth(i)`. Getters: `root`, `length` / `size`, `kind` (`'min'` | `'max'`, frozen at
  build), and the static `CartesianTree.build(values, kind)`. See `decisions/0020-cartesiantree.md`.
- **Binary-lifting LCA on the DEFAULT log2(n) witness axis (D-CT).** Every `rangeMinIndex` is a single
  O(log n) LCA climb (depth-equalize, then co-lift in lock-step) reading `_depth` / `_up` into local
  scalars only -- `kind` is baked into the tree, so there is no per-op value compare -- so it fits
  `nsPerOp = intercept + slope*log2(n)`, the single-log axis. The gated witness op is `rangeMinIndex`
  (WORST-CASE O(log n), no RNG on the hot path), calibrated to the band `[1.55, 3.62]` ns/level
  (median-of-15 fit-runs x `[0.6, 1.4]`); its O(n) linear extreme-scan foil leaves the line. Because
  the climb reads scattered ancestor cells, this lane opts into the MEDIAN of 7 independent sweep-fits
  as measurement-quality insurance (the frozen 0.958 R^2 floor + slope band are UNTOUCHED).
- **STATIC / IMMUTABLE + copy-in, fail closed.** The source is COPIED in at construction (mutating the
  caller's array afterward changes nothing) and there are NO mutators. The source must be an array-like
  of FINITE numbers (typeof-guarded FIRST; Symbol / BigInt / NaN / +-Infinity fail closed), the length
  an integer in `[1, CT_MAX_LENGTH]` (`0x7FFFFFFF`, 2^31-1), `kind` exactly `'min'` or `'max'`, and the
  `n * L` lift-cell product is guarded by a FLOAT multiply against `CT_MAX_CELLS` (`0x7FFFFFFF`) --
  never `| 0`, which would wrap a large product and fail OPEN. Query bounds need `0 <= lo <= hi < length`.
- **Honest redundancy with lite-o1's SparseTable, disclosed.** CartesianTree pays an O(log n) query at
  the SAME O(n log n) space where lite-o1's `SparseTable` answers RMQ in O(1). The overlap is
  deliberate: the O(log n) cost buys the MATERIALIZED, walkable tree (`parent` / `left` / `right` /
  `depth` / `root`) and the RMQ = LCA teaching bridge (the Treap is the randomized Cartesian tree; this
  is the deterministic value-keyed one). The O(n) tree build + O(n log n) lift table and space are a
  DISCLOSED co-headline, never hidden behind the fast query.

## [1.1.1] - 2026-09-23

### Fixed

- **`llms.txt` now documents WaveletTree.** The 1.1.0 `llms.txt` was version-stamped 1.1.0 but its
  "What it is" roster and "Exports" section stopped at MergeSortTree -- the WaveletTree entries were
  never appended, so the published 1.1.0 tarball's `llms.txt` (a `files[]` member) omitted the
  seventeenth member. Added WaveletTree to the roster summary, a full "What it is" entry, and the
  per-class "Exports" block (`access` / `rank` / `select` / `quantile` / `rangeCount` + getters), and
  corrected the two remaining "a future WaveletTree" references (now shipped in v1.1.0). No code change:
  `README.md`, `CHANGELOG.md`, and `LogN.d.ts` already documented WaveletTree at 1.1.0, and `LogN.js` is
  byte-identical to 1.1.0 apart from the `VERSION` constant.

## [1.1.0] - 2026-09-23

### Added

- **WaveletTree** -- the seventeenth member and the family's FIRST post-1.0 exotic: a STATIC,
  IMMUTABLE WAVELET MATRIX for offline access / rank / select / quantile / rangeCount over a fixed
  sequence of finite numbers. It COORDINATE-COMPRESSES arbitrary finite numbers to distinct ranks at
  build (the MergeSortTree input contract) and stores the level-wise flat bitvectors plus a per-level
  zero-count and a succinct O(1)-rank block index. Surface: `access(i)` (the value at index i),
  `rank(value, i)` (occurrences of `value` in the prefix `[0, i)`), `select(value, k)` (the index of the
  k-th occurrence of `value`), `quantile(lo, hi, k)` (the k-th smallest value in the INDEX range
  `[lo, hi]` INCLUSIVE -- the order-statistic headline MergeSortTree deferred here), and
  `rangeCount(lo, hi, vlo, vhi)` (count of values in the value-window over an index range) in O(log n)
  -- an improvement on MergeSortTree's O(log^2 n) rangeCount. Getters: `length` / `size` / `levels` /
  `distinct` / `bits`, and the static `WaveletTree.build(values)`. See `decisions/0019-wavelettree.md`.
- **Wavelet matrix on the DEFAULT log2(n) witness axis (D-WT).** Unlike MergeSortTree (squared-log),
  every WaveletTree query descends `levels = ceil(log2 distinct)` levels with O(1) succinct-rank work per
  level, so it fits `nsPerOp = intercept + slope*log2(n)` -- the single-log axis. The gated witness op is
  `quantile` (WORST-CASE O(log sigma), no RNG on the hot path); its O(n log n) linear-kth foil
  (copy the window, sort, index k) leaves the line.
- **STATIC / IMMUTABLE + coordinate-compression, fail closed.** The source is COPIED in at construction
  (mutating the caller's array afterward changes nothing) and there are NO mutators. The source must be an
  array-like of FINITE numbers (typeof-guarded FIRST; Symbol / BigInt / NaN / +-Infinity fail closed),
  the length an integer in `[1, WT_MAX_LENGTH]` (`0x7FFFFFFF`, 2^31-1), and the `levels * wordsPerLevel`
  word product is guarded by a FLOAT multiply against `WT_MAX_CELLS` (`0x7FFFFFFF`) -- never `| 0`, which
  would wrap a large product and fail OPEN.
- **Space a DISCLOSED co-headline.** `n * ceil(log2 distinct)` bits for the level-packed bitvectors, plus
  the succinct block-popcount rank index and the coordinate-remap table; disclosed via `bits`, never
  hidden behind the fast query.

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
