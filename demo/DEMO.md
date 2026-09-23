# lite-logn demo -- blueprint (DEMO.md)

Repo-only dev artifact (NEVER in package.json `files[]`). The demo demonstrates all
SIXTEEN shipped members of `../LogN.js` (v1.0.0) across four thematic scenes, refactored
onto the proven 4-file architecture of the lite-o1 demo. `LogN.js` stays BYTE-IDENTICAL:
the demo READS the shipped classes, never modifies or re-implements them.

## Section 0 -- the non-negotiables

1. **The demo of zero-GC must ITSELF be zero-GC.** Every hot frame kernel (`stepXWorld`,
   `snapshotX`, the rAF draw) allocates ZERO bytes after warmup. The ONLY code allowed to
   allocate on a frame is a scene's NAIVE FOIL, and it does so ON PURPOSE (that is the point
   being made). All allocation lives in `createXWorld()` warmup factories.
2. **Faithfulness: drive the REAL shipped classes.** `kernels.mjs` imports the members from
   `../LogN.js` and the demo's visualization STATE *is* those class instances. The demo can
   never drift from the library because `Demo.test.mjs` cross-checks every kernel against an
   independent oracle.
3. **Hot-path law (demo-audit skill) -- the frame killer the torture harness cannot see.**
   No forced synchronous reflow: within one synchronous block ALL layout READS
   (`offsetWidth`/`getBoundingClientRect`/`getComputedStyle`/`getBBox`/...) come BEFORE any
   layout WRITE (`style.*`/`className`/`classList`/`setAttribute`/`textContent`/
   `appendChild`/...); cross a rAF boundary to interleave. In frame loops: no
   literals/closures/`.map`/`.filter`/`.slice`/template-strings/spread; no
   `toFixed`/`toLocaleString` except throttled to ~10Hz via a frame-counter mask; cache every
   `getElementById`/`querySelector` at module init in a `$`-prefixed const; pre-allocated
   typed-array ring buffers with a power-of-2 bitmask index.
4. **Throw prefix `[lite-logn-demo]`** (tool-scoped) -- NEVER `[lite-logn]`, which belongs to
   the shipped `LogN.js` alone.
5. **ASCII-only** source (only U+00D7 x and U+00B5 micro excepted). Zero runtime deps;
   node:test only.
6. `demo/` is repo-only. `git diff --stat LogN.js` MUST be empty after this work.

## Architecture -- the 4 files (mirror lite-o1/demo)

- **`kernels.mjs`** -- pure zero-alloc-after-warmup world factories + per-op step kernels that
  wrap the REAL shipped classes; re-exports `VERSION` from `../LogN.js`. Imported by BOTH
  `index.html` (the rAF loop) and `Demo.test.mjs` (the honesty gate), so the demo can never
  drift. Per member: `createXWorld(...)` (warmup: allocates the real class + flat typed
  scratch), `stepXWorld(world, ...)` (advance ONE op, 0 B/op, drives real methods),
  `snapshotX(world, out)` (the ONLY place a shipped class `_field` is read, into caller-owned
  typed arrays). Per scene: one naive foil fn (the only allocator). Deterministic PRNG:
  `makeRng(seed)` -> `Uint32Array(1)` state cell + `nextU32(state)`/`nextKey(state,range)`
  read-and-advance-in-place (no closure, no boxed HeapNumber).
- **`index.html`** -- the browser rAF loop + tabbed scenes (a tab `<button data-tab>` + a
  `<section class="scene" data-scene>` per scene). Canvas for dense animated worlds, SVG where
  discrete structure carries the point. A per-scene zero-GC Truth Panel (live ns/op, fitted
  slope + R^2 with the axis named, 0 B/op, foil ns/op, and a max-single-op row only for the
  EXPECTED/AMORTIZED members). `#profile` hash flag gates `@zakkster/lite-layout-profiler`
  (dev-only, never a dependency, never in `files[]`).
- **`Demo.test.mjs`** -- the node:test HONESTY GATE: (a) FAITHFULNESS (16 oracle suites),
  (b) VERSION-TRINITY (`kernels.VERSION === LogN.VERSION === package.json.version === '1.0.0'`),
  (c) 0-B/op on every hot kernel (foils excluded + asserted to be the only allocators),
  (d) LAYOUT-DRIFT guard pinning the exact internal `_field` names each snapshot reads, so a
  future `LogN.js` rename fails loudly. Behind an entry-point guard, an opt-in headless
  per-member ns/op table using `fitLogLinear` from `../test/witness.mjs` (the SHIPPED fit fn --
  headline numbers come off shipped kernels, never a demo re-implementation).
- **`serve.mjs`** -- the tiny static server, mirroring lite-o1/demo/serve.mjs: `node:http` +
  `node:fs` only, web root = repo root (so `../LogN.js` + `./kernels.mjs` resolve), `/` -> 302
  to `/demo/index.html`, `safePath` traversal guard fails CLOSED (null -> 404), a distinct
  DEFAULT_PORT for lite-logn. `[lite-logn-demo]` prefix.

RETIRE `demo/Visualize.mjs`, `demo/renderers.mjs`, `demo/visuals.html`. Carry forward from
the current demo: the `snapshot()` internal-array introspection pattern (every internal read
confined to ONE function), the layout-drift field-name guard, and the headless ns/op table.

## Members: honesty per member (what is faithful to SHOW)

- **Worst-case (straight log line, NO max-single-op spike):** BinaryHeap, MinMaxHeap,
  BinomialHeap (popMin), Fenwick, SegmentTree, Fenwick2D, SegmentTree2D, Scapegoat.get,
  SortedArray.get, PersistentSegTree, MergeSortTree.
- **EXPECTED/AMORTIZED (average log line PLUS a DISCLOSED max single op):** SkipList, Treap,
  SplayTree, PairingHeap, FibonacciHeap.
- **SQUARED-log axis (`nsPerOp = intercept + slope*(log2 n)^2`):** Fenwick2D, SegmentTree2D,
  MergeSortTree. All others are on the default `log2(n)` axis. The Truth Panel NAMES the axis
  so the squared axis is never smuggled.
- **No iterator:** PersistentSegTree is a persistent DAG (draw the version DAG / path-copy, not
  a live timeline). **Static/immutable:** MergeSortTree builds once (cold) then answers
  range-rank queries (hot).

## Scene 01 "Priority Queues" -- an event-driven scheduler

World metaphor: jobs on a timeline, one dot per live job, key = due time.
Headline foil: `foilLinearScanPQ(arr, len)` -- an unsorted plain-Array job list rescanned for
the min on every pop (O(n) per extraction, O(n^2) drain). The ONE allocator: it push/re-slices
a fresh array each frame -- `// FOIL: allocates ON PURPOSE -- this is the point`.

- **BinaryHeap** (worst-case): steady `push(id,key)`/`pop()` at a target live count, a
  `changeKey(id,newKey)` reprioritize burst, an occasional `remove(id)` so `_pos` visibly
  moves. Canvas array-as-tree (slot i -> level `31-Math.clz32(i+1)`), sift path highlighted.
- **MinMaxHeap** (worst-case): alternate `popMin()`/`popMax()` so BOTH ends drain. Canvas,
  min-levels/max-levels tinted differently.
- **BinomialHeap** (worst-case popMin): `push` then `popMin()`; every ~N frames build a second
  heap via `BinomialHeap.arena(...)` and `meld(other)` to show root-list carry-merge. SVG
  (discrete root list of orders 0..k; a `_consumed` heap drawn greyed = fail-closed).
- **PairingHeap** (AMORTIZED, disclosed max): `push`/`decreaseKey(id,newKey)`/`popMin()`; the
  two-pass merge after popMin is the spike. SVG child/sibling tree, spike frames flashed +
  recorded in a max-tracker world field.
- **FibonacciHeap** (AMORTIZED, disclosed max): `push`/`decreaseKey` (cascading cut, `_mark`
  bits drawn)/`popMin()` (consolidate over `_bucket`). SVG circular root ring + marked badges.

Truth Panel: per-member ns/op, slope + R^2 on log2(n), 0 B/op, a "max single op" row ONLY for
Pairing/Fibonacci, foil ns/op beside it.
Snapshot pins: BinaryHeap `_key _id _pos _n _cap _min`; MinMaxHeap `_key _id _n _cap`;
BinomialHeap `_key _id _parent _child _sibling _order _head _min _n _isMin _kind _consumed _cap`;
PairingHeap `_key _id _child _sibling _parent _pos _owner _alias _cap`;
FibonacciHeap `_key _id _left _right _child _parent _degree _mark _pos _owner _bucket _min _n _hid _consumed`.
Oracles: drain the heap, assert popped keys non-decreasing AND equal to a JS-array sort of
pushed keys; `keyOf`/`has` vs a Map shadow; MinMaxHeap checked from both ends; meld = multiset
union. (Coder: VERIFY every pinned field against LogN.js before use.)

## Scene 02 "Ordered Maps" -- a live sorted leaderboard / order-statistics board

Headline foil: `foilSortedArrayInsertScan(arr, key)` -- O(n) memmove insert + linear key scan
(mirrors `test/witness.mjs` sorted-array insert). Allocates its backing array + a fresh result
each frame, the only allocator.

- **SkipList** (EXPECTED, disclosed max): `set(key,value)`/`get(key)`/`delete(key)`/
  `successor(key)`. SVG tower columns (link index `level*_stride + slot`, `_stride === _cap+1`);
  the `_update` scratch path highlighted as the descent.
- **Treap** (EXPECTED, disclosed max): `set`/`get`/`delete` + `rank(x)`/`select(k)` driving a
  live percentile marker; every ~N frames `split(key)` then `Treap.merge(a,b)`. SVG, node radius
  from `_prio`.
- **Scapegoat** (`get` WORST-CASE straight log, no spike; `set`/`delete` amortized + labelled):
  steady `set`/`delete` until a rebuild fires (`_maxCount` vs `_alpha`); rebuild frame flagged
  in the panel, NOT in the get line. SVG.
- **SplayTree** (AMORTIZED, disclosed max): a skewed 80/20 hot-key `get` pattern so the hot key
  visibly migrates to `_root`. SVG, `_hl`/`_hr` splay hands drawn the frame after a splay.
- **SortedArray** (`get` WORST-CASE straight log; `set`/`delete` O(n) DISCLOSED as the honest
  cost): `get`/`rank`/`select`/`keyAt`. Canvas dense band of `_size` cells (SVG would die),
  binary-search probe sequence overlaid.

Truth Panel: per-member get ns/op + slope/R^2, an expected-vs-worst-case badge per row, foil
line, 0 B/op.
Snapshot pins: SkipList `_key _val _next _update _level _maxLevel _size _stride _cap _version`;
Treap `_key _value _left _right _prio _size _root _sr _version`;
Scapegoat `_key _value _left _right _size _root _maxCount _alpha _invAlpha _flat _stack _version`;
SplayTree `_key _value _left _right _root _n _hl _hr _version`;
SortedArray `_key _value _size _cap _version`; shared NodePool `_free _freeLen _active _cap`.
Oracle: ONE shared ascending JS-array shadow map -- after each scripted op sequence assert `get`
equals shadow, `forEach` yields ascending keys equal to shadow, `rank`/`select` equal shadow
indexOf/index, `successor`/`predecessor` equal shadow neighbours. `rangeIter`/`forEach` are
COLD-path only, NEVER called inside a step kernel.

## Scene 03 "Range & Prefix" -- a 1D sensor strip above a 2D heat grid

Foils: `foilPrefixRebuild(...)` (1D O(n) rebuild per write) and `foilGridRebuild(...)` (2D
O(n^2) per write); both allocate a fresh array/grid each frame, the only allocators.

- **Fenwick** (worst-case): `update(i,delta)` on a moving index + `prefix(i)`/`rangeSum(lo,hi)`
  for a shaded window. Canvas strip, the `i & -i` climb over `_t` lit up.
- **SegmentTree** (worst-case): `update(i,value)` + `query(lo,hi)` sliding window; `_k` fold
  cycled min/max/sum/gcd on a slow timer. Canvas, fold identity `_idv` shown.
- **Fenwick2D** (SQUARED-log axis): `update(r,c,delta)` from a moving hotspot + `rectSum(...)`
  for a dragged rectangle. Canvas heat grid (too many nodes for SVG).
- **SegmentTree2D** (SQUARED-log axis): `update(r,c,value)` + `query(...)` over the same
  rectangle with a min/max fold, overlaid so the two 2D members race side by side. Canvas.

Truth Panel: TWO fit rows -- 1D on log2(n), 2D on (log2 n)^2, axis label explicit; all four
worst-case so NO max row; foil ns/op; 0 B/op.
Snapshot pins: Fenwick `_t _n`; SegmentTree `_t _n _k _idv`; Fenwick2D `_t _r _c _w`;
SegmentTree2D `_t _r _c _w _k _idv`.
Oracles: naive prefix/rect sums + naive fold scans over an independent plain array/grid, exact
(sum) or 0-ULP (min/max/gcd); `at(i)`/`at(r,c)` cross-checked after every scripted update.

## Scene 04 "Time-Travel & Offline" -- a version DAG + an offline-rank histogram

Foils: `foilCopyOnWriteSnapshot(...)` -- a full O(n) array clone per version (the naive history,
also the memory story: clones grow linearly, the DAG does not); `foilBruteRangeCount(...)` --
an O(n) scan per range-rank query. Both allocate per frame, the only allocators.

- **PersistentSegTree** (worst-case query, single log2(n) axis): `update(fromVersion,i,value)`
  to mint versions, then `query(version,lo,hi)`/`at(version,i)` against a randomly chosen OLD
  version each frame (history provably live). NO `forEach`/iterator exists -- draw the version
  DAG itself: `_roots[v]` as version nodes, the path-copy chain (slots newer than the previous
  `_next` watermark) highlighted as the O(log n) freshly-copied spine vs shared subtrees. SVG.
- **MergeSortTree** (STATIC/immutable, SQUARED-log axis): `MergeSortTree.build(values)` once in
  `createWorld` (build is COLD, may allocate), then per frame `countLE(lo,hi,x)` and
  `rangeCount(lo,hi,vlo,vhi)` with a dragging window + threshold. Canvas for the `_t` level
  bands + the result histogram. Panel: "build O(n log n) once; query is the measured line".

Truth Panel: PST on log2(n), MST on (log2 n)^2 with the axis named; both worst-case so NO max
row; version count + node budget shown as the space co-headline; foil clone bytes counted.
Snapshot pins: PersistentSegTree `_val _left _right _roots _next _vcount _vcap _budget _n _k _idv`;
MergeSortTree `_t _n _h _m _cells`. (Coder: VERIFY these against LogN.js -- the field names for
PST's arena/version arrays and MST's run table MUST be confirmed, not assumed.)
Oracles: PST -- keep a JS array per minted version (test-only), assert `query`/`at` on every
historical version equal the naive fold of that array, and older versions UNCHANGED after later
updates. MST -- brute-force `countLE`/`rangeCount` over a plain slice, exact integer equality
over randomized (lo,hi,x) triples; plus mutate-the-caller-array-after-build proving copy-in.

## Tasks (0 done by coordinator; coder owns 1-20)

0. **`demo/DEMO.md`** -- this blueprint (DONE, coordinator).
1. `kernels.mjs:header+VERSION` -- re-export `VERSION` from `../LogN.js`; header states it is
   imported by BOTH index.html and Demo.test.mjs; `[lite-logn-demo]` prefix; import nothing
   else at module scope.
2. `kernels.mjs:rng` -- `makeRng(seed)` -> `Uint32Array(1)` + `nextU32`/`nextKey`
   read-and-advance-in-place.
3. `kernels.mjs:scene01` -- 5 create/step pairs (BinaryHeap, MinMaxHeap, BinomialHeap,
   PairingHeap, FibonacciHeap) + `foilLinearScanPQ`; amortized members record `maxNs`.
4. `kernels.mjs:scene02` -- 5 create/step pairs (SkipList, Treap, Scapegoat, SplayTree,
   SortedArray) + `foilSortedArrayInsertScan`; `rangeIter`/`forEach` excluded from every step.
5. `kernels.mjs:scene03` -- 4 create/step pairs (Fenwick, SegmentTree, Fenwick2D,
   SegmentTree2D) + `foilPrefixRebuild` + `foilGridRebuild`.
6. `kernels.mjs:scene04` -- 2 create/step pairs (PersistentSegTree version-DAG walk with random
   old-version query; MergeSortTree build-once + countLE/rangeCount) + `foilCopyOnWriteSnapshot`
   + `foilBruteRangeCount`.
7. `kernels.mjs:snapshot` -- exactly 16 `snapshotX(world, out)` writing into caller-owned typed
   arrays; the ONLY place any `_field` of a shipped class is read.
8. `index.html:shell` -- 4 tab buttons + 4 `<section class="scene" data-scene>`; ASCII copy;
   single rAF driver switching on the active scene.
9. `index.html:dom` -- every handle cached at module init in a `$`-prefixed const; strict
   read-phase/write-phase split per frame; no interleaving without a rAF boundary.
10. `index.html:rings` -- pow2-length Float64Array ring buffers (mask index) for ns/op history;
    a `frameMask` counter gating all `toFixed`/text writes to ~10Hz.
11. `index.html:truth` -- per-scene Truth Panel: ns/op, slope + R^2 (axis label log2(n) or
    (log2 n)^2), bytes/op 0, foil ns/op, a max-single-op row ONLY for
    SkipList/Treap/SplayTree/PairingHeap/FibonacciHeap.
12. `index.html:render` -- Canvas for BinaryHeap/MinMaxHeap/SortedArray/Fenwick/SegmentTree/
    Fenwick2D/SegmentTree2D/MergeSortTree; SVG for BinomialHeap/PairingHeap/FibonacciHeap/
    SkipList/Treap/Scapegoat/SplayTree/PersistentSegTree.
13. `index.html:profile` -- `#profile` hash flag dynamically importing
    `@zakkster/lite-layout-profiler` (dev-only, never a dependency, never in files[]).
14. `Demo.test.mjs:faithfulness` -- the 16 per-member oracle suites above.
15. `Demo.test.mjs:trinity` -- `kernels.VERSION === LogN.VERSION === package.json === '1.0.0'`.
16. `Demo.test.mjs:alloc` -- 0-B/op over every `stepXWorld` and every `snapshotX`; foils
    explicitly excluded AND asserted to be the only allocators.
17. `Demo.test.mjs:pins` -- the layout-drift guard asserting each pinned `_field` exists and has
    the expected constructor (Float64Array/Uint32Array/Int32Array/Uint8Array/number/boolean).
18. `Demo.test.mjs:headless` -- opt-in per-member ns/op table using `fitLogLinear` from
    `../test/witness.mjs` behind an `import.meta.url` main guard; squared axis via
    `Math.log2(n)**2` for Fenwick2D/SegmentTree2D/MergeSortTree.
19. `serve.mjs` -- static server mirroring lite-o1's (~112 lines), a distinct DEFAULT_PORT,
    `[lite-logn-demo]` prefix.
20. cleanup -- delete `Visualize.mjs`/`renderers.mjs`/`visuals.html`; confirm `demo`/`demo:serve`
    scripts (already present); confirm `npm pack` file count UNCHANGED and `git diff --stat
    LogN.js` empty.

## Assertions (falsifiable; qa proves each has TEETH)

1. Every one of the 16 `stepXWorld` and 16 `snapshotX` measures exactly 0 B/op over 1e5 iters
   after 1e4 warmup (`--expose-gc`, heapUsed delta / ops rounded to 0); each of the 6 foils
   measures > 0 B/op (gate non-vacuous).
2. GC budget over a 60s headless soak of all 16 kernels: `maxMajor === 0`, `maxPauseMs <= 2`,
   total heapUsed growth < 64 KB.
3. Retention: over 10 create -> 5e4 steps -> `clear()` -> teardown cycles, every pooled member
   returns to zero (`_pool` active 0 for SkipList/Treap/Scapegoat/SplayTree/BinomialHeap/
   PairingHeap/FibonacciHeap), `size === 0` for all 16, PST `_next`/`_vcount` back to the fresh
   v0 state after `clear()`, heapUsed after cycle 10 within 64 KB of cycle 1.
4. Version trinity is exactly `'1.0.0'` at all three sites, and `git diff --stat LogN.js` is
   empty.
5. Layout-drift pins pass for all 16; a scripted rename of any single pinned field makes
   Demo.test.mjs FAIL with a `[lite-logn-demo]` message -- verified by injection on >= 4
   members, then reverted byte-clean.
6. Faithfulness: all 16 oracles agree exactly over >= 2000 randomized ops each (PST proves older
   versions unchanged; MST proves copy-in immutability); a wrong op reordering makes the oracle
   fail (non-vacuousness probe on >= 3 members).
7. Hot-path law: with `#profile`, the layout profiler reports `violationCount === 0` over 600
   frames on all 4 scenes; no `toFixed`/`toLocaleString` on a non-masked frame; `grep -n
   "rangeIter\|forEach" demo/kernels.mjs` shows zero hits inside any `step*` body.
8. ASCII-only: `demo/*.{mjs,html,md}` have no bytes > 0x7F except U+00D7/U+00B5; no `[lite-logn]`
   prefix in demo sources (only `[lite-logn-demo]`); `npm pack` file list byte-identical to
   pre-change.
