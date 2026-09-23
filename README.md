# @zakkster/lite-logn

> Zero-GC, O(log n) data structures that PROVE their logarithm. The O(log n) sibling of `@zakkster/lite-o1`: where lite-o1 holds the constant (a flat ops/ms line), lite-logn holds the logarithm (a straight line on a log-x axis -- one added level per doubling of n). v0.16.0 ships sixteen members: BinaryHeap (array-embedded O(log n) push / pop min|max heap), Fenwick / BIT (O(log n) point-update AND prefix-sum via the `i & -i` walk), SegmentTree (O(log n) associative range-query -- min / max / sum / gcd -- plus point-update over a flat 2n array), SkipList (pointer-free expected-O(log n) ordered map over a private free-list node pool), Treap (a randomized-balanced augmented ordered map with O(log n) rank / select / split / merge), Scapegoat (a DETERMINISTIC weight-balanced augmented ordered map: worst-case-O(log n) get, amortized-O(log n) set / delete, zero-GC rebuild), MinMaxHeap (an array-embedded double-ended priority queue: O(1) peekMin / peekMax, O(log n) push / popMin / popMax), SplayTree (a self-adjusting ordered map: amortized-O(log n) get / set / delete via top-down splay, hot keys ride near the root), BinomialHeap (a mergeable priority queue: O(log n) meld of two heaps over a shared arena, O(1)-amortized push, O(log n) popMin), PairingHeap (an ADDRESSABLE mergeable priority queue: O(1) push / meld over a shared arena, amortized-O(log n) popMin / decreaseKey / remove by arena-wide-unique id), FibonacciHeap (the textbook-optimal ADDRESSABLE mergeable priority queue: O(1)-amortized push / meld / decreaseKey, O(log n)-amortized popMin / remove), Fenwick2D (the family's FIRST 2D structure: O(log^2 n) point-update AND rectangle-sum over a flat 2D Binary Indexed Tree), SegmentTree2D (the general 2D rectangle FOLD a 2D BIT cannot do: O(log^2 n) point-update AND rectangle min / max / sum / gcd over a flat segment tree of segment trees), SortedArray (the read-optimized ordered map: O(log n) get / rank / successor / predecessor and O(1) select / keyAt / valueAt / min / max over two parallel sorted arrays, with O(n) in-place-shift writes disclosed), and PersistentSegTree (the family's FIRST persistent structure: a FULLY PERSISTENT / branching segment tree via path-copying -- update(fromVersion, i, value) returns a new version sharing every off-path subtree in O(log n), any past version stays queryable, over a monotonic bump/append node arena), and MergeSortTree (the family's FIRST truly IMMUTABLE member and FIRST offline range-RANK structure: a STATIC merge sort tree answering `countLE` -- how many values <= x in an index range -- and `rangeCount` -- how many in a value-window -- in worst-case O(log^2 n) over a segment tree of sorted runs in one flat array, O(n log n) build + space disclosed) -- each zero-GC, each shipped with a log-linear Witness that fits `nsPerOp = intercept + slope*log2(n)` (or `slope*(log2 n)^2` for Fenwick2D / SegmentTree2D / MergeSortTree) and shows the straight log line while an O(n) foil leaves it.

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-logn.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-logn)
[![sponsor](https://img.shields.io/badge/sponsor-PeshoVurtoleta-ea4aaa.svg?logo=github)](https://github.com/sponsors/PeshoVurtoleta)
![Zero-GC](https://img.shields.io/badge/Zero--GC-Engine-00C853?style=for-the-badge&logo=leaf&logoColor=white)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@zakkster/lite-logn?style=for-the-badge)](https://bundlephobia.com/result?p=@zakkster/lite-logn)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-logn?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-logn)
[![npm total downloads](https://img.shields.io/npm/dt/@zakkster/lite-logn?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-logn)
![Tree-Shakeable](https://img.shields.io/badge/tree--shakeable-yes-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-Types-informational)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

## The O(log n) toolkit the ecosystem was missing

Almost no JavaScript data-structure library ships the evidence that its Big-O claim survives contact with a real engine -- megamorphic call sites, GC pauses, cache misses, deopts. `lite-logn` is a curated, tree-shakeable family of the O(log n) structures that actually matter, each zero-GC, each written to teach the trick that buys the logarithm, and each shipped with a harness that DEMONSTRATES the straight log line rather than asserting it. The complexity class IS the product.

lite-logn is the O(log n) sibling of [`@zakkster/lite-o1`](https://www.npmjs.com/package/@zakkster/lite-o1). lite-o1 proves a FLAT ops/ms line on a log-x axis (the constant -- slope ~ 0); lite-logn proves a STRAIGHT line on that same axis (one added level per doubling of `n` -- slope > 0, within a per-member band). The gate SHAPE differs; the discipline is identical: zero allocation on every hot path and a witness that turns "trust me, it is O(log n)" into a straight line you can see, with a foil that leaves it.

**v0.16.0 ships sixteen members: BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D, SortedArray, PersistentSegTree and MergeSortTree.** Members land one per session, each append-only so prior members stay byte-identical. The planned roster below fills in per release.

```bash
npm install @zakkster/lite-logn
```

```js
import { Fenwick } from '@zakkster/lite-logn';

// A Fenwick tree (Binary Indexed Tree): point-update AND prefix-sum both O(log n).
const f = new Fenwick(1000);   // 1000 slots, all zero
f.update(10, 5);               // add 5 at index 10          -- O(log n)
f.update(20, 3);               // add 3 at index 20          -- O(log n)
f.prefix(15);        // -> 5   (sum of [0..15] inclusive)    -- O(log n)
f.rangeSum(10, 20);  // -> 8   (sum of [10..20] inclusive)   -- O(log n)
f.at(10);            // -> 5   (the single element at 10)    -- O(log n)
f.set(10, 100);      // set index 10 to 100 (absolute)       -- O(log n)
f.prefix(20);        // -> 103

// O(n) LINEAR bulk build (each cell adds itself to its parent in one pass):
const g = Fenwick.build([1, 2, 3, 4, 5]);
g.prefix(4);         // -> 15
```

Every hot op allocates zero bytes after construction, and `npm run witness` proves BOTH `update` and `prefix` hold the straight log line while their O(n) foils (a prefix-array rebuild and a naive re-sum) leave it.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [The roster](#the-roster)
- [The O(log n) Witness](#the-olog-n-witness)
- [Benchmarks](#benchmarks)
- [API reference](#api-reference)
  - [Constants](#constants)
  - [BinaryHeap](#binaryheap)
  - [Fenwick](#fenwick)
  - [SegmentTree](#segmenttree)
  - [SkipList](#skiplist)
  - [Treap](#treap)
  - [Scapegoat](#scapegoat)
  - [MinMaxHeap](#minmaxheap)
  - [SplayTree](#splaytree)
  - [BinomialHeap](#binomialheap)
  - [PairingHeap](#pairingheap)
  - [FibonacciHeap](#fibonacciheap)
  - [Fenwick2D](#fenwick2d)
  - [SegmentTree2D](#segmenttree2d)
  - [SortedArray](#sortedarray)
  - [PersistentSegTree](#persistentsegtree)
  - [MergeSortTree](#mergesorttree)
- [Zero-GC design notes](#zero-gc-design-notes)
- [Testing](#testing)
- [What this is not](#what-this-is-not)
- [Ecosystem](#ecosystem)
- [License](#license)

---

## Why this exists

A working programmer reaching for "keep the smallest element to hand" or "prefix sums that stay correct under updates" usually pays an O(n) cost hidden behind a friendly method name -- `Array.prototype.shift`, a full re-sum, a re-sort on every insert. The logarithm is the honest price of order, and it is cheap: one extra level of work per doubling of the data. But a naive O(log n) structure does `new Node` per insert, and that per-op allocation is a GC pause an engine will not honor -- it turns the clean logarithm into jitter.

lite-logn ships the O(log n) structures that matter with the allocation removed (array-embedded members are naturally node-free; pointer-based members use a pointer-free node pool) and the logarithm proven (the witness fits a straight log line and shows an O(n) foil leaving it). The complexity class is the product: you get the structure AND the evidence its bound is real on a real engine.

## What you get

- **Zero runtime dependencies.** ESM only, ASCII-only source, one PascalCase main file (`LogN.js`), `sideEffects: false`.
- **Zero allocation on every hot path.** Proven by `node --expose-gc test/torture.mjs` (`@zakkster/lite-leak` + `@zakkster/lite-gc-profiler`): 0 B/op, `gc major = 0`, leak tracker `size 0/0`.
- **A logarithm you can see.** `npm run witness` fits `nsPerOp = intercept + slope*log2(n)` across a geometric `n` sweep, gates the `R^2` floor + slope band, and shows an O(n) foil departing the line.
- **Tree-shakeable named exports.** Members share no mutable module state, so a bundler that imports one drops the others.
- **Fail closed.** Fixed, preallocated capacity; a `typeof`-guard at the door of every mutating op; `null` is not zero; an unknown option key is an error with a hint, never a silent ignore.

## The roster

One member per session, each landing append-only (prior members stay byte-identical). At v0.16.0, BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D, SortedArray, PersistentSegTree and MergeSortTree are shipped.

| Member | Version | Status | Shape | Hot ops |
| --- | --- | --- | --- | --- |
| **BinaryHeap** | 0.1.0 | shipped | array-embedded complete binary min|max heap over a flat `Float64Array` | `push` / `pop` O(log n), `peek` O(1) |
| **Fenwick** (BIT) | 0.2.0 | shipped | flat `Float64Array`, lowest-set-bit walk (`i & -i`) | `update` / `prefix` / `rangeSum` / `at` / `set` O(log n) |
| **SegmentTree** | 0.3.0 | shipped | single flat `Float64Array(2n)` (leaves n..2n-1); associative fold (min/max/sum/gcd) chosen at construction | `query` / `update` O(log n), `at` O(1) |
| **SkipList** | 0.4.0 | shipped | pointer-free over a private free-list node pool; expected O(log n) | `get` / `set` / `delete` / `successor` / `predecessor` |
| **Treap** | 0.5.0 | shipped | randomized-balanced augmented BST over the same node pool; expected O(log n) | `get` / `has` / `set` / `delete` / `rank` / `select` / `successor` / `predecessor` / `forEach` / `rangeIter` / `split` + `merge` |
| **Scapegoat** | 0.6.0 | shipped | DETERMINISTIC weight-balanced augmented BST over the same node pool; worst-case O(log n) get, amortized O(log n) set/delete (zero-GC rebuild) | `get` / `has` / `set` / `delete` / `rank` / `select` / `successor` / `predecessor` / `forEach` / `rangeIter` (NO split/merge) |
| **MinMaxHeap** | 0.7.0 | shipped | array-embedded double-ended PQ (DEPQ): one binary heap whose levels alternate min/max, two flat columns (`_key`/`_id`) | `push` / `popMin` / `popMax` O(log n), `peekMin` / `peekMax` / `peekMinKey` / `peekMaxKey` O(1) (non-addressable: NO changeKey/remove) |
| **SplayTree** | 0.8.0 | shipped | self-adjusting BST ordered map: iterative top-down splay, four flat columns (`_key`/`_value`/`_left`/`_right`) over the shared free-list, NO balance metadata | `get` / `has` / `set` / `delete` / `successor` / `predecessor` amortized O(log n) (a read SPLAYS); LEAN (NO rank/select/split/merge) |
| **BinomialHeap** | 0.9.0 | shipped | mergeable priority queue: a forest of binomial trees, six flat columns (`_key`/`_id`/`_parent`/`_child`/`_sibling`/`_order`) over a shared-arena free-list | `push` O(1) amortized, `popMin` O(log n), `peekMin`/`peekMinKey` O(1), `meld` O(log n) (consumes the arg); LEAN + non-addressable (NO decreaseKey/remove/rank/select) |
| **PairingHeap** | 0.10.0 | shipped | ADDRESSABLE mergeable priority queue: a single multi-way tree (left-child/right-sibling), five flat columns (`_key`/`_id`/`_child`/`_sibling`/`_parent`) + arena-wide `_pos` reverse map + per-slot `_owner` + union-find `_alias`, over a shared-arena free-list | `push`/`meld` O(1), `popMin`/`decreaseKey`/`remove` amortized O(log n), `peekMin`/`peekMinKey`/`has`/`keyOf` O(1); ADDRESSABLE by arena-wide-unique id (NO rank/select/changeKey) |
| **FibonacciHeap** | 0.11.0 | shipped | textbook-optimal ADDRESSABLE mergeable PQ: a lazy forest on CIRCULAR lists, eight flat columns (`_key`/`_id`/`_left`/`_right`/`_child`/`_parent`/`_degree`/`_mark`) + arena-wide `_pos` + `_owner` + `_alias` + a per-arena degree bucket, over a shared-arena free-list | `push`/`meld`/`decreaseKey` O(1) amortized (cascading cuts + mark bit), `popMin`/`remove` O(log n) amortized (degree consolidation), `peekMin`/`peekMinKey`/`has`/`keyOf` O(1); ADDRESSABLE by arena-wide-unique id (NO rank/select/changeKey); textbook-optimal but OFTEN slower wall-clock than Pairing/Binary |
| **Fenwick2D** | 0.12.0 | shipped | 2D Binary Indexed Tree: a single flat `Float64Array((rows+1)*(cols+1))`, nested lowest-set-bit walk (`i & -i` on both dims), row 0 / col 0 the identity sentinels | `update` / `prefix` / `rectSum` / `at` / `set` O(log^2 n) = O(log rows * log cols); `rows` / `cols` O(1); SUM-ONLY + index-addressed (NO 2D min/max/gcd, NO changeKey/rank/select) |
| **SegmentTree2D** | 0.13.0 | shipped | 2D segment tree of segment trees: a single flat `Float64Array(4*rows*cols)` (2R x 2C), associative fold (min/max/sum/gcd) chosen at construction; the general rectangle fold a 2D BIT cannot do | `query` / `update` O(log^2 n) = O(log rows * log cols); `at` O(1); `rows` / `cols` / `kind` O(1); index-addressed range FOLD (NO changeKey/rank/select, NO lazy range-update, commutative folds only) |
| **SortedArray** | 0.14.0 | shipped | DYNAMIC read-optimized ordered map (key -> value) over two parallel SORTED `Float64Array` columns (`_key` ascending / `_value`); CONTIGUOUS storage, one shared lower-bound search | `get` / `has` / `rank` / `successor` / `predecessor` O(log n); `select` / `keyAt` / `valueAt` / `min` / `max` O(1); `set` / `delete` O(n) in-place `copyWithin` shift (0 B/op); the fastest `forEach` (a cache-friendly scan); unique keys (NO duplicate, NO changeKey) |
| **PersistentSegTree** | 0.15.0 | shipped | FULLY PERSISTENT (branching) segment tree via PATH-COPYING: a persistent DAG of immutable nodes over three flat columns (`_val` Float64 / `_left` / `_right` Uint32) via a monotonic BUMP/APPEND allocator (NOT the free-list pool); associative fold (min/max/sum/gcd) chosen at construction | `query` / `at` O(log n) read-only; `update(fromVersion, i, value) -> newVersion` O(log n) (copies the root-to-leaf path, shares off-path subtrees, 0 B/op); every past version stays queryable + branchable; `length` / `versions` / `versionCapacity` / `kind` O(1); the family's FIRST persistent member (NO forEach/iterator -- a persistent DAG has no single live timeline) |
| **MergeSortTree** | 0.16.0 | shipped | STATIC, IMMUTABLE offline range-RANK tree: a segment tree of SORTED runs packed by level into ONE flat `Float64Array` of `n*(ceil(log2 n)+1)` cells; source COPIED in at construction, NO mutators (the family's FIRST truly immutable member) | `countLE(lo, hi, x)` (how many values <= x in an index range) / `rangeCount(lo, hi, vlo, vhi)` (count in a value-window) worst-case O(log^2 n), 0 B/op read-only; `length` / `size` / `cells` O(1); PLAIN O(log^2 n) (no fractional cascading); kth-in-range deferred to a future WaveletTree; O(n log n) build + space disclosed (NO forEach/mutator -- static + immutable) |

Later tiers (OrderStatTree, IndexedHeap, and presets) are queued in [`ROADMAP.md`](./ROADMAP.md).

## The O(log n) Witness

The family anchor. Time a fixed batch of the hot op at each `n` in a geometric sweep, fit `nsPerOp = intercept + slope * log2(n)` by least squares, and gate:

- `R^2 >= floor` (a straight line fits -- genuinely logarithmic), AND
- `slope` inside the member's band (the per-level cost, ns/level), AND
- the FOIL leaves the line (low `R^2` -- the O(n) default a working programmer reaches for, shown losing as `n` grows).

<details>
<summary>Per-op witness numbers -- all 21 gated lanes (R^2, slope, band, sweep) and the max-single-op disclosures.</summary>

For amortized / randomized members the witness also prints the MAX single-op time -- the honesty hook: a rebuild spike or a degenerate tail shows as a tall bar even when the mean still fits the line. The `R^2` floor (0.958) is frozen family-wide in BinaryHeap; each member then calibrates its OWN per-op slope band (median-of-15 fit-runs x `[0.6, 1.4]`), because a cheaper op honestly has a lower per-level slope (see [`decisions/0004-witness-band.md`](./decisions/0004-witness-band.md)). At v0.16.0 the witness gates twenty-one ops: BinaryHeap `pop` (R^2 ~ 0.99, slope ~ 8-10 ns/level), Fenwick `update` (R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level) and `prefix` (R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level), SegmentTree `update` (R^2 ~ 0.99 median-of-7 fits, slope ~ 3.2 ns/level, band `[2.29, 5.35]`) and `query` (R^2 ~ 0.99, slope ~ 7 ns/level, band `[4.30, 10.04]`), SkipList `get` (R^2 ~ 0.97-0.99, slope ~ 9 ns/level, band `[5.27, 12.30]`) and `set` (R^2 ~ 0.97-0.99, slope ~ 14 ns/level, band `[8.36, 19.50]`), Treap `get` (R^2 ~ 0.99, slope ~ 4 ns/level, band `[2.55, 5.95]`), Scapegoat `get` (R^2 ~ 0.99, slope ~ 4 ns/level, band `[2.41, 5.63]`), MinMaxHeap `popMin` (R^2 ~ 0.99, slope ~ 10.3 ns/level, band `[6.18, 14.42]`), SplayTree `get` (R^2 ~ 0.98, slope ~ 27 ns/level, band `[16.39, 38.24]`, sweep `[2^12, 2^17]`), BinomialHeap `popMin` (R^2 ~ 0.98, slope ~ 44.8 ns/level, band `[26.89, 62.75]`, sweep `[2^11, 2^17]`), PairingHeap `popMin` (R^2 ~ 0.99 median-of-5 fits, slope ~ 21.4 ns/level, band `[13.08, 30.52]`, sweep `[2^11, 2^17]`), FibonacciHeap `popMin` (R^2 ~ 0.98 median-of-7 fits, slope ~ 45 ns/level, band `[27.18, 63.41]`, sweep `[2^11, 2^17]`), and -- on the family's FIRST squared-log axis (`nsPerOp = intercept + slope*(log2 n)^2`) -- Fenwick2D `update` (R^2 ~ 0.998 median-of-7 fits, slope ~ 3.3 ns/level^2, band `[2.13, 4.96]`, square sides `[2^5, 2^11]`) and `rectSum` (R^2 ~ 0.9998, slope ~ 4.4 ns/level^2, band `[2.90, 6.77]`), and -- the SECOND member on that squared-log axis -- SegmentTree2D `update` (R^2 ~ 0.997, slope ~ 6.4 ns/level^2, band `[3.38, 7.89]`, square sides `[2^5, 2^11]`) and `query` (R^2 ~ 0.9999, slope ~ 5.8 ns/level^2, band `[3.06, 7.15]`; both single-fit, rock-steady, no median-of-fits needed), and -- back on the DEFAULT log2(n) axis -- SortedArray `get` (R^2 ~ 0.98 median-of-7 fits, slope ~ 1.0 ns/level, band `[0.59, 1.38]`, sweep `[2^12, 2^18]`), and -- also on the DEFAULT log2(n) axis -- PersistentSegTree `query` (R^2 ~ 0.98 median-of-7 fits, slope ~ 39.3 ns/level, band `[23.55, 54.95]`, sweep `[2^11, 2^17]`), and -- the family's THIRD member on the squared-log axis (`nsPerOp = intercept + slope*(log2 n)^2`) -- MergeSortTree `countLE` (R^2 ~ 0.97 median-of-7 fits, slope ~ 5.2 ns/level^2, band `[3.13, 7.31]`, sweep `[2^13, 2^18]`) all ON the line. PersistentSegTree is the family's FIRST persistent / branching member: its `query` is a WORST-CASE O(log n) read-only descent over a version's root (independent of which version is read -- all versions share the same height), so it fits the default single-log axis; because a persistent path-copying query chases scattered bump-allocated slots across the node arena, its per-level slope sits with the pointer-chasing members and its post-torture run has genuine scheduler / thermal residue, so this lane opts into the MEDIAN of 7 independent sweep-fits as measurement-quality insurance (the frozen 0.958 floor and slope band are untouched). Its O(n) linear-scan foil leaves the line. WORST-CASE member: no max-single-op line. MergeSortTree is the family's FIRST truly IMMUTABLE member and its offline range-RANK structure: its `countLE` is a WORST-CASE O(log^2 n) descent of the O(log n) canonical nodes covering the index range, each binary-searching that node's sorted run, so it fits the SAME squared-log axis Fenwick2D / SegmentTree2D use; because it chases scattered node runs across a large flat table, a single sweep-fit's R^2 can dip below the floor in a minority of runs, so this lane opts into the MEDIAN of 7 independent sweep-fits (the frozen 0.958 floor + slope band are untouched). Its O(n) linear-scan-count foil is exponential on the squared-log axis and leaves the line. STATIC + WORST-CASE (build-once immutable, no randomization / amortization): no max-single-op line. SortedArray is the family's READ-OPTIMIZED ordered map: its `get` is a WORST-CASE O(log n) contiguous lower-bound binary search (the deterministic Scapegoat.get analogue, no RNG), the family's SHALLOWEST per-level slope because a contiguous search touches fewer cache lines per level than a pointer-chasing BST descent -- so this being the fastest lane, its ~6 ns fit span needs the widest + highest n-sweep and a 1e6-iteration measurement to keep per-point noise off the fit; the median-of-7 fit is measurement-quality insurance against the scheduler/thermal residue of the post-torture run (the frozen 0.958 floor and slope band are untouched). Because a genuine insert is an O(n) tail shift, the witness also prints the MAX single insert as a disclosure, never gated. FibonacciHeap is the mergeable arc's FINALE -- the textbook-optimal ADDRESSABLE heap: `push`/`meld`/`decreaseKey` are O(1) AMORTIZED (a cascading cut governed by a per-node mark bit) and `popMin`/`remove` are O(log n) AMORTIZED (a degree consolidation), and because a single popMin can do an O(n) consolidation and a single decreaseKey an O(n) cascade the witness prints BOTH the MAX single popMin AND the MAX single decreaseKey as disclosures, never gated. It carries the FAMILY's STEEPEST per-level slope (a lazy forest consolidated on demand -- the largest constant factors of any heap here); honestly, it is textbook-optimal in asymptotics but OFTEN slower wall-clock than Pairing/Binary on real hardware. Its full-drain average has even more run-to-run SHAPE variance than the pairing two-pass, so a single sweep-fit's R^2 is flaky (~0.981-0.988, and can dip below the floor across meta-runs); this lane gates on the MEDIAN of 7 independent sweep-fits -- measurement-quality only, the frozen 0.958 floor and slope band are untouched, and no unreproducible "every run" is claimed. PairingHeap is the mergeable arc's ADDRESSABLE heap: its `popMin` is AMORTIZED O(log n) (a TWO-PASS combine of the root's child list -- pointer-free, 0 B/op), and because a single pop can fold a long child list the witness prints the MAX single popMin as a disclosure, never gated; its per-level slope sits between the array-embedded heaps and BinomialHeap (a single multi-way tree, not a forest). A pairing-heap full-drain average has genuine run-to-run SHAPE variance, so a single sweep-fit's R^2 is flaky (~0.945-0.985, dipping below the floor in a minority of runs); this lane gates on the MEDIAN of 5 independent sweep-fits (rejecting the occasional tilted sweep) -- measurement-quality only, the frozen 0.958 floor and slope band are untouched. BinomialHeap is the family's first MERGEABLE heap: its `popMin` is WORST-case O(log n) (unlink the extreme root, reverse its child list, union back, rescan the roots -- no max-single-op line), and its per-level slope sits well above the array-embedded heaps because it chases scattered forest slots (which is why it is gated over the cache-resident exact-power window, not the [1e4, 1e6] band). SplayTree is DETERMINISTIC and SELF-ADJUSTING: its `get` is AMORTIZED O(log n) (a read SPLAYS the touched key to the root -- the slope sits well above a read-only BST descent because rotations rewrite links every op), measured over a uniform-random working set of size n so the amortized line shows (a skewed pattern would flatten it -- the member's speedup, not what a straight-log witness measures); because a single cold access can splay an O(n) chain, the witness also prints the MAX single get as a disclosure, never gated. Scapegoat is DETERMINISTIC, so its `get` is WORST-case (not expected) O(log n); its rebuild spike lives on the AMORTIZED `set` path and is proven not by a per-op line but by an amortized-trace assertion -- the cumulative ascending-insert (rebuild-heavy) cost/op tracks a LOG curve (last/first ratio ~1.5x over `[2^11, 2^17]`, gated `< 4x`) where a rebuild-less BST would degenerate to an O(n)-amortized chain and blow the ratio to ~64x. Treap's descent touches one node per level, so its per-level slope is lower than SkipList's tower search -- expected, which is why only the R^2 floor is shared and each op calibrates its own band. SkipList's two ops are gated over DIFFERENT sweeps -- each measured where its logarithm is visible, not where the cache wall is: `get` (a clean search with no per-op randomness) over `[2^11, 2^17]` for dynamic range; `set` (a heavier insert+delete churn whose per-insert tower height is random) over the smaller, fully cache-resident `[2^9, 2^14]` so the fit sees the structural level count, not DRAM latency. Because SkipList is EXPECTED (not worst-case) O(log n), the witness also prints the MAX single insert over a realistic randomized build trace -- the unlucky-tower tail a mean hides. Each op's O(n) foil fits well below the floor: the sorted-array insert (BinaryHeap / SkipList) foil runs R^2 ~ 0.77-0.87, the Fenwick foils (prefix-array rebuild, naive re-sum) and SkipList's linear-scan search foil hold at R^2 ~ 0.75-0.82, and SegmentTree's foils (whole-tree rebuild per update, scan-fold per query) fit at R^2 ~ 0.72-0.85 -- all foil families sit comfortably under the 0.958 floor.

</details>

## Benchmarks

A repo-only, eight-dimension benchmark suite (`benchmark/`, ADOPTED field-for-field from `@zakkster/lite-o1`'s "Bench v2") surrounds the witness anchor. It is dev infra: NOT in the published tarball, imports NOTHING from the package but `LogN.js`, and spawns one child process per `(member x dimension)` cell for a clean GC/JIT state. **D1 is the O(log n) Witness itself** -- it DELEGATES to the shipped `test/witness.mjs` (the same frozen kernels, per-op sweeps, `R^2` floor and slope bands), so the headline dimension never re-implements the fit. Run it yourself:

```sh
npm run bench            # 128 cells -> benchmark/results.json + summary tables
npm run bench:report     # the above, then benchmark/report.html (hand-rolled inline-SVG graphs)
```

Numbers below are one run on an Apple M4 Pro (arm64), Node v26 -- machine-specific, reproducible from a fixed seed (`0x9e3779b1`). Every applicable cell is a positive number; every inapplicable cell is the string `n/a` (never a numeric 0).

### D1 -- the O(log n) Witness fit (per gated op-row)

Each op fits `nsPerOp = intercept + slope*log2(n)`. ON-LINE = `R^2 >= 0.958` (the frozen family floor) AND `slope` inside the member's per-op band; the O(n) foil MUST leave the line (`foil R^2 < 0.958`). All twenty-one op-rows sit ON the line; all twenty-one foils leave it.

<svg width="640" height="200" viewBox="0 0 640 200" role="img" aria-label="D1 slope per op-row (ns/level)" xmlns="http://www.w3.org/2000/svg">
  <text x="8" y="16" font-size="12" fill="#475569">D1 slope (ns/level) -- lower is a cheaper per-level cost</text>
  <g font-size="10" fill="#334155" text-anchor="middle">
    <rect x="24"  y="84"  width="60" height="96"  fill="#2563eb"/><text x="54"  y="194">BH.pop 8.4</text>
    <rect x="112" y="148" width="60" height="32"  fill="#059669"/><text x="142" y="194">Fen.upd 2.8</text>
    <rect x="200" y="150" width="60" height="30"  fill="#059669"/><text x="230" y="194">Fen.pre 2.6</text>
    <rect x="288" y="145" width="60" height="35"  fill="#d97706"/><text x="318" y="194">Seg.upd 3.1</text>
    <rect x="376" y="99"  width="60" height="81"  fill="#d97706"/><text x="406" y="194">Seg.qry 7.0</text>
    <rect x="464" y="88"  width="60" height="92"  fill="#7c3aed"/><text x="494" y="194">SL.get 8.0</text>
    <rect x="552" y="40"  width="60" height="140" fill="#7c3aed"/><text x="582" y="194">SL.set 12.1</text>
  </g>
</svg>

| op-row | `R^2` | slope (ns/level) | slope band | on line? | foil | foil `R^2` | foil off? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `BinaryHeap.pop` | 0.996 | 8.4 | `[5.76, 13.44]` | ON | sorted-array insert | 0.83 | off |
| `Fenwick.update` | 0.980 | 2.8 | `[1.84, 4.30]` | ON | prefix-array rebuild | 0.76 | off |
| `Fenwick.prefix` | 0.968 | 2.6 | `[1.76, 4.10]` | ON | naive re-sum | 0.75 | off |
| `SegmentTree.update` | 0.989 | 3.1 | `[2.29, 5.35]` | ON | whole-tree rebuild | 0.82 | off |
| `SegmentTree.query` | 0.998 | 7.0 | `[4.30, 10.04]` | ON | scan-fold | 0.73 | off |
| `SkipList.get` | 0.988 | 8.0 | `[5.27, 12.30]` | ON | linear scan | 0.79 | off |
| `SkipList.set` | 0.985 | 12.1 | `[8.36, 19.50]` | ON | sorted-array insert | 0.77 | off |
| `Treap.get` | 0.988 | 4.0 | `[2.55, 5.95]` | ON | linear scan | 0.79 | off |
| `Scapegoat.get` | 0.988 | 3.8 | `[2.41, 5.63]` | ON | linear scan | 0.79 | off |
| `MinMaxHeap.popMin` | 0.99 | 10.3 | `[6.18, 14.42]` | ON | linear min-scan-and-splice | 0.77 | off |
| `SplayTree.get` | 0.98 | 27.3 | `[16.39, 38.24]` | ON | linear scan | 0.80 | off |
| `BinomialHeap.popMin` | 0.98 | 44.8 | `[26.89, 62.75]` | ON | linear min-scan-and-splice | 0.77 | off |
| `PairingHeap.popMin` | 0.99 (median-of-5 fits) | 21.4 | `[13.08, 30.52]` | ON | linear min-scan-and-splice | 0.79 | off |
| `FibonacciHeap.popMin` | 0.98 (median-of-7 fits) | 45.3 | `[27.18, 63.41]` | ON | linear min-scan-and-splice | 0.90 | off |
| `Fenwick2D.update` | 0.99 (median-of-fits) | 3.5 | `[2.13, 4.96]` | ON | dense rectangle rescan | 0.80 | off |
| `Fenwick2D.rectSum` | 0.99 | 4.8 | `[2.90, 6.77]` | ON | dense rectangle rescan | 0.80 | off |
| `SegmentTree2D.update` | 0.997 | 6.4 | `[3.38, 7.89]` | ON | 2D grid rebuild | 0.80 | off |
| `SegmentTree2D.query` | 0.9999 | 5.8 | `[3.06, 7.15]` | ON | dense rectangle rescan | 0.80 | off |
| `SortedArray.get` | 0.98 (median-of-7 fits) | 1.0 | `[0.59, 1.38]` | ON | linear scan | 0.78 | off |
| `PersistentSegTree.query` | 0.97 (median-of-7 fits) | 38.9 | `[23.55, 54.95]` | ON | scan-fold | 0.70 | off |
| `MergeSortTree.countLE` | 0.97 (median-of-7 fits) | 6.8 | `[3.13, 7.31]` | ON | linear scan-count | 0.86 | off |

**Fenwick2D squared-log axis (the family's FIRST).** Fenwick2D's ops are O(log^2 n), not O(log n), so its two witness lanes fit `nsPerOp = intercept + slope*(log2 n)^2` -- the slope column above for `Fenwick2D.update` / `Fenwick2D.rectSum` is therefore ns per `(log2 n)^2` UNIT (not per level), gated over exact power-of-two square sides `2^5..2^11`. The per-lane `xOf` axis hook that makes this possible defaults to `Math.log2`, so every prior lane's fit is byte-identical. Each O(n^2)-per-op foil (a dense rectangle rescan) leaves the squared-log line. Fenwick2D is WORST-case (no MAX-single-op disclosure).

**Scapegoat amortized-trace (the rebuild honesty).** Scapegoat's `get` is WORST-case O(log n) (a deterministic weight-balance height bound), so it carries no expected-op MAX-single-op disclosure. The rebuild spike lives on the AMORTIZED `set` path; D1 proves the amortization not with a per-op line but with an amortized-trace assertion -- the cumulative ascending-insert (rebuild-heavy) cost/op tracks a LOG curve (last/first ratio `~1.5x` over `[2^11, 2^17]`, gated `< 4x`) where a rebuild-less BST would blow to `~64x`.

**SkipList counter-foil (the order tax).** A native `Map` is O(1) at get/set (`~27 ns/op`, FLATTER than any log line) but ORDER-BLIND: it cannot answer `successor` / `predecessor` / `rangeIter`. The log factor SkipList pays buys exactly the ordered queries Map cannot. SkipList is EXPECTED O(log n), so D1 also DISCLOSES its MAX single insert (an unlucky tall tower over a randomized build: `~18-130 us`, not gated).

### D3 -- memory (bytes / live vs a theoretical floor)

| member | peak bytes @ 64Ki | B/live | theo min | overhead x | note |
| --- | --- | --- | --- | --- | --- |
| BinaryHeap | 1,048,576 | 16.0 | 12 | 1.33 | key (8) + id (4) dense; `_pos` reverse map is the universe overhead |
| Fenwick | 524,296 | 8.0 | 8 | 1.00 | one `Float64` tree cell per element -- exact |
| SegmentTree | 1,048,576 | 16.0 | 16 | 1.00 | the `2n` array -- exact |
| SkipList | 5,767,320 | 88.0 | 16 | 5.50 | key + value dense; the `ceil(log2 cap)+1` link columns are the tower overhead |
| Treap | 2,359,328 | 36.0 | 16 | 2.25 | key + value + priority + child/parent + subtree-size per node |
| Scapegoat | 2,621,472 | 40.0 | 16 | 2.50 | key + value + child links + subtree-size counters per node |
| MinMaxHeap | 786,432 | 12.0 | 12 | 1.00 | key (8) + id (4) dense, no reverse map -- exact |
| SplayTree | 1,835,032 | 28.0 | 16 | 1.75 | key + value + child/parent pointers per node |
| BinomialHeap | 2,097,180 | 32.0 | 12 | 2.67 | key + child/sibling/parent forest pointers per node |
| PairingHeap | 2,359,324 | 36.0 | 12 | 3.00 | key + child/sibling/prev pointers per node |
| FibonacciHeap | 2,949,261 | 45.0 | 12 | 3.75 | key + child/sibling/parent + degree/mark per node -- the steepest store |
| Fenwick2D | 528,392 | 8.1 | 8 | 1.01 | one `Float64` cell per grid element -- near-exact |
| SegmentTree2D | 2,097,152 | 32.0 | 32 | 1.00 | the `2n x 2n` grid -- exact |
| SortedArray | 1,048,576 | 16.0 | 16 | 1.00 | key + value dense contiguous -- exact |
| PersistentSegTree | 2,114,820 | 32.3 | 32 | 1.01 | path-copied node arena; ~1% slot slack over the node size |
| MergeSortTree | 8,912,896 | 136.0 | 8 | 17.00 | a sorted run copied at each of `log n` levels -- the offline range-rank space cost |

The overhead-x load-factor curve RISES as load falls for the heap + pointer-node members (BinaryHeap, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, SortedArray -- fixed backing over fewer live) and is FLAT for the INDEX-ADDRESSED members (Fenwick, SegmentTree, Fenwick2D, SegmentTree2D, PersistentSegTree, MergeSortTree -- every cell is always live) -- another honest `n/a` where insertion order does not apply. MergeSortTree's 17x is the family's highest, the disclosed space co-headline of an offline range-rank structure.

### D5 -- bundle size + tree-shaking (esbuild min + gzip)

A single-member import must be `< 40%` of the all-member import. All sixteen clear it comfortably against the full sixteen-member bundle (`15,259 B` gzip): the heaviest lone member (FibonacciHeap, the widest surface) is `~0.17`, the lightest (Fenwick) `~0.05`, and the median lone-import ratio is `~0.10 (< 0.40)`. Every single-member import drops the vast majority of the code.

| member | single gz (B) | all gz (B) | ratio | `< 40%`? |
| --- | --- | --- | --- | --- |
| BinaryHeap | 1,365 | 15,259 | 0.089 | yes |
| Fenwick | 826 | 15,259 | 0.054 | yes |
| SegmentTree | 1,070 | 15,259 | 0.070 | yes |
| SkipList | 1,546 | 15,259 | 0.101 | yes |
| Treap | 2,036 | 15,259 | 0.133 | yes |
| Scapegoat | 1,900 | 15,259 | 0.125 | yes |
| MinMaxHeap | 1,272 | 15,259 | 0.083 | yes |
| SplayTree | 1,455 | 15,259 | 0.095 | yes |
| BinomialHeap | 1,880 | 15,259 | 0.123 | yes |
| PairingHeap | 2,204 | 15,259 | 0.144 | yes |
| FibonacciHeap | 2,660 | 15,259 | 0.174 | yes |
| Fenwick2D | 1,270 | 15,259 | 0.083 | yes |
| SegmentTree2D | 1,610 | 15,259 | 0.106 | yes |
| SortedArray | 1,267 | 15,259 | 0.083 | yes |
| PersistentSegTree | 1,587 | 15,259 | 0.104 | yes |
| MergeSortTree | 1,077 | 15,259 | 0.071 | yes |

### D6 -- GC pressure (the 0 B/op gate as a curve, per op-row)

All twenty-one gated op-rows report **0 B/op** across the `n = 1e3..1e6` sweep, with `max major GC = 0`. The precise proof stays `node --expose-gc test/torture.mjs` (via `@zakkster/lite-gc-profiler`); D6 is the portable curve (min heap-delta over independent passes -- heap-accounting jitter only ADDS, so a truly-zero kernel hits 0 on its best pass while a per-op allocator stays positive on every pass).

### The other dimensions

- **D2 amortized cost** -- cumulative ns/op stays bounded over a `~1M`-op mixed trace (drift `< 1.0` here: the trace speeds up as the JIT warms, never degrades).
- **D4 cache (PROXY, labelled)** -- dense `forEach` iteration vs random single-element lookup; the random/dense gap is `~1.9x` (SegmentTree) to `~2.9x` (SkipList). No native perf counters.
- **D7 scalability** -- numeric substrates: string + object keys read `n/a` on all sixteen. Load factors `0.3/0.5/0.7/0.9`; insertion order (sorted / random / adversarial-reverse) applies to the comparison-ordered BinaryHeap + SkipList + Treap + Scapegoat + MinMaxHeap + SplayTree + BinomialHeap + PairingHeap + FibonacciHeap, and reads `n/a` for the index-addressed Fenwick + SegmentTree + Fenwick2D + SegmentTree2D + PersistentSegTree + MergeSortTree and for the shift-insert SortedArray.
- **D8 workloads** -- churn (all sixteen members) + an ordered scan (`successor` + `rangeIter`, on the ordered maps SkipList + Treap + Scapegoat + SplayTree + SortedArray; `n/a` elsewhere -- the heaps BinaryHeap / MinMaxHeap / BinomialHeap / PairingHeap / FibonacciHeap are priority queues, and Fenwick / SegmentTree / Fenwick2D / SegmentTree2D / PersistentSegTree / MergeSortTree are index-addressed / positional -- not ordered maps).

## API reference

### Constants

| Export | Type | Value | Meaning |
| --- | --- | --- | --- |
| `VERSION` | `string` | `'0.16.0'` | The package version. One of the three version sites (package.json / `LogN.js` `VERSION` const / `llms.txt`), kept in lockstep and enforced in review. |

### BinaryHeap

<details>
<summary><strong>BinaryHeap</strong> -- Indexed binary heap / addressable priority queue -- push / pop / changeKey / remove O(log n), peek / topKey / keyOf / has O(1).</summary>

An **indexed binary heap** (an addressable priority queue): a min|max binary heap over three parallel, pointer-free typed arrays -- `_key` (`Float64Array`, the priority at each heap slot), `_id` (`Uint32Array`, the entity id at each slot), and `_pos` (`Int32Array`, the reverse map entity-id -> slot, sentinel `-1` == absent). A plain binary heap gives O(log n) `push` / `pop` but cannot find an arbitrary element to reprioritize; the reverse-index map buys O(log n) `changeKey` / `remove` by a caller-supplied entity id. Children of slot `i` are `2i+1` / `2i+2`. Entity ids are integers in `[0, capacity)`; keys are finite numbers. Every hot op allocates zero bytes after construction (hole-punching sift -- one write per level, no 3-write swap).

```js
import { BinaryHeap } from '@zakkster/lite-logn';

const pq = new BinaryHeap(1024, 'min');   // capacity 1024, min-heap
pq.push(7, 5.0);                          // entity 7 at priority 5.0
pq.push(3, 2.5);
pq.push(9, 8.0);
pq.peek();        // -> 3   (id of the extremum)
pq.topKey();      // -> 2.5 (its key)
pq.changeKey(9, 1.0);   // reprioritize entity 9 to the front
pq.pop();         // -> 9   (removes and returns the new extremum)
pq.remove(7);     // -> true (addressable delete by id)

// Floyd O(n) bulk build from parallel arrays:
const heap = BinaryHeap.build('max', [0, 1, 2, 3], [4.0, 1.0, 9.0, 2.0], 16);
heap.pop();       // -> 2   (the id whose key 9.0 is the max)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new BinaryHeap(capacity, kind = 'min')` | O(capacity) | `capacity` integer in `[1, 2^31-1]`; `kind` is `'min'` or `'max'`. Allocates the three typed arrays once; `_pos.fill(-1)`. |
| `push` | `push(id, key) -> void` | O(log n) | id in `[0, capacity)`, not already present; key finite. Throws on out-of-range/duplicate id, non-finite key, or full heap. |
| `pop` | `pop() -> number \| undefined` | O(log n) | Removes and returns the extremum's id; `undefined` if empty (no throw). |
| `peek` | `peek() -> number \| undefined` | O(1) | The extremum's id; `undefined` if empty. |
| `topKey` | `topKey() -> number \| undefined` | O(1) | The extremum's key; `undefined` if empty. |
| `keyOf` | `keyOf(id) -> number \| undefined` | O(1) | The key associated with id; `undefined` if absent. Out-of-range id throws. |
| `has` | `has(id) -> boolean` | O(1) | True iff id is resident. Out-of-range id throws. |
| `changeKey` | `changeKey(id, newKey) -> void` | O(log n) | Reprioritize a present entity (auto-direction sift); a non-member id throws. |
| `remove` | `remove(id) -> boolean` | O(log n) | Idempotent: `false` if absent, `true` if removed. |
| `clear` | `clear() -> void` | O(capacity) | Resets size and the reverse map. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(id, key)` in UNSPECIFIED (heap-array) order -- NOT sorted / pop order. |
| `[Symbol.iterator]` | `for (const id of heap)` | O(n) | Yields live ids in UNSPECIFIED order. |
| `size` / `capacity` / `kind` | getters | O(1) | Live count / fixed capacity / `'min'` \| `'max'`. |
| `BinaryHeap.build` | `build(kind, ids, keys, capacity) -> BinaryHeap` | O(n) | Floyd bulk build from parallel arrays; fails closed on duplicate/out-of-range id, non-finite key, or `count > capacity`. |

</details>

### Fenwick

<details>
<summary><strong>Fenwick</strong> -- Fenwick / BIT -- point-update AND prefix-sum O(log n) via the i & -i walk; rangeSum / at / set, O(n) build.</summary>

A **Fenwick tree** (Binary Indexed Tree): BOTH point-update AND prefix-sum in O(log n) over a single flat `Float64Array`, using nothing but the lowest-set-bit walk (`i & -i`). It answers the most delightfully non-obvious complexity question in the family -- "how can update AND query both be logarithmic on a plain array?" -- and the witness proves it with TWO straight log lines. Public indices are **0-based** in `[0, length)`; internally the tree is 1-based, so `_t[0]` is the unused identity sentinel and is never read as data (null is not zero). `update` climbs by `i & -i` (one `_t` touch per level); `prefix` descends by `i & -i` (one read per level); `rangeSum` and `at` are pairs of inlined prefix walks. Values are finite numbers (negatives allowed); NaN / +-Infinity / non-number fail closed. Every hot op allocates zero bytes after construction.

```js
import { Fenwick } from '@zakkster/lite-logn';

const f = new Fenwick(1000);
f.update(10, 5);        // add 5 at index 10
f.update(20, 3);        // add 3 at index 20
f.prefix(15);           // -> 5   (sum of [0..15] inclusive)
f.prefix(-1);           // -> 0   (the empty-prefix base case)
f.rangeSum(10, 20);     // -> 8   (sum of [10..20] inclusive)
f.at(10);               // -> 5   (single element = prefix(10) - prefix(9))
f.set(10, 100);         // set index 10 to 100 (absolute)
f.prefix(20);           // -> 103

// O(n) LINEAR bulk build (not n incremental updates):
const g = Fenwick.build([1, 2, 3, 4, 5]);
g.rangeSum(1, 3);       // -> 9
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new Fenwick(length)` | O(length) | `length` integer in `[1, 2^31-1]`. Allocates one `Float64Array(length + 1)`, zero-initialized. |
| `update` | `update(i, delta) -> this` | O(log n) | Add `delta` at 0-based index `i` (climb by `i & -i`). `delta` finite (typeof-guarded first); out-of-range `i` throws. |
| `prefix` | `prefix(i) -> number` | O(log n) | Sum of `[0, i]` INCLUSIVE (descend by `i & -i`). `prefix(-1) === 0`; valid domain `[-1, length)`. |
| `rangeSum` | `rangeSum(lo, hi) -> number` | O(log n) | Sum of `[lo, hi]` INCLUSIVE both ends = `prefix(hi) - prefix(lo-1)`. Throws on out-of-range or `lo > hi`. |
| `at` | `at(i) -> number` | O(log n) | The single element = `prefix(i) - prefix(i-1)`. Out-of-range `i` throws. |
| `set` | `set(i, value) -> this` | O(log n) | Set element `i` to `value` (absolute), via `update(i, value - at(i))`. `value` finite. |
| `clear` | `clear() -> this` | O(length) | Zeros every element in place, keeping capacity. |
| `forEach` | `forEach(fn) -> void` | O(n log n) | Visits `(value, index, fenwick)` in ascending index order (each element is an `at` walk). |
| `length` | getter | O(1) | Element count this tree was sized for. |
| `Fenwick.build` | `build(values) -> Fenwick` | O(n) | LINEAR bulk build (each cell adds itself to its parent in one forward pass); fails closed on a non-array-like or any non-finite value. |

</details>

### SegmentTree

<details>
<summary><strong>SegmentTree</strong> -- Associative range-query (min / max / sum / gcd) + point-update, both O(log n); fold frozen at construction.</summary>

A **segment tree**: an associative range-query AND a point-update, BOTH O(log n), over a SINGLE flat `Float64Array(2n)` -- no nodes, no pointers, no recursion on the hot path. It is the complement to Fenwick: Fenwick's `rangeSum` works only because subtraction inverts addition, so it is a SUM machine; SegmentTree folds ANY associative + commutative operation over a range -- **min / max / sum / gcd** -- because it stores a fold of each subtree at its internal node rather than a prefix. The fold is chosen ONCE at construction and cached as a small-int combined by an INLINE switch on the hot path (no function ref, no closure, no megamorphic call site). Leaves live at `_t[n + i]`; internal node `p` holds the fold of its children `_t[2p]` / `_t[2p+1]`, so `_t[1]` is the fold of the whole array and `_t[0]` is unused (null is not zero). `update` sets a leaf and climbs to the root recomputing each ancestor (one write per level); `query` walks the two boundaries up the tree, folding each node that lies fully inside `[lo, hi]` into one accumulator. Every hot op allocates zero bytes after construction.

The fold's **identity** fills query accumulators and cleared / fresh leaves -- `sum -> 0`, `min -> +Infinity`, `max -> -Infinity`, `gcd -> 0` -- so a fresh or cleared tree queries to the identity. Identity is a legal RESULT but NEVER a legal INPUT: the value door rejects user `NaN` / `+-Infinity` (and, for the `gcd` kind, any negative or non-integer value), typeof-guarded before coercion.

```js
import { SegmentTree } from '@zakkster/lite-logn';

const st = new SegmentTree(1000, 'min');   // 1000 slots, all +Infinity (min identity)
st.update(10, 5);        // set index 10 to 5 (absolute)
st.update(20, 3);        // set index 20 to 3
st.query(0, 999);        // -> 3   (min over [0..999] inclusive)
st.query(10, 10);        // -> 5   (a one-element range = the leaf)
st.at(20);               // -> 3   (the single leaf value, O(1))

// A different fold, chosen at construction:
const sum = SegmentTree.build([1, 2, 3, 4, 5], 'sum'); // O(n) bottom-up bulk build
sum.query(1, 3);         // -> 9   (2 + 3 + 4)
const g = SegmentTree.build([12, 18, 24], 'gcd');
g.query(0, 2);           // -> 6
```

The iterative `2n` layout is **order-agnostic** -- `query` mixes left- and right-boundary contributions into one accumulator, so it is correct ONLY because min / max / sum / gcd are all COMMUTATIVE as well as associative. A future non-commutative fold (matrix product, string concat) would need a pow2 layout with separate ordered accumulators (see [`decisions/0005-segtree.md`](./decisions/0005-segtree.md)).

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new SegmentTree(length, kind)` | O(length) | `length` integer in `[1, 2^30-1]` (HALF of Fenwick's ceiling: the `2n` array must keep `2n` a positive int32); `kind` is `'min'` \| `'max'` \| `'sum'` \| `'gcd'`. Allocates one `Float64Array(2 * length)`. |
| `query` | `query(lo, hi) -> number` | O(log n) | The fold over `[lo, hi]` INCLUSIVE both ends. Throws on out-of-range or `lo > hi`. `lo == hi` returns that single leaf. |
| `update` | `update(i, value) -> this` | O(log n) | Set leaf `i` to `value` (ABSOLUTE), then fix ancestors. `value` finite (nonnegative integer for the `gcd` kind); out-of-range `i` throws. |
| `at` | `at(i) -> number` | O(1) | The single leaf value. Out-of-range `i` throws. |
| `clear` | `clear() -> this` | O(n) | Resets every element to the fold identity, keeping capacity. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(value, index, tree)` in ascending leaf order. |
| `length` / `kind` | getters | O(1) | Element count / the frozen fold `'min'` \| `'max'` \| `'sum'` \| `'gcd'`. |
| `SegmentTree.build` | `build(values, kind) -> SegmentTree` | O(n) | Bottom-up bulk build (seed leaves, then fold each internal node once deepest-first -- NOT n incremental updates); fails closed on a non-array-like, any non-finite value, or (gcd) any negative / non-integer. |

</details>

### SkipList

<details>
<summary><strong>SkipList</strong> -- Pointer-free ordered map -- get / set / delete / successor / predecessor / rangeIter, expected O(log n).</summary>

A **skip list**: a pointer-free **ordered map** (key -> value) whose `get` / `set` / `delete` / `successor` / `predecessor` are **expected O(log n)** via a probabilistic tower of forward links -- the family's first randomized member and its first pointer-based one. Where the array-embedded members bury a fixed-shape tree in index arithmetic, a skip list's shape is random, so it needs real per-node links; the trick that keeps it zero-GC is storing those links as slot **indices** in flat `Uint32Array` columns over a private free-list (`NodePool`), never as heap objects. `NIL = 0`, slot 0 is the head sentinel, and level generation is one step of the repo's Numerical-Recipes LCG whose high bits draw a geometric height (`1 + clz32(word)`) -- deterministic from an instance-local seed, no `Math.random`. Keys are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed); values are finite numbers; `set` on an existing key updates the value in place (no new node). Every hot op allocates zero bytes after construction.

Honesty note: the hot ops are **expected** O(log n), not worst-case -- an unlucky seed can build a tall thin tower and spike a single op. The witness fits the clean average line **and** separately prints the MAX single insert over a realistic randomized build trace, so the expectation is never sold as a guarantee.

```js
import { SkipList } from '@zakkster/lite-logn';

const sl = new SkipList(1000, 42);   // capacity 1000, seed 42 (deterministic)
sl.set(50, 500);                     // insert key 50 -> value 500
sl.set(20, 200);
sl.set(80, 800);
sl.get(20);            // -> 200
sl.set(20, 222);       // update value in place (no new node)
sl.successor(20);      // -> 50   (smallest key strictly greater)
sl.predecessor(80);    // -> 50   (largest key strictly less)
[...sl.rangeIter(20, 60)];  // -> [20, 50]  (keys in [lo, hi], ascending)
sl.delete(50);         // -> true (idempotent: false if absent)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new SkipList(capacity, seed?)` | O(capacity) | `capacity` integer in `[1, 2^26-1]` (slot indices are `Uint32`, `NIL = 0` reserves slot 0, the `MAXLEVEL`-column stride must stay addressable); `seed` an unsigned 32-bit integer (default fixed). Allocates the typed-array columns + private pool once. |
| `get` | `get(key) -> number \| undefined` | expected O(log n) | The value under `key`, or `undefined` if absent (no throw). Non-finite key throws. |
| `set` | `set(key, value) -> this` | expected O(log n) | Insert `key -> value`, or update the value in place if `key` exists. Non-finite key/value throws; a full pool throws. |
| `delete` | `delete(key) -> boolean` | expected O(log n) | Idempotent: `false` if absent, `true` if removed. Non-finite key throws. |
| `successor` | `successor(key) -> number \| undefined` | expected O(log n) | The smallest key STRICTLY greater than `key`, or `undefined`. `key` need not be present. |
| `predecessor` | `predecessor(key) -> number \| undefined` | expected O(log n) | The largest key STRICTLY less than `key`, or `undefined`. `key` need not be present. |
| `rangeIter` | `rangeIter(lo, hi) -> IterableIterator<number>` | O(log n + k) | Version-stamped iterator over keys in `[lo, hi]` INCLUSIVE, ascending. Bounds may be `+-Infinity` (unbounded ends); `NaN` or `lo > hi` throws; a structural mutation mid-iteration throws. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(key, value, list)` in ascending key order. |
| `clear` | `clear() -> this` | O(capacity) | Empties the list, keeps capacity, resets the PRNG to its initial seed. |
| `size` / `capacity` | getters | O(1) | Live entry count / fixed capacity. |

</details>

### Treap

<details>
<summary><strong>Treap</strong> -- Randomized-balanced order-statistic map -- adds rank / select / split / merge, expected O(log n).</summary>

A **treap**: a randomized, self-balancing **binary search tree** that is also an **order-statistic tree** -- an AUGMENTED ordered map (key -> value) -- the family's balanced BST. It holds two orders at once: a **BST order** on the key and a **max-heap order** on a per-node random priority; a random-priority heap over a BST is provably balanced **in expectation**, so `get` / `set` / `delete` are **expected O(log n)**. A third invariant, a subtree-size column maintained in the SAME pass as every link rewrite, adds `rank(x)` (how many keys are `< x`), `select(k)` (the k-th smallest key), and O(log n) `split` / `merge`. Nodes are slot **indices** in six flat columns (`_key` / `_value` `Float64`; `_left` / `_right` / `_prio` / `_size` `Uint32`, `NIL = 0`) over the SAME private free-list (`NodePool`) SkipList uses -- design-parity, never a heap object per op. Priority is one instance-local Numerical-Recipes LCG draw per insert (deterministic from a seed; ties break by key). Keys and values are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed); `set` on an existing key updates the value in place. Every hot op allocates zero bytes after construction.

Honesty note: the hot ops are **expected** O(log n), not worst-case -- an unlucky priority draw can build a tall thin tree and spike a single op (the rotation chain). The witness fits the clean average line **and** separately prints the MAX single insert. `set` / `delete` / `split` / `merge` recurse to a depth equal to the tree height (O(log n) expected, O(n) worst-case) on the native call stack -- but priorities come from the instance-local LCG, NOT caller-chosen keys, so an adversary cannot force the worst case through the public surface; the recursion allocates zero heap bytes (see [`decisions/0007-treap.md`](./decisions/0007-treap.md)).

```js
import { Treap } from '@zakkster/lite-logn';

const tr = new Treap(1000, 42);   // capacity 1000, seed 42 (deterministic)
tr.set(50, 500);                  // insert key 50 -> value 500
tr.set(20, 200);
tr.set(80, 800);
tr.get(20);            // -> 200
tr.rank(50);           // -> 1    (one key, 20, is strictly less than 50)
tr.select(0);          // -> 20   (the smallest key)
tr.successor(20);      // -> 50   (smallest key strictly greater)
const [lo, hi] = tr.split(50);    // lo: keys < 50; hi: keys >= 50 (share the arena; tr consumed)
const whole = Treap.merge(lo, hi);// fuse back (all lo keys < all hi keys); both consumed
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new Treap(capacity, seed?)` | O(capacity) | `capacity` integer in `[1, 2^31-1]` (slot indices + subtree counts are `Uint32`, `NIL = 0` reserves slot 0); `seed` an unsigned 32-bit integer (default fixed). Allocates the six columns + private pool once. |
| `get` | `get(key) -> number \| undefined` | expected O(log n) | The value under `key`, or `undefined` if absent (no throw). Non-finite key throws. |
| `has` | `has(key) -> boolean` | expected O(log n) | True iff `key` is stored. Non-finite key throws. |
| `set` | `set(key, value) -> this` | expected O(log n) | Insert `key -> value`, or update the value in place if `key` exists. Non-finite key/value throws; a full pool throws. |
| `delete` | `delete(key) -> boolean` | expected O(log n) | Idempotent: `false` if absent, `true` if removed. Non-finite key throws. |
| `rank` | `rank(x) -> number` | expected O(log n) | Count of stored keys STRICTLY less than `x`, in `[0, size]`. `x` need not be present. Non-finite `x` throws. |
| `select` | `select(k) -> number \| undefined` | expected O(log n) | The k-th smallest key (0-based), or `undefined` if `k` is out of `[0, size)`. Non-integer `k` throws. |
| `successor` | `successor(key) -> number \| undefined` | expected O(log n) | The smallest key STRICTLY greater than `key`, or `undefined`. |
| `predecessor` | `predecessor(key) -> number \| undefined` | expected O(log n) | The largest key STRICTLY less than `key`, or `undefined`. |
| `rangeIter` | `rangeIter(lo, hi) -> IterableIterator<number>` | O(k log n) | Version-stamped iterator over keys in `[lo, hi]` INCLUSIVE, ascending. Bounds may be `+-Infinity`; `NaN` or `lo > hi` throws; a structural OR value mutation mid-iteration throws. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(key, value, treap)` in ascending key order. |
| `clear` | `clear() -> this` | O(capacity) | Empties the treap, keeps capacity, resets the PRNG to its initial seed. |
| `split` | `split(key) -> [Treap, Treap]` | expected O(log n) | `[left (keys < key), right (keys >= key)]`; rewires in place, so the two treaps SHARE this treap's arena and this is CONSUMED (left empty). |
| `merge` (static) | `Treap.merge(a, b) -> Treap` | expected O(log n) | Fuse two arena-sharing treaps where every key of `a` < every key of `b`; CONSUMES both. Non-Treap inputs, cross-arena treaps, or an overlapping range throw. |
| `size` / `capacity` | getters | O(1) | Live entry count / fixed capacity. |

</details>

### Scapegoat

<details>
<summary><strong>Scapegoat</strong> -- Deterministic weight-balanced order-statistic map -- worst-case O(log n) get, amortized O(log n) set / delete.</summary>

A **scapegoat tree**: a **DETERMINISTIC**, weight-balanced **binary search tree** that is also an **order-statistic tree** -- an AUGMENTED ordered map (key -> value) -- the honest **pair to Treap**. Where a treap randomizes its shape to be balanced *in expectation*, a scapegoat keeps a hard **worst-case height bound** (`height <= log_{1/alpha}(n) + 1`), so `get` is **worst-case O(log n)** (never merely expected). It pays for that with **amortized O(log n)** `set` / `delete`: after a mutation makes the tree too deep (or, on delete, too sparse), an occasional **subtree rebuild** restores balance in bulk. A subtree-size column (maintained in the same pass as every link rewrite and every rebuild) adds `rank(x)` / `select(k)`, O(log n). **No priorities, no RNG anywhere** -- the shape is a deterministic function of the insert / delete order. Nodes are slot **indices** in five flat columns (`_key` / `_value` `Float64`; `_left` / `_right` / `_size` `Uint32`, `NIL = 0`) over the SAME private free-list (`NodePool`) SkipList and Treap use. Keys and values are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed); `set` on an existing key updates the value in place. Every hot op allocates zero bytes after construction.

Zero-GC rebuild (the load-bearing design call): there is **no fresh array per rebuild**. One `_flat` (`Uint32Array(capacity)`) + one `_stack` (`Uint32Array(capacity+1)`) are allocated at construction and reused every rebuild -- an ITERATIVE, Morris-free in-order flatten (via `_stack`) writes sorted slot indices into `_flat`, and a bounded log-depth balanced rebuild re-links `_left` / `_right` / `_size` on the native call stack. Proven 0 B/op even under a rebuild-HEAVY ascending-insert trace (see [`decisions/0008-scapegoat.md`](./decisions/0008-scapegoat.md)). Unlike Treap there is **no `split` / `merge`**: a scapegoat has no priority heap to merge by, and an honest deterministic split/merge would be O(n) rebuilds -- the documented asymmetry vs Treap. `alpha` (the weight-balance factor) is validated to the OPEN interval `(0.55, 0.75)` -- both ends throw -- and frozen at construction (default `2/3`).

```js
import { Scapegoat } from '@zakkster/lite-logn';

const sg = new Scapegoat(1000);   // capacity 1000, alpha = 2/3 (deterministic, no seed)
sg.set(50, 500);                  // insert key 50 -> value 500
sg.set(20, 200);
sg.set(80, 800);
sg.get(20);            // -> 200                                   -- worst-case O(log n)
sg.rank(50);           // -> 1    (one key, 20, is strictly less than 50)
sg.select(0);          // -> 20   (the smallest key)
sg.successor(20);      // -> 50   (smallest key strictly greater)
[...sg.rangeIter(20, 80)]; // -> [20, 50, 80]  (inclusive, ascending)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new Scapegoat(capacity, alpha?)` | O(capacity) | `capacity` integer in `[1, 2^31-1]` (slot indices + subtree counts are `Uint32`, `NIL = 0` reserves slot 0); `alpha` in the OPEN interval `(0.55, 0.75)` (both ends throw), frozen at construction (default `2/3`). Allocates five columns + private pool + two rebuild scratch buffers once. |
| `get` | `get(key) -> number \| undefined` | worst-case O(log n) | The value under `key`, or `undefined` if absent (no throw). Non-finite key throws. |
| `has` | `has(key) -> boolean` | worst-case O(log n) | True iff `key` is stored. Non-finite key throws. |
| `set` | `set(key, value) -> this` | amortized O(log n) | Insert `key -> value`, or update the value in place if `key` exists (no rebuild). Non-finite key/value throws; a full pool throws. |
| `delete` | `delete(key) -> boolean` | amortized O(log n) | Idempotent: `false` if absent, `true` if removed. Non-finite key throws. |
| `rank` | `rank(x) -> number` | worst-case O(log n) | Count of stored keys STRICTLY less than `x`, in `[0, size]`. `x` need not be present. Non-finite `x` throws. |
| `select` | `select(k) -> number \| undefined` | worst-case O(log n) | The k-th smallest key (0-based), or `undefined` if `k` is out of `[0, size)`. Non-integer `k` throws. |
| `successor` | `successor(key) -> number \| undefined` | worst-case O(log n) | The smallest key STRICTLY greater than `key`, or `undefined`. |
| `predecessor` | `predecessor(key) -> number \| undefined` | worst-case O(log n) | The largest key STRICTLY less than `key`, or `undefined`. |
| `rangeIter` | `rangeIter(lo, hi) -> IterableIterator<number>` | O(k log n) | Version-stamped iterator over keys in `[lo, hi]` INCLUSIVE, ascending. Bounds may be `+-Infinity`; `NaN` or `lo > hi` throws; a structural OR value mutation mid-iteration throws. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(key, value, tree)` in ascending key order. |
| `clear` | `clear() -> this` | O(capacity) | Empties the tree, keeps capacity. |
| `size` / `capacity` / `alpha` | getters | O(1) | Live entry count / fixed capacity / frozen weight-balance factor. |

Member signatures for later members are appended here as each ships.

</details>

### MinMaxHeap

<details>
<summary><strong>MinMaxHeap</strong> -- Double-ended priority queue (DEPQ) -- peekMin / peekMax O(1), push / popMin / popMax O(log n).</summary>

A **min-max heap**: a **double-ended priority queue (DEPQ)** held in ONE array-embedded binary heap whose levels **alternate min / max** (Atkinson, Sack, Santoro & Strothotte 1986). Even depth (the root is depth 0) is a **MIN** level, odd depth a **MAX** level, so the global minimum is the root and the global maximum is the **larger of the root's up-to-two children**. That single alternating heap answers BOTH ends: `peekMin` / `peekMax` / `peekMinKey` / `peekMaxKey` are **O(1)**; `push` / `popMin` / `popMax` are all **worst-case O(log n)** -- no second heap, no paired-heap correspondence to maintain. It uses the BinaryHeap **id + key** idiom (two parallel pointer-free columns: `_id` `Uint32Array`, `_key` `Float64Array`), so it carries an opaque payload per entry with no object nodes. Keys are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed -- the key is checked FIRST, then the id, then a full heap). Every hot op allocates zero bytes after construction.

The asymmetry vs BinaryHeap: MinMaxHeap is **non-addressable**. There is no `_pos` reverse map and therefore deliberately **no `changeKey` / `remove`**; the id is an OPAQUE `Uint32` payload (NOT unique -- duplicates allowed -- over the full `[0, 2^32)` domain, wider than BinaryHeap's `[0, capacity)`). A DEPQ's job is the two extremes; addressability is the separable concern BinaryHeap already carries. There is also **no `kind` argument / getter** (a DEPQ has both ends; a kind getter would be a lie). This is the classic **one-element-per-node** min-max heap; the interval-heap DEPQ (two elements per node) is a deliberately deferred alternative (see [`decisions/0009-minmaxheap.md`](./decisions/0009-minmaxheap.md)). Level parity is computed zero-alloc as `((31 - Math.clz32(i + 1)) & 1) === 0` (min iff even depth); the sifts are hole-punching (one write per level) and every grandchild index is bound-checked against the live size (the classic min-max off-by-one, verified at n = 1, 2, 3, 4).

```js
import { MinMaxHeap } from '@zakkster/lite-logn';

const h = new MinMaxHeap(1000);   // capacity 1000 (no kind: a DEPQ serves both ends)
h.push(1, 5.0);                   // push id 1 with key 5.0
h.push(2, 1.0);
h.push(3, 9.0);
h.peekMinKey();        // -> 1.0                                  -- O(1)
h.peekMaxKey();        // -> 9.0                                  -- O(1)
h.popMin();            // -> 2   (the id at the minimum key)      -- worst-case O(log n)
h.popMax();            // -> 3   (the id at the maximum key)      -- worst-case O(log n)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new MinMaxHeap(capacity)` | O(capacity) | `capacity` integer in `[1, 2^31-1]`. Allocates two typed arrays (`_key` `Float64`, `_id` `Uint32`) once. NO `kind` argument. |
| `push` | `push(id, key) -> void` | worst-case O(log n) | `id` integer in `[0, 2^32)` (opaque, not required unique); `key` finite. Key checked FIRST, then id, then a full heap -- each throws `[lite-logn]` as a no-op (size unchanged). |
| `popMin` | `popMin() -> number \| undefined` | worst-case O(log n) | Removes and returns the id at the minimum key; `undefined` if empty (no throw). |
| `popMax` | `popMax() -> number \| undefined` | worst-case O(log n) | Removes and returns the id at the maximum key; `undefined` if empty (no throw). |
| `peekMin` / `peekMax` | `-> number \| undefined` | O(1) | The id at the minimum / maximum key; `undefined` if empty (never throw). |
| `peekMinKey` / `peekMaxKey` | `-> number \| undefined` | O(1) | The minimum / maximum key; `undefined` if empty (never throw). |
| `clear` | `clear() -> void` | O(1) | Empties the heap, keeps capacity. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(id, key, heap)` in UNSPECIFIED (heap-array) order -- NOT sorted / pop order. |
| `[Symbol.iterator]` | `-> IterableIterator<number>` | O(n) | Yields live ids in UNSPECIFIED (heap-array) order. |
| `size` / `capacity` | getters | O(1) | Live entry count / fixed capacity. |
| `MinMaxHeap.build` | `build(ids, keys, capacity) -> MinMaxHeap` | O(n) | Floyd bulk build from parallel arrays (deepest-first, level-aware sift-down); fails closed on non-array-like / length mismatch, count > capacity, out-of-range id, or non-finite key. |

</details>

### SplayTree

<details>
<summary><strong>SplayTree</strong> -- Self-adjusting ordered map -- amortized O(log n) get / set / delete via top-down splay; hot keys ride near the root.</summary>

A **splay tree**: a **self-adjusting** BST ordered map (key -> value) whose every access **SPLAYS** -- a chain of rotations that walks the touched node (or, for an absent key, the last node on the search path) to the **root** (Sleator & Tarjan 1985). Recently / frequently used keys ride near the top, giving **amortized O(log n)** per op and genuinely **faster-than-log** behaviour on skewed / working-set access. It keeps **no balance metadata**: four parallel pointer-free columns (`_key` / `_value` `Float64Array`, `_left` / `_right` `Uint32Array`) over the same private free-list (NodePool). The splay is **iterative and top-down**: slot 0 (the NIL sentinel) doubles as the splay's dummy header and two fixed scratch hands grow the two assembly trees, so there is **no parent column, no path stack, and no recursion** -- every hot op is 0 B/op and no degenerate chain can overflow the native stack. Keys and values are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed, key checked FIRST).

**A read mutates.** `get` / `has` / `successor` / `predecessor` SPLAY the touched (or closest) node to the root and **bump the iteration version** -- so an in-flight `rangeIter` fails closed even on a read. `rangeIter` / `forEach` / `[Symbol.iterator]` are the only non-mutating reads: NON-splaying in-order walks that leave the tree byte-identical. Because they are non-splaying they **re-descend from the root by key each step** (no parent column, no stack -- the LEAN design), so they cost **O(n * depth)** (`forEach` / iterator) or **O((k + 1) * depth)** (`rangeIter`): that is O(n log n) on a balanced / used tree, but **O(n^2) on a COLD tree built by pure sorted insertion with no intervening access** (a splay tree only self-balances through access -- splay any key, or insert in mixed order, to keep it shallow before a full walk). This is the **LEAN** member: deliberately **no `rank` / `select` / `split` / `merge`** (Treap / Scapegoat carry the augmented / order-statistic surface -- the documented asymmetry), and no seed argument (DETERMINISTIC, no RNG). See [`decisions/0010-splaytree.md`](./decisions/0010-splaytree.md).

```js
import { SplayTree } from '@zakkster/lite-logn';

const sp = new SplayTree(1000);   // capacity 1000 (no seed: deterministic)
sp.set(5, 50);
sp.set(3, 30);
sp.set(9, 90);
sp.get(9);          // -> 90   (and 9 is now the root -- a read splays)   -- amortized O(log n)
sp.successor(5);    // -> 9    (strict; splays the closest node up)
sp.delete(3);       // -> true (splay to root, then join the subtrees)
[...sp];            // -> [5, 9]  (non-splaying ascending walk)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new SplayTree(capacity)` | O(capacity) | `capacity` integer in `[1, 2^31-1]`. Allocates four typed arrays + the free-list once. NO seed (deterministic). |
| `get` | `get(key) -> number \| undefined` | amortized O(log n) | The value under key, or `undefined` if absent (no throw). SPLAYS the touched key to the root + bumps the version. Non-finite key throws. |
| `has` | `has(key) -> boolean` | amortized O(log n) | True iff key is resident. SPLAYS + bumps version. Non-finite key throws. |
| `set` | `set(key, value) -> this` | amortized O(log n) | Insert, or update the value in place if key exists (splay it up first). Non-finite key/value throws; a full pool throws. |
| `delete` | `delete(key) -> boolean` | amortized O(log n) | Splay the target to the root, then JOIN its subtrees. `true` if present, `false` if absent (idempotent). Non-finite key throws. |
| `successor` / `predecessor` | `(key) -> number \| undefined` | amortized O(log n) | The strictly-greater / strictly-less key, or `undefined`. Each SPLAYS the closest node + bumps the version. Non-finite key throws. |
| `rangeIter` | `rangeIter(lo, hi) -> IterableIterator<number>` | O((k + 1) * depth) | Keys in `[lo, hi]` inclusive, ascending; NON-splaying (re-descends per key) + version-stamped (any mutation mid-iteration, INCLUDING a get/has, throws). O(log n + k) on a balanced / used tree, O(k * n) on a cold sorted-built tree (see the read-mutates note above). Bounds may be +-Infinity; NaN or lo > hi throws. |
| `forEach` | `forEach(fn) -> void` | O(n * depth) | Visits `(key, value, tree)` in ascending key order (NON-splaying, re-descends per key). O(n log n) on a balanced / used tree, O(n^2) on a cold sorted-built tree (see note above). |
| `[Symbol.iterator]` | `-> IterableIterator<number>` | O(n * depth) | Yields keys in ascending order (NON-splaying, re-descends per key -- same O(n log n) balanced / O(n^2) cold-sorted caveat as `forEach`). |
| `clear` | `clear() -> this` | O(capacity) | Empties the tree, keeps capacity. |
| `size` / `capacity` | getters | O(1) | Live entry count / fixed capacity. |

</details>

### BinomialHeap

<details>
<summary><strong>BinomialHeap</strong> -- Mergeable priority queue -- O(log n) meld over a shared arena, O(1)-amortized push, O(log n) popMin.</summary>

A **binomial heap**: the family's first **mergeable** priority queue -- a **forest** of heap-ordered binomial trees whose defining op is **`meld`** (union two heaps) in **O(log n)** worst-case, via a **binary carry** over the two order-sorted root lists (the structural analogue of adding two binary numbers; Vuillemin 1978). `push` is **O(1) amortized** (O(log n) worst), `popMin` is **O(log n)** worst (unlink the extreme root, reverse its child list into a new root list, union back, rescan the O(log n) roots), and `peekMin` is **O(1)** via a cached extreme root maintained inline. Six parallel pointer-free columns (`_key` `Float64Array`, `_id` / `_parent` / `_child` / `_sibling` / `_order` `Uint32Array`) over a private free-list (NodePool); `NIL = 0`.

**LEAN + non-addressable** (the MinMaxHeap idiom): the id is an **opaque `Uint32` payload** in `[0, 2^32)` (not unique, no reverse map), so there is deliberately **no `decreaseKey` / `remove` / `changeKey` / `rank` / `select`**. **`kind` ('min' | 'max') is frozen at construction.**

**Shared-arena meld.** A meld rewires roots in place, so two heaps can meld only if they draw from the **same arena**. A standalone `new BinomialHeap(capacity, kind)` owns its own arena; **`BinomialHeap.arena(capacity, kind, count)`** hands out `count` arena-sharing heaps that can meld with one another. `a.meld(b)` **consumes `b`** -- `b` becomes empty (size 0) and **dead**: every later op on `b` throws `[lite-logn]` rather than silently re-enter the now-shared roots. Cross-arena detection is column identity (`a._key !== b._key`); a kind mismatch, a non-BinomialHeap arg, a self-meld, or a consumed operand each throw. See [`decisions/0011-binomialheap.md`](./decisions/0011-binomialheap.md).

```js
import { BinomialHeap } from '@zakkster/lite-logn';

// standalone: owns its own arena
const h = new BinomialHeap(1000, 'min');
h.push(1, 50);
h.push(2, 30);
h.peekMinKey();   // -> 30    -- O(1)
h.popMin();       // -> 2     -- O(log n)

// mergeable: two heaps sharing ONE arena
const [a, b] = BinomialHeap.arena(1000, 'min', 2);
a.push(10, 5); a.push(11, 9);
b.push(20, 3); b.push(21, 7);
a.meld(b);        // -> a (now holds all four); b is consumed (size 0, dead)   -- O(log n)
b.size;           // -> 0
a.popMin();       // -> 20    (key 3, the global minimum)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new BinomialHeap(capacity, kind = 'min')` | O(capacity) | `capacity` integer in `[1, 2^31-1]`; `kind` 'min' or 'max' (frozen). Owns its own arena (six columns + free-list). |
| `BinomialHeap.arena` | `arena(capacity, kind, count) -> BinomialHeap[]` | O(capacity) | `count` empty heaps sharing ONE arena, so any two can meld. `count` integer >= 1. Fails closed on bad capacity / kind / count. |
| `push` | `push(id, key) -> void` | O(1) amortized | Insert opaque id with priority key. Non-finite key (checked FIRST) / out-of-range id / full arena / consumed heap throw. |
| `popMin` | `popMin() -> number \| undefined` | O(log n) | Removes + returns the id at the extreme key; `undefined` if empty (no throw). Consumed heap throws. |
| `peekMin` / `peekMinKey` | `-> number \| undefined` | O(1) | The extreme id / key, or `undefined` if empty. Consumed heap throws. |
| `meld` | `meld(other) -> this` | O(log n) | Folds `other` into this; CONSUMES `other` (empty, dead). Non-BinomialHeap / self / cross-arena / kind-mismatch / consumed operand throw. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(id, key, heap)` in UNSPECIFIED (forest) order -- NOT sorted / pop order. |
| `[Symbol.iterator]` | `-> IterableIterator<number>` | O(n) | Yields live ids in UNSPECIFIED (forest) order. |
| `clear` | `clear() -> this` | O(n) | Frees ONLY this heap's own nodes back to the shared pool (an arena sibling is untouched). |
| `size` / `capacity` / `kind` | getters | O(1) | Live entry count / arena-wide capacity / frozen polarity. |

</details>

### PairingHeap

<details>
<summary><strong>PairingHeap</strong> -- Addressable mergeable priority queue -- O(1) push / meld, amortized O(log n) popMin / decreaseKey / remove by id.</summary>

A **pairing heap**: the mergeable-heap arc's **addressable** priority queue -- a single multi-way heap-ordered tree (left-child / right-sibling) whose defining ops are a cut-and-link **`decreaseKey`** (amortized **O(log n)**) and an **O(1) `meld`** (Fredman, Sedgewick, Sleator, Tarjan 1986). `push` / `peekMin` / `peekMinKey` / `meld` are **O(1)**; `popMin` / `decreaseKey` / `remove` are **amortized O(log n)**. `popMin` unlinks the root then does a **two-pass combine** of the root's child list (pair left-to-right, then fold right-to-left) -- iterative and pointer-free, the `_sibling` links **are** the work list, so no temporary array (0 B/op). Five parallel pointer-free columns (`_key` `Float64Array`, `_id` / `_child` / `_sibling` / `_parent` `Uint32Array` -- `_parent` is a dual-role PREV pointer for O(1) cut) over a private free-list (NodePool); `NIL = 0`.

**Addressable, arena-wide-unique ids (the LOUD contract difference vs BinomialHeap).** Caller ids are **unique integers in `[0, capacity)`**, and the reverse map is **shared across every heap drawing the arena** -- so `decreaseKey(id)` / `remove(id)` / `has(id)` / `keyOf(id)` are addressable by id (BinomialHeap's ids are opaque, non-unique, with no reverse map). A per-slot **owner** tag makes `decreaseKey` / `remove` on an id owned by a **different live sibling heap** an O(1) `[lite-logn]` throw (never a silent cross-heap cut); pushing an id live **anywhere** in the arena throws. `decreaseKey` moves **toward the heap's extreme** (decrease for 'min', increase for 'max'); a move away fails closed. **`kind` ('min' | 'max') is frozen at construction.**

**Shared-arena meld in O(1).** `a.meld(b)` is a single root-link plus a union alias redirecting `b`'s heap id to `a`'s -- **independent of `|b|`, better than BinomialHeap's O(log n) meld**. It **consumes `b`** (empty, size 0, dead: every later op throws), and a melded-in id stays reprioritizable via the surviving heap **without re-tagging every node** (a per-heap map would make meld O(`|b|`), the rejected alternative). Cross-arena detection is column identity (`a._key !== b._key`); a kind mismatch, a non-PairingHeap arg, a self-meld, or a consumed operand each throw. See [`decisions/0012-pairingheap.md`](./decisions/0012-pairingheap.md).

```js
import { PairingHeap } from '@zakkster/lite-logn';

// addressable single heap: reprioritize / remove by id
const pq = new PairingHeap(1000, 'min');
pq.push(7, 50);
pq.push(9, 30);
pq.decreaseKey(7, 10);   // reprioritize entity 7 toward the min   -- amortized O(log n)
pq.peekMin();            // -> 7     (key 10, now the minimum)
pq.remove(9);            // -> true  (addressable delete)          -- amortized O(log n)

// mergeable: two heaps sharing ONE arena, O(1) meld
const [a, b] = PairingHeap.arena(1000, 'min', 2);
a.push(10, 5); b.push(20, 3);
a.meld(b);               // -> a (now holds both); b is consumed (size 0, dead)   -- O(1)
a.decreaseKey(20, -1);   // a melded-in id is still addressable via a
a.peekMin();             // -> 20
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new PairingHeap(capacity, kind = 'min')` | O(capacity) | `capacity` integer in `[1, 2^31-1]` (also the arena-wide id domain); `kind` 'min' or 'max' (frozen). Owns its own arena. |
| `PairingHeap.arena` | `arena(capacity, kind, count) -> PairingHeap[]` | O(capacity) | `count` empty heaps sharing ONE arena (pool + columns + arena-wide reverse map), so any two meld in O(1). `count` integer >= 1. Fails closed on bad capacity / kind / count. |
| `push` | `push(id, key) -> void` | O(1) | Insert unique id with priority key. Non-finite key (checked FIRST) / out-of-range id / arena-wide-duplicate id / full arena / consumed heap throw. |
| `popMin` | `popMin() -> number \| undefined` | amortized O(log n) | Removes + returns the id at the extreme key (two-pass combine); `undefined` if empty (no throw). Consumed heap throws. |
| `peekMin` / `peekMinKey` | `-> number \| undefined` | O(1) | The extreme id / key, or `undefined` if empty. Consumed heap throws. |
| `decreaseKey` | `decreaseKey(id, newKey) -> void` | amortized O(log n) | Reprioritize `id` TOWARD the extreme (cut + link at root). Non-finite key (FIRST) / out-of-range / non-member / sibling-owned id / move-away / consumed heap throw. |
| `remove` | `remove(id) -> boolean` | amortized O(log n) | Delete `id` (cut + two-pass-combine children); `true` if present, `false` if absent. Out-of-range / sibling-owned id / consumed heap throw. |
| `has` / `keyOf` | `has(id) -> boolean` / `keyOf(id) -> number \| undefined` | O(1) | Membership / key over the arena-wide reverse map (`false`/`undefined` for a sibling-owned or absent id). Out-of-range id / consumed heap throw. |
| `meld` | `meld(other) -> this` | O(1) | Folds `other` into this (single root-link + alias); CONSUMES `other` (empty, dead). Non-PairingHeap / self / cross-arena / kind-mismatch / consumed operand throw. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(id, key, heap)` in UNSPECIFIED (forest) order -- NOT sorted / pop order. |
| `[Symbol.iterator]` | `-> IterableIterator<number>` | O(n) | Yields live ids in UNSPECIFIED (forest) order. |
| `clear` | `clear() -> this` | O(n) | Frees ONLY this heap's own nodes back to the shared pool (an arena sibling is untouched). |
| `size` / `capacity` / `kind` | getters | O(1) | Live entry count / arena-wide capacity / frozen polarity. |

</details>

### FibonacciHeap

<details>
<summary><strong>FibonacciHeap</strong> -- Textbook-optimal addressable mergeable heap -- O(1)-amortized push / meld / decreaseKey, O(log n) popMin / remove.</summary>

A **Fibonacci heap**: the mergeable-heap arc's **finale** -- the textbook-optimal **addressable** mergeable priority queue (Fredman & Tarjan 1984). `push` / `meld` / `decreaseKey` are **O(1) amortized**; `popMin` / `remove` are **O(log n) amortized**. It shares PairingHeap's **addressable, arena-wide-unique id** contract (a shared reverse map + per-slot owner tag; a sibling-owned `decreaseKey`/`remove` fails closed; a live-anywhere id cannot be re-pushed). Where PairingHeap reaches the amortized bounds with a lean two-pass combine (and usually **wins** wall-clock), FibonacciHeap reaches them by the full textbook machine: a lazy forest of heap-ordered trees on **circular** doubly-linked lists (root list AND each child list circular), a **`decreaseKey`** that cuts a node's subtree to the root and **cascades** up its former parent chain (a marked parent is cut too; the first unmarked non-root parent is marked and the walk stops) governed by a per-node **`_mark` Uint8 column**, and a **`popMin`** that consolidates the root list by degree via a preallocated per-arena degree bucket. Eight pointer-free columns (`_key` `Float64Array`; `_id` / `_left` / `_right` / `_child` / `_parent` / `_degree` `Uint32Array`; `_mark` `Uint8Array`) + the arena-wide `_pos` reverse map + per-slot `_owner` + union-find `_alias` + the degree `_bucket`, over a private free-list (NodePool); `NIL = 0`.

**The degree bucket is sized to the golden-ratio bound, not `ceil(log2 cap)`.** A Fibonacci heap's max degree is `D(n) <= floor(log_phi n) ~ 1.44 * log2 n` -- **larger** than `log2 n`. A bucket sized `ceil(log2 cap)` would be ~44% short and a consolidation would write past its end (a silent typed-array no-op whose read of `undefined` corrupts the forest), so `_bucket` is sized to the `log_phi` bound + slack, and cleared per call in `O(maxDegree)` (only touched slots reset -- never left stale). See [`decisions/0013-fibonacciheap.md`](./decisions/0013-fibonacciheap.md).

**Honesty (the load-bearing claim).** FibonacciHeap is textbook-optimal in **asymptotics** but **often slower wall-clock** than Pairing / Binary on real hardware (large constant factors, long spikes) -- it is shipped for completeness and teaching, and the benchmark shows it losing plainly. The witness **discloses** (never gates) both the MAX single `popMin` (a long consolidation) and the MAX single `decreaseKey` (a cascading-cut spike). Its `popMin` witness R^2 gates on the **median of 7** independent sweep-fits (a single fit is flaky ~0.981-0.988 and can dip below the 0.958 floor across meta-runs); measurement-quality only -- the frozen floor and slope band are untouched, and no "every run" is claimed.

**Shared-arena meld in O(1).** `a.meld(b)` concatenates the two circular root lists + a union alias redirecting `b`'s heap id to `a`'s + a cached-extreme update -- **independent of `|b|`**, and **without re-tagging every node** (a per-node owner retag would make meld O(`|b|`), the rejected alternative). It **consumes `b`** (empty, size 0, dead: every later op throws). Cross-arena detection is column identity (`a._key !== b._key`); a kind mismatch, a non-FibonacciHeap arg, a self-meld, or a consumed operand each throw.

```js
import { FibonacciHeap } from '@zakkster/lite-logn';

// addressable single heap: reprioritize / remove by id
const pq = new FibonacciHeap(1000, 'min');
pq.push(7, 50);
pq.push(9, 30);
pq.decreaseKey(7, 10);   // reprioritize entity 7 toward the min   -- O(1) amortized (cascading cut)
pq.peekMin();            // -> 7     (key 10, now the minimum)
pq.remove(9);            // -> true  (addressable delete)          -- O(log n) amortized
pq.popMin();             // -> 7     (degree consolidation)        -- O(log n) amortized

// mergeable: two heaps sharing ONE arena, O(1) meld
const [a, b] = FibonacciHeap.arena(1000, 'min', 2);
a.push(10, 5); b.push(20, 3);
a.meld(b);               // -> a (now holds both); b is consumed (size 0, dead)   -- O(1)
a.decreaseKey(20, -1);   // a melded-in id is still addressable via a
a.peekMin();             // -> 20
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new FibonacciHeap(capacity, kind = 'min')` | O(capacity) | `capacity` integer in `[1, 2^31-1]` (also the arena-wide id domain); `kind` 'min' or 'max' (frozen). Owns its own arena. |
| `FibonacciHeap.arena` | `arena(capacity, kind, count) -> FibonacciHeap[]` | O(capacity) | `count` empty heaps sharing ONE arena (pool + columns + reverse map + degree bucket), so any two meld in O(1). `count` integer >= 1. Fails closed on bad capacity / kind / count. |
| `push` | `push(id, key) -> void` | O(1) amortized | Insert unique id with priority key. Non-finite key (checked FIRST) / out-of-range id / arena-wide-duplicate id / full arena / consumed heap throw. |
| `popMin` | `popMin() -> number \| undefined` | amortized O(log n) | Removes + returns the id at the extreme key (splice children + degree consolidation); `undefined` if empty (no throw). Consumed heap throws. |
| `peekMin` / `peekMinKey` | `-> number \| undefined` | O(1) | The extreme id / key, or `undefined` if empty. Consumed heap throws. |
| `decreaseKey` | `decreaseKey(id, newKey) -> void` | amortized O(1) | Reprioritize `id` TOWARD the extreme (cut + cascading cut). Non-finite key (FIRST) / out-of-range / non-member / sibling-owned id / move-away / consumed heap throw. |
| `remove` | `remove(id) -> boolean` | amortized O(log n) | Delete `id` (cut + cascade + splice-children consolidation); `true` if present, `false` if absent. Out-of-range / sibling-owned id / consumed heap throw. |
| `has` / `keyOf` | `has(id) -> boolean` / `keyOf(id) -> number \| undefined` | O(1) | Membership / key over the arena-wide reverse map (`false`/`undefined` for a sibling-owned or absent id). Out-of-range id / consumed heap throw. |
| `meld` | `meld(other) -> this` | O(1) | Folds `other` into this (circular-list concat + alias); CONSUMES `other` (empty, dead). Non-FibonacciHeap / self / cross-arena / kind-mismatch / consumed operand throw. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(id, key, heap)` in UNSPECIFIED (forest) order -- NOT sorted / pop order. |
| `[Symbol.iterator]` | `-> IterableIterator<number>` | O(n) | Yields live ids in UNSPECIFIED (forest) order. |
| `clear` | `clear() -> this` | O(n) | Frees ONLY this heap's own nodes back to the shared pool (an arena sibling is untouched). |
| `size` / `capacity` / `kind` | getters | O(1) | Live entry count / arena-wide capacity / frozen polarity. |

</details>

### Fenwick2D

<details>
<summary><strong>Fenwick2D</strong> -- 2D Fenwick / BIT -- point-update AND rectangle-sum O(log^2 n); sum-only, index-addressed.</summary>

A **2D Fenwick tree** (2D Binary Indexed Tree): the family's **first 2D / multi-dimensional** member, lifting the 1D Fenwick's lowest-set-bit walk (`i & -i`) to a rectangle. BOTH point-`update` AND 2D-`prefix` -- and therefore arbitrary axis-aligned **rectangle** sums via inclusion-exclusion -- in **O(log^2 n)** = O(log rows * log cols) over a **single** flat `Float64Array((rows+1)*(cols+1))`. Public coords are **0-based** in `[0, rows) x [0, cols)`; internally the tree is 1-based, so row 0 and col 0 are the unused identity sentinels (never read as data -- null is not zero). `update` climbs BOTH dims by the lowest set bit (an outer rows loop, an inner cols loop, one `_t` touch per `(i, j)` level pair); `prefix` descends both; `rectSum` inlines the 2D inclusion-exclusion `P(r2,c2) - P(r1-1,c2) - P(r2,c1-1) + P(r1-1,c1-1)` (when `r1 == 0` / `c1 == 0` the `P(-1, .)` terms vanish by a `k = 0` loop-skip -- never a `prefix(-1)` / `_t[-1]` read). Dims are frozen at construction; `(rows+1)*(cols+1)` is capped at `F2D_MAX_CELLS` (`2^31-1`) by a **float multiply** (never `| 0`, which would wrap a large product to a small int and fail OPEN). Values are finite numbers (negatives allowed); NaN / +-Infinity / non-number fail closed. Every hot op allocates zero bytes after construction.

**SUM-ONLY, index-addressed (the 1D Fenwick's boundary, lifted).** `rectSum` works ONLY because subtraction inverts addition -- so there is deliberately **NO 2D min / max / gcd** (a BIT has no inverse for them; those are what **SegmentTree2D**, shipped in v0.13.0, is for) and **NO `changeKey` / `rank` / `select`** (it is indexed by position, not keyed). It is a WORST-case member: every op is worst-case O(log^2 n), so there is no MAX-single-op disclosure line.

**Two-pass linear build.** `Fenwick2D.build(matrix)` is O(rows*cols): seed each cell, then propagate in TWO SEPARATE passes (cols within each row, THEN rows). Fusing the passes DOUBLE-COUNTS -- the test suite proves `build` equals the same cells inserted by repeated `update`.

```js
import { Fenwick2D } from '@zakkster/lite-logn';

const grid = new Fenwick2D(1000, 1000);   // a 1000 x 1000 grid, one flat Float64Array
grid.update(3, 7, 5);                      // add 5 at (row 3, col 7)  -- O(log^2 n)
grid.set(3, 7, 2);                         // absolute set             -- O(log^2 n)
grid.rectSum(0, 0, 3, 7);                  // sum of the [0..3] x [0..7] rectangle, inclusive
grid.at(3, 7);                             // the single cell = a 1x1 rectangle

// bulk build from a dense matrix (O(rows*cols), no double-count)
const fromMatrix = Fenwick2D.build([[1, 2, 3], [4, 5, 6]]);
fromMatrix.rectSum(0, 0, 1, 2);            // 21
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new Fenwick2D(rows, cols)` | O(rows*cols) | `rows`, `cols` integers >= 1, frozen. Allocates one `Float64Array((rows+1)*(cols+1))`. Throws when `(rows+1)*(cols+1)` exceeds `F2D_MAX_CELLS` (2^31-1) -- a float multiply, never `\| 0`. |
| `rows` / `cols` | getters | O(1) | The frozen row / column count. |
| `update` | `update(r, c, delta) -> this` | O(log^2 n) | Add `delta` at 0-based `(r, c)` (climb both dims by `i & -i`). Non-finite delta (typeof-guarded first) / out-of-range coord throw. |
| `prefix` | `prefix(r, c) -> number` | O(log^2 n) | Sum of the rectangle `[0..r] x [0..c]` INCLUSIVE. `prefix(-1, .)` / `prefix(., -1)` are `0` (empty-prefix base case); valid domain `[-1, rows) x [-1, cols)`. |
| `rectSum` | `rectSum(r1, c1, r2, c2) -> number` | O(log^2 n) | Sum of `[r1..r2] x [c1..c2]` INCLUSIVE on all four edges, via 2D inclusion-exclusion. Out-of-range or `r1 > r2` / `c1 > c2` throw. |
| `at` | `at(r, c) -> number` | O(log^2 n) | The single cell = the 1x1 rectangle sum. Out-of-range coord throws. |
| `set` | `set(r, c, value) -> this` | O(log^2 n) | Set cell `(r, c)` to `value` (ABSOLUTE), via `update(r, c, value - at(r, c))`. Non-finite value (typeof-guarded first) / out-of-range coord throw. |
| `clear` | `clear() -> this` | O(rows*cols) | Zero every cell in place, keeping the fixed dimensions. |
| `forEach` | `forEach(fn) -> void` | O(rows*cols*log^2 n) | Visits `(value, r, c, fenwick2d)` in row-major ascending order (`r` outer, `c` inner). 0 B/op in the loop body. |
| `Fenwick2D.build` | `build(matrix) -> Fenwick2D` | O(rows*cols) | LINEAR bulk build in TWO SEPARATE passes (cols within each row, then rows -- fusing them double-counts). Fails closed on a non-2D-array-like, ragged rows, or any non-finite entry. |

Member signatures for later members are appended here as each ships.

</details>

### SegmentTree2D

<details>
<summary><strong>SegmentTree2D</strong> -- 2D segment tree of segment trees -- rectangle min / max / sum / gcd + point-update O(log^2 n); the fold a 2D BIT cannot do.</summary>

A **2D segment tree** -- a segment tree OF segment trees (a tree of trees): the general 2D rectangle **fold** a 2D BIT cannot do. BOTH point-`update` AND rectangle-`query` (min / max / sum / gcd) over any axis-aligned rectangle in **O(log^2 n)** = O(log rows * log cols) over a **single** flat `Float64Array(4 * rows * cols)` -- the exact iterative `2R x 2C` embedding of the 1D SegmentTree's `2n` layout in both dimensions. `SegmentTree2D : Fenwick2D :: SegmentTree (1D) : Fenwick (1D)` -- it lifts the exact rectangle MIN / MAX / GCD that Fenwick2D lists as its not-for. The fold is chosen ONCE at construction (a small-int `_k` combined by an inline switch -- no per-op closure, no megamorphic call site). `update` writes the leaf, climbs the leaf ROW's col-tree at column `c`, THEN climbs the ROW-tree -- at each row-ancestor it recomputes the changed leaf column from its two row-children FIRST, then fixes that row-node's col-tree up column `c`'s path (the inner-then-outer order is the correctness site). `query` descends the OUTER row dim half-open, collecting O(log rows) boundary row-nodes and folding an INNER col-range over each (double `l & 1` / `r & 1` picks in both dims) into one identity-seeded accumulator. Public coords are 0-based in `[0, rows) x [0, cols)`. Every hot op allocates zero bytes after construction.

**General fold, commutative + associative only.** Correct for min / max / sum / gcd (the iterative `2n` layout is order-agnostic); a non-commutative fold (matrix product, affine composition) would need a pow2 layout and is out of scope, as is lazy range-update (point-update only). The identity fills cleared / unused cells and is a legal RESULT (a cleared min grid queries `+Infinity`) but never a legal INPUT: NaN / +-Infinity fail closed (typeof-guarded first), and the `gcd` kind additionally rejects negatives / non-integers. It is a WORST-case member: every op is worst-case O(log^2 n), so there is no MAX-single-op disclosure line.

**Space is the co-headline.** `4 * rows * cols` cells -- ~4x a 2D BIT's `(rows+1)*(cols+1)` -- the honest price for the general (non-invertible) folds. `4 * rows * cols` is capped at `S2D_MAX_CELLS` (`2^31-1`) by a **float multiply** (never `| 0`, which would wrap a large product to a small int and fail OPEN).

**Two-phase linear build.** `SegmentTree2D.build(matrix, kind)` is O(rows*cols): fold each row's col-tree, THEN fold the row-tree position-wise -- NOT rows*cols updates.

```js
import { SegmentTree2D } from '@zakkster/lite-logn';

const grid = new SegmentTree2D(1000, 1000, 'min');   // a 1000 x 1000 min-grid, one flat Float64Array
grid.update(3, 7, 5);                                 // set (row 3, col 7) = 5   -- O(log^2 n)
grid.query(0, 0, 3, 7);                               // min over the [0..3] x [0..7] rectangle, inclusive
grid.at(3, 7);                                         // the single stored cell    -- O(1)

// bulk build from a dense matrix (O(rows*cols), two-phase)
const fromMatrix = SegmentTree2D.build([[4, 2, 6], [1, 9, 3]], 'max');
fromMatrix.query(0, 0, 1, 2);                         // 9
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new SegmentTree2D(rows, cols, kind)` | O(rows*cols) | `rows`, `cols` integers >= 1; `kind` `'min'` / `'max'` / `'sum'` / `'gcd'`, frozen. Allocates one `Float64Array(4*rows*cols)` (min/max filled with the fold identity). Throws when `4*rows*cols` exceeds `S2D_MAX_CELLS` (2^31-1) -- a float multiply, never `\| 0`. |
| `rows` / `cols` / `kind` | getters | O(1) | The frozen dimensions and fold. |
| `query` | `query(r1, c1, r2, c2) -> number` | O(log^2 n) | The fold over `[r1..r2] x [c1..c2]` INCLUSIVE on all four edges. Out-of-range or `r1 > r2` / `c1 > c2` throw. A fresh / cleared grid queries to the identity. |
| `update` | `update(r, c, value) -> this` | O(log^2 n) | Set cell `(r, c)` to `value` (ABSOLUTE), fixing every affected fold (inner col-tree, then outer row-tree). Non-finite value (typeof-guarded first; nonnegative integer for `gcd`) / out-of-range coord throw. |
| `at` | `at(r, c) -> number` | O(1) | The single stored leaf value at `(r, c)`. Out-of-range coord throws. |
| `clear` | `clear() -> this` | O(rows*cols) | Reset every cell to the fold identity, keeping the fixed dimensions and kind. |
| `forEach` | `forEach(fn) -> void` | O(rows*cols) | Visits `(value, r, c, tree)` in row-major ascending order (`r` outer, `c` inner). 0 B/op in the loop body. |
| `SegmentTree2D.build` | `build(matrix, kind) -> SegmentTree2D` | O(rows*cols) | Two-phase bottom-up bulk build (fold each row's col-tree, then the row-tree position-wise -- NOT rows*cols updates). Fails closed on a non-2D-array-like, ragged rows, or any non-finite (or out-of-domain gcd) entry. |

</details>

### SortedArray

<details>
<summary><strong>SortedArray</strong> -- Read-optimized ordered map over parallel sorted arrays -- O(log n) get / rank / successor, O(1) select / keyAt / valueAt / min / max, O(n) writes.</summary>

A **dynamic, read-optimized, key -> value ordered map** over TWO parallel SORTED typed arrays: `_key` (a `Float64Array` kept ASCENDING) and `_value` (parallel, at the same index). The family's FIFTH ordered structure (after SkipList / Treap / Scapegoat / SplayTree); its differentiator is **contiguous storage**. Keys live packed in a flat array rather than scattered across pointer-chased nodes, so it is the **fastest `forEach`** (a straight cache-friendly scan), has **O(1)** `select` / `keyAt` / `valueAt` (a raw array index) and **O(1)** `min` / `max` (index `0` / `size-1`), and **O(log n)** `get` / `has` / `rank` / `successor` / `predecessor` via ONE shared branch-free lower-bound binary search (`_lb`, which the whole surface reuses). Keys are UNIQUE; `set` UPDATES the value in place when the key exists (O(log n), no shift). Keys AND values are finite numbers, typeof-guarded FIRST (before any coercion) at the door of every mutating op, so Symbol / BigInt / NaN / +-Infinity fail closed -- null is not zero. Fixed capacity: `set` overflow throws, never silently drops. Every read op allocates zero bytes after construction.

**Read-optimized: O(log n) reads, O(n) writes DISCLOSED.** The honest cost is the write: a genuine `set` insert shifts the tail up one slot and `delete` shifts it down one -- an in-place `copyWithin` on the preallocated column (no temp, no spread), so it is **O(n)** yet still **0 B/op**. This is the read-optimized dual of the pointer-based ordered maps: they buy O(log n) writes with pointer-chasing; SortedArray buys the fastest reads + iteration with O(n) writes. It is literally the sorted-array FOIL the earlier ordered members were measured against, now a first-class member -- the "reads dominate, writes rare" ordered map. The gated witness op is `get` (WORST-CASE O(log n), like Scapegoat.get -- deterministic, no RNG); the O(n) insert is a DISCLOSED max-single-op bar, NEVER gated. See [`decisions/0016-sortedarray.md`](./decisions/0016-sortedarray.md).

```js
import { SortedArray } from '@zakkster/lite-logn';

const sa = new SortedArray(1024);   // capacity 1024, two flat Float64Array columns
sa.set(50, 5.0);                    // key 50 -> value 5.0   -- O(log n) locate + O(n) shift
sa.set(20, 2.0);
sa.set(80, 8.0);
sa.set(20, 2.5);                    // key present -> value UPDATED in place (no shift), O(log n)
sa.get(20);                         // -> 2.5              (O(log n) binary search)
sa.min();                           // -> 20               (O(1), index 0)
sa.max();                           // -> 80               (O(1), index size-1)
sa.select(1);                       // -> 50               (the 1st-smallest KEY, O(1))
sa.valueAt(1);                      // -> 5.0              (its parallel value, O(1))
sa.rank(50);                        // -> 1                (keys strictly < 50)
sa.successor(50);                   // -> 80   sa.predecessor(50); // -> 20
[...sa.rangeIter(20, 60)];          // -> [20, 50]         (O(log n + k), ascending, version-stamped)

// O(n log n) bulk build from two parallel array-likes (sort once, load once):
const built = SortedArray.build([9, 1, 5], [90, 10, 50]);
built.get(5);                       // -> 50
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new SortedArray(capacity)` | O(capacity) | `capacity` integer in `[1, 2^31-1]`, frozen. Allocates the two `Float64Array(capacity)` columns once. Throws when `capacity` exceeds `SA_MAX_CAPACITY` (2^31-1). |
| `size` / `capacity` | getters | O(1) | Live entry count / fixed capacity. |
| `get` | `get(key) -> number \| undefined` | O(log n) | The value under `key`, or `undefined` if absent (never throws on a miss). One lower-bound search + one equality check. Non-finite key (typeof-guarded first) throws. |
| `has` | `has(key) -> boolean` | O(log n) | True iff `key` is resident. Non-finite key throws. |
| `set` | `set(key, value) -> this` | O(n) (O(log n) update) | Insert, or UPDATE the value in place if `key` exists (O(log n), no shift). A genuine insert `copyWithin`-shifts the tail up one slot (the DISCLOSED max-single-op cost, never gated). Non-finite key / value or a full map throw as a no-op. |
| `delete` | `delete(key) -> boolean` | O(n) | Idempotent: `false` if absent (no throw), `true` if removed. O(log n) to locate, O(n) to `copyWithin`-shift the tail down one slot. |
| `rank` | `rank(x) -> number` | O(log n) | Count of stored keys STRICTLY LESS than `x`, in `[0, size]`. `x` need not be present. Non-finite `x` throws. |
| `select` / `keyAt` | `select(k) -> number \| undefined` | O(1) | The k-th smallest KEY (0-based order statistic) = a raw array index. Out-of-range `k` returns `undefined`; non-integer `k` throws. |
| `valueAt` | `valueAt(k) -> number \| undefined` | O(1) | The VALUE parallel to the key at order-statistic index `k`. Out-of-range `k` returns `undefined`; non-integer `k` throws. |
| `successor` / `predecessor` | `successor(key) -> number \| undefined` | O(log n) | The smallest key strictly `>` (successor) / largest strictly `<` (predecessor) `key`, or `undefined`. `key` need not be present. Non-finite key throws. |
| `min` / `max` | `min() -> number \| undefined` | O(1) | The smallest / largest key (index `0` / `size-1`); `undefined` if empty. |
| `rangeIter` | `rangeIter(lo, hi) -> IterableIterator<number>` | O(log n + k) | Keys in `[lo, hi]` INCLUSIVE, ascending; a lower-bound seek then a contiguous walk. VERSION-STAMPED: any structural mutation mid-iteration throws `[lite-logn]`. Bounds may be +-Infinity; NaN or `lo > hi` throws. |
| `clear` | `clear() -> this` | O(1) | Resets the size counter (stale slots never read), keeping the fixed capacity; bumps the version so any live iterator fails closed. |
| `forEach` | `forEach(fn) -> void` | O(n) | Visits `(key, value, sortedArray)` in ascending key order -- a CONTIGUOUS scan, the fastest forEach in the family. NOT version-stamped. 0 B/op in the loop body (pass a hoisted callback). |
| `SortedArray.build` | `build(keys, values) -> SortedArray` | O(n log n) | Bulk build from two parallel array-likes: sort once by key, load into a fresh map sized to the count. Fails closed on a non-array-like, length mismatch, count outside `[1, 2^31-1]`, any non-finite key / value, or a DUPLICATE key. |

Member signatures for later members are appended here as each ships.

</details>

### PersistentSegTree

<details>
<summary><strong>PersistentSegTree</strong> -- Fully persistent (branching) segment tree via path-copying -- update -> a new version in O(log n), any past version stays queryable; query / at O(log n).</summary>

A **fully persistent (branching) segment tree** via **path-copying**: an associative range-fold (min / max / sum / gcd, frozen at construction) over a fixed-length array where **every version is preserved and queryable forever, and any version can be branched off**. It is the family's FIRST persistent structure and its FIRST **bump/append allocator**. `update(fromVersion, i, value)` does NOT mutate `fromVersion` -- it returns a NEW dense version whose root SHARES every off-path subtree with the parent and owns a freshly-copied O(log n) root-to-leaf path (H + 1 nodes, H = ceil(log2 n)). It is the time-travel complement to the flat **SegmentTree** (member 3): that one is a single mutable timeline over a `Float64Array(2n)`; this one is a persistent DAG of immutable nodes -- the "what-if / undo / audit-every-version" segment tree.

**The load-bearing idiom: a BUMP/APPEND allocator, NOT the free-list pool.** Persistent nodes are IMMUTABLE, SHARED across versions, and NEVER individually freed -- freeing a shared node would corrupt every version that still points at it. So the allocator is a single monotonic `_next` cursor into three preallocated columns (`_val` `Float64Array`, `_left` / `_right` `Uint32Array`; `NIL = 0` reserves slot 0). This is the DELIBERATE distinction from SkipList / Treap / Scapegoat / SplayTree, which bind the free-list `NodePool` (their nodes are mutable and owned by ONE timeline). There is no `free()`; `clear()` is the only reset (rewind `_next`, re-seed v0). Capacity is **by version count**: `new PersistentSegTree(length, versionCapacity, kind)` takes the max updates (extra versions beyond v0); the node budget `1 + (2n-1) + versionCapacity*(H+1)` is sized INTERNALLY and guarded by a FLOAT product against `PST_MAX_NODES` (never `| 0`, which would fail OPEN). Both arenas FAIL CLOSED. Values are ABSOLUTE point-set, typeof-guarded FIRST (Symbol / BigInt / NaN / +-Infinity fail closed; the gcd kind also rejects negative / non-integer). The gated witness op is `query` (WORST-CASE O(log n), on the DEFAULT log2(n) axis); its O(n) linear-scan foil leaves the line. See [`decisions/0017-persistentsegtree.md`](./decisions/0017-persistentsegtree.md).

```js
import { PersistentSegTree } from '@zakkster/lite-logn';

// A running-sum tree over 8 slots, room for 16 updates (extra versions beyond v0):
const t = new PersistentSegTree(8, 16, 'sum');
const v1 = t.update(0, 3, 5);       // v0 untouched; v1 = v0 with slot 3 := 5   -- O(log n)
const v2 = t.update(v1, 5, 2);      // v2 branches off v1 with slot 5 := 2      -- O(log n)
const v3 = t.update(0, 3, 9);       // v3 branches off v0 (NOT v2) -- fully persistent

t.query(v2, 0, 7);                  // -> 7    (5 + 2 over the whole range)     -- O(log n)
t.query(v1, 0, 7);                  // -> 5    (v1 never saw the slot-5 update)
t.query(0, 0, 7);                   // -> 0    (v0 is still the empty identity)
t.at(v3, 3);                        // -> 9    (a single-leaf read)             -- O(log n)
t.versions;                         // -> 4    (v0, v1, v2, v3 all live)

// O(n) snapshot build of version 0 (NOT n updates):
const b = PersistentSegTree.build([1, 2, 3, 4], 8, 'max');
b.query(0, 0, 3);                   // -> 4
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new PersistentSegTree(length, versionCapacity, kind)` | O(n) | `length` integer in `[1, 2^30-1]`; `versionCapacity` the max updates (extra versions beyond v0), integer `>= 1`; `kind` `'min'` \| `'max'` \| `'sum'` \| `'gcd'`. Sizes the node arena internally; throws (FLOAT-product guard) when the budget exceeds `PST_MAX_NODES` (2^31-1). Seeds version 0 to the fold identity. |
| `length` / `versions` / `versionCapacity` / `kind` | getters | O(1) | Element count / live version count (dense handles `0 .. versions-1`) / max updates sized for / the frozen fold. |
| `query` | `query(version, lo, hi) -> number` | O(log n) | The fold over `[lo, hi]` INCLUSIVE in `version`, a read-only descent (the gated witness op). Unknown / out-of-range version, out-of-range `lo` / `hi`, or `lo > hi` throws. `lo == hi` returns that leaf; an unwritten cell reads the fold identity. |
| `at` | `at(version, i) -> number` | O(log n) | The single element at 0-based leaf `i` in `version` (no range fold). Unknown version or out-of-range index throws. |
| `update` | `update(fromVersion, i, value) -> number` | O(log n) | Set element `i` to `value` (ABSOLUTE) in a NEW version branched off `fromVersion` WITHOUT touching it; returns the new dense version handle. Copies exactly the root-to-leaf path (H + 1 slots), shares every off-path subtree (0 B/op). Fails closed as a NO-OP on an unknown `fromVersion`, a non-finite value (checked first), a gcd-kind negative / non-integer, an out-of-range index, or a FULL version arena. |
| `clear` | `clear() -> this` | O(n) | Discard every version and value, rewind the bump cursor, and re-seed a fresh identity version 0 -- keeping the fixed capacity. Any handle `>= 1` from before `clear` is invalid. |
| `PersistentSegTree.build` | `build(values, versionCapacity, kind) -> PersistentSegTree` | O(n) | O(n) seed of version 0 from an array-like (a snapshot, NOT n updates). Fails closed BEFORE the tree is usable on a non-array-like, any non-finite entry, or (gcd kind) any negative / non-integer entry. |

There is deliberately NO `forEach` / `[Symbol.iterator]` (a persistent DAG has no single live timeline to iterate) and NO free-list `delete` (nodes are immutable and shared) -- the documented asymmetry vs the flat SegmentTree.

Member signatures for later members are appended here as each ships.

</details>

### MergeSortTree

<details>
<summary><strong>MergeSortTree</strong> -- Static, immutable offline range-RANK tree -- countLE / rangeCount over an index range in worst-case O(log^2 n), zero-allocation.</summary>

A **static, immutable offline range-rank tree**: over any INDEX range `[lo, hi]` of a fixed sequence it answers `countLE(lo, hi, x)` (how many stored values are <= x) and `rangeCount(lo, hi, vlo, vhi)` (how many fall in the value-window `[vlo, vhi]`) in **worst-case O(log^2 n)**, zero-allocation. It is the family's FIRST truly IMMUTABLE member and its FIRST offline range-RANK structure. It is the SECOND static member after **SortedArray**, but the first that is truly immutable: SortedArray is read-optimized-but-mutable, whereas MergeSortTree COPIES its source in at construction and has NO mutators -- the SparseTable / lite-o1 static-member honesty contract.

**The load-bearing idiom: a segment tree of SORTED runs in ONE flat array.** Every node stores the SORTED array of its index-range, packed by LEVEL into ONE preallocated `Float64Array` of exactly `n * (ceil(log2 n) + 1)` cells (a node at level `d` covering real index range `[rl, rr)` has its run at flat offset `d * n + rl`). The leaf level is the source in index order (trivially-sorted 1-element runs); each higher level is built BOTTOM-UP by MERGING each node's two adjacent child runs into a disjoint region (no scratch buffer), giving the O(n log n) build. `countLE` descends the O(log n) CANONICAL nodes fully inside `[lo, hi]` and branch-free binary-searches each node's sorted run (O(log n) nodes x O(log n) per search = O(log^2 n)); `rangeCount` is `countLE(vhi) - countLT(vlo)` over the same decomposition (a private STRICT-less descent), exact even for float bounds. It is **PLAIN O(log^2 n) with NO fractional cascading** (rejected: it buys O(log n) but wrecks the flat, pointer-free zero-GC layout and is far harder to teach). The kth-smallest-in-range ORDER STATISTIC is DELIBERATELY NOT shipped (a different algorithm; routed to a future WaveletTree) -- this member ships the range-RANK primitives only. The **O(n log n) BUILD and O(n log n) SPACE** (`n * (ceil(log2 n) + 1)` cells) are a DISCLOSED co-headline, never hidden. Fail closed: the source must be an array-like of FINITE numbers (typeof-guarded FIRST; Symbol / BigInt / NaN / +-Infinity fail closed), the length an integer in `[1, MST_MAX_LENGTH]`, and the `(H+1)*n` cell product guarded by a FLOAT multiply against `MST_MAX_CELLS` (never `| 0`, which would fail OPEN). The gated witness op is `countLE` (WORST-CASE O(log^2 n), on the SQUARED-log axis); its O(n) linear-scan-count foil leaves the line. See [`decisions/0018-mergesorttree.md`](./decisions/0018-mergesorttree.md).

```js
import { MergeSortTree } from '@zakkster/lite-logn';

// A snapshot COPIED in at construction (later mutating the caller's array changes nothing):
const t = new MergeSortTree([5, 1, 4, 2, 8, 3, 7, 6]);

t.countLE(0, 7, 4);        // -> 4    (values <= 4 over the whole range: 1,4,2,3)  -- O(log^2 n)
t.countLE(2, 5, 4);        // -> 3    (over indices 2..5 = [4,2,8,3]: 4,2,3)
t.rangeCount(0, 7, 3, 6);  // -> 4    (values in [3,6] over the whole range: 4,3,6,5)
t.length;                  // -> 8    (element count = the source length)
t.cells;                   // -> 32   (the flat run-table cell count = n*(ceil(log2 n)+1))

// The idiomatic factory (equal to new MergeSortTree(values)):
const b = MergeSortTree.build([9, 3, 7, 1]);
b.countLE(0, 3, 5);        // -> 2    (3 and 1)
```

| Member | Signature | Complexity | Notes |
| --- | --- | --- | --- |
| constructor | `new MergeSortTree(values)` | O(n log n) | `values` an array-like of finite numbers (any order), length an integer in `[1, MST_MAX_LENGTH]` (2^31-1). COPIES a snapshot in (genuine immutability). Throws (typeof-guarded FIRST) on a non-array-like, an out-of-range length, a `(H+1)*n` cell product over `MST_MAX_CELLS` (2^31-1, FLOAT-product guard), or any non-finite entry. |
| `countLE` | `countLE(lo, hi, x) -> number` | O(log^2 n) | Count of stored values <= `x` within the INDEX range `[lo, hi]` INCLUSIVE (the gated witness op). Read-only, 0 B/op. Fails closed: `lo` / `hi` integers with `0 <= lo <= hi < length`; `x` a number (NaN throws; +-Infinity is a legal threshold), typeof-first. |
| `rangeCount` | `rangeCount(lo, hi, vlo, vhi) -> number` | O(log^2 n) | Count of stored values in the VALUE-window `[vlo, vhi]` INCLUSIVE within the INDEX range `[lo, hi]` INCLUSIVE. Read-only, 0 B/op. Fails closed: `lo` / `hi` integers with `0 <= lo <= hi < length`; `vlo` / `vhi` numbers (not NaN) with `vlo <= vhi`. |
| `length` / `size` | getters | O(1) | The element count (the source length). `size` is the family-spine alias of `length`. |
| `cells` | getter | O(1) | The flat run-table cell count (`(ceil(log2 n) + 1) * n`) -- the disclosed O(n log n) space. |
| `MergeSortTree.build` | `build(values) -> MergeSortTree` | O(n log n) | The idiomatic factory; equal to `new MergeSortTree(values)`, same fail-closed doors. |

There is deliberately NO mutator (`set` / `update` / `insert` / `delete` / `clear`), NO `forEach` / `[Symbol.iterator]`, and NO kth-in-range order statistic (static + immutable; kth routed to a future WaveletTree) -- the documented asymmetry vs the mutable ordered maps.

</details>


## Zero-GC design notes

- **Array-embedded members allocate no nodes.** BinaryHeap, Fenwick, and SegmentTree live in flat typed arrays; there is no `new Node` per op, so there is nothing to collect. The parent / child / sibling relationships are index arithmetic (`2i+1`, `i & -i`), not pointers.
- **Pointer-based members use a pointer-free node pool.** SkipList and the later balanced-BST members allocate a slot INDEX from a free list over parallel `Uint32Array` link columns -- never a heap object. `NIL = 0`, slot 0 unused.
- **Fixed, preallocated capacity.** Overflow fails closed (a `[lite-logn]`-tagged throw), never a silent grow + amortized resize -- a resize would break the worst-case bound the witness proves.

<details>
<summary>Per-op allocation table + the gated witness numbers for every lane.</summary>

| Op class | Allocation |
| --- | --- |
| `BinaryHeap` push / pop / peek / topKey / keyOf / has / changeKey / remove | 0 B/op |
| `BinaryHeap` constructor / `build` / `clear` | O(capacity) typed arrays, once (cold) |
| `Fenwick` update / prefix / rangeSum / at / set | 0 B/op |
| `Fenwick` constructor / `build` / `clear` | O(length) typed array, once (cold) |
| `Fenwick` forEach | 0 B/op in the loop body (pass a hoisted callback) |
| `SegmentTree` query / update / at | 0 B/op |
| `SegmentTree` constructor / `build` / `clear` | O(length) typed array (`2n` cells), once (cold) |
| `SegmentTree` forEach | 0 B/op in the loop body (pass a hoisted callback) |
| `SkipList` get / set / delete / successor / predecessor | 0 B/op (links are slot indices from a private free-list, never heap objects) |
| `SkipList` constructor / `clear` | O(capacity) typed arrays + pool, once (cold) |
| `SkipList` forEach | 0 B/op in the loop body (pass a hoisted callback) |
| `SkipList` rangeIter | one iterator + `{value, done}` per step (the documented per-protocol allocator; transient, not retained) |
| `Treap` get / has / set / delete / rank / select / successor / predecessor | 0 B/op (nodes are slot indices; the recursive set/delete run on the native call stack, not the heap) |
| `Treap` constructor / `clear` | O(capacity) six columns + pool, once (cold) |
| `Treap` forEach | 0 B/op in the loop body (recursive in-order walk, hoisted callback) |
| `Treap` rangeIter | one iterator + `{value, done}` per step (the documented per-protocol allocator; transient, not retained) |
| `Treap` split / merge | 0 B/op beyond the returned Treap view(s); rewire in place, share the arena, consume the input(s) |
| `Scapegoat` get / has / set / delete / rank / select / successor / predecessor | 0 B/op (nodes are slot indices; the rebuild reuses the preallocated `_flat` + `_stack` scratch and the native call stack, so even a rebuild storm is 0 B/op) |
| `Scapegoat` constructor / `clear` | O(capacity) five columns + pool + two rebuild scratch buffers, once (cold) |
| `Scapegoat` forEach | 0 B/op in the loop body (recursive in-order walk, hoisted callback) |
| `Scapegoat` rangeIter | one iterator + `{value, done}` per step (the documented per-protocol allocator; transient, not retained) |
| `MinMaxHeap` push / popMin / popMax / peekMin / peekMax / peekMinKey / peekMaxKey | 0 B/op (two flat columns; the hole-punching sifts use only local scalar temporaries) |
| `MinMaxHeap` constructor / `build` / `clear` | O(capacity) two typed arrays, once (cold) |
| `MinMaxHeap` forEach | 0 B/op in the loop body (pass a hoisted callback) |
| `SplayTree` get / has / set / delete / successor / predecessor | 0 B/op (the iterative top-down splay uses the slot-0 header + two scalar hands; rotations rewrite existing slot links only -- a read splays but allocates nothing) |
| `SplayTree` constructor / `clear` | O(capacity) four typed arrays + free-list, once (cold) |
| `SplayTree` forEach / rangeIter / `[Symbol.iterator]` | 0 B/op in the loop body (NON-splaying key re-descent, no scratch stack; the range/iterator generator's per-step `{value, done}` is transient) |
| `BinomialHeap` push / popMin / peekMin / peekMinKey / meld | 0 B/op (six flat columns + a shared free-list; the binary-carry union, the child-reverse popMin, and the meld rewrite slot links only -- no heap object) |
| `BinomialHeap` constructor / `arena` / `clear` | O(capacity) six typed arrays + free-list, once (cold); `clear` is an O(n) forest walk that frees only this heap's own nodes |
| `BinomialHeap` forEach / `[Symbol.iterator]` | 0 B/op in the forEach loop body (hoisted callback); the iterator's per-step `{value, done}` + child-list sub-iterators are transient |
| `PairingHeap` push / popMin / decreaseKey / remove / peekMin / peekMinKey / has / keyOf / meld | 0 B/op (five flat columns + arena-wide reverse map + owner + union-find alias + a shared free-list; the two-pass combine, the O(1) cut, and the O(1) meld rewrite slot links only -- no heap object) |
| `PairingHeap` constructor / `arena` / `clear` | O(capacity) five typed arrays + reverse map + owner + free-list, once (cold); `clear` is an O(n) forest walk that frees only this heap's own nodes |
| `PairingHeap` forEach / `[Symbol.iterator]` | 0 B/op in the forEach loop body (hoisted callback); the iterator's per-step `{value, done}` + child-list sub-iterators are transient |
| `FibonacciHeap` push / popMin / decreaseKey / remove / peekMin / peekMinKey / has / keyOf / meld | 0 B/op (eight flat columns + arena-wide reverse map + owner + union-find alias + a per-arena degree bucket + a shared free-list; the degree consolidation, the iterative cascading cut, and the O(1) circular-list-concat meld rewrite slot links only -- no heap object) |
| `FibonacciHeap` constructor / `arena` / `clear` | O(capacity) eight typed arrays + reverse map + owner + degree bucket + free-list, once (cold); `clear` is an O(n) forest walk that frees only this heap's own nodes |
| `FibonacciHeap` forEach / `[Symbol.iterator]` | 0 B/op in the forEach loop body (hoisted callback); the iterator's per-step `{value, done}` + child-ring sub-iterators are transient |
| `Fenwick2D` update / prefix / rectSum / at / set | 0 B/op (one flat `Float64Array`; the nested `i & -i` climb / descend and the inlined rectSum inclusion-exclusion use only local scalar temporaries) |
| `Fenwick2D` constructor / `build` / `clear` | O(rows*cols) one typed array `(rows+1)*(cols+1)` cells, once (cold) |
| `Fenwick2D` forEach | 0 B/op in the loop body (pass a hoisted callback) |
| `SortedArray` get / has / rank / select / keyAt / valueAt / successor / predecessor / min / max | 0 B/op (two flat `Float64Array` columns; a lower-bound binary search + scalar temporaries, no pointer-chasing) |
| `SortedArray` set / delete | 0 B/op (the O(n) tail shift is an in-place `copyWithin` on the preallocated columns -- no temp, no spread) |
| `SortedArray` constructor / `build` / `clear` | O(capacity) two typed arrays, once (cold); `clear` is an O(1) size reset |
| `SortedArray` forEach | 0 B/op in the loop body (a contiguous scan; pass a hoisted callback) |
| `SortedArray` rangeIter | one iterator + `{value, done}` per step (the documented per-protocol allocator; transient, not retained) |

Gated witness numbers (this machine, shared R^2 floor 0.958): BinaryHeap `pop` R^2 ~ 0.99, slope ~ 8-10 ns/level; Fenwick `update` R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level (band `[1.84, 4.30]`); Fenwick `prefix` R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level (band `[1.76, 4.10]`); SegmentTree `update` R^2 ~ 0.99, slope ~ 3.2 ns/level (band `[2.29, 5.35]`); SegmentTree `query` R^2 ~ 0.99, slope ~ 7 ns/level (band `[4.30, 10.04]`); SkipList `get` R^2 ~ 0.97-0.99, slope ~ 9 ns/level (band `[5.27, 12.30]`, sweep `[2^11, 2^17]`); SkipList `set` R^2 ~ 0.97-0.99, slope ~ 14 ns/level (band `[8.36, 19.50]`, cache-resident sweep `[2^9, 2^14]`); Treap `get` R^2 ~ 0.99, slope ~ 4 ns/level (band `[2.55, 5.95]`, sweep `[2^11, 2^17]`); Scapegoat `get` R^2 ~ 0.99, slope ~ 3.8-4.0 ns/level (band `[2.41, 5.63]`, sweep `[2^11, 2^17]`) -- WORST-case (deterministic), with the AMORTIZED `set` rebuild spike proven by the amortized-trace assertion (ratio `< 4x`), not a per-op line; MinMaxHeap `popMin` R^2 ~ 0.99, slope ~ 10.3 ns/level (band `[6.18, 14.42]`, sweep `[1e4, 1e6]`) -- WORST-case (a DEPQ whose push / popMin / popMax are all worst-case, so no MAX-single-op line), a touch ABOVE BinaryHeap.pop because a min-max trickle-down compares against up to six descendants per level; SplayTree `get` R^2 ~ 0.98, slope ~ 27.3 ns/level (band `[16.39, 38.24]`, sweep `[2^12, 2^17]`) -- AMORTIZED + DETERMINISTIC (a read SPLAYS -- rotations rewrite links every op, so the per-level slope sits well above a read-only descent), with the MAX single get (a cold deep splay) DISCLOSED, never gated; BinomialHeap `popMin` R^2 ~ 0.98, slope ~ 44.8 ns/level (band `[26.89, 62.75]`, sweep `[2^11, 2^17]`) -- WORST-case (a mergeable heap whose push / popMin / meld are all worst-case, so no MAX-single-op line), well ABOVE the array-embedded heaps because a binomial popMin chases scattered forest slots (which is why it is gated over the cache-resident exact-power window); PairingHeap `popMin` R^2 ~ 0.99 (median-of-5 fits; individual single-fit R^2 is flaky ~0.945-0.985, so this lane gates on the median of 5 independent sweep-fits -- measurement-quality only, the frozen floor + band are untouched), slope ~ 21.4 ns/level (band `[13.08, 30.52]`, sweep `[2^11, 2^17]`, 15-sample slope median 21.799) -- AMORTIZED (a two-pass combine of the root's child list; a single pop can fold a long list, so the MAX single popMin is DISCLOSED, never gated), sitting BETWEEN the array-embedded heaps and BinomialHeap because it is a single multi-way tree, not a forest; FibonacciHeap `popMin` R^2 ~ 0.98 (median-of-7 fits; individual single-fit R^2 is flaky ~0.981-0.988 and can dip below the floor across meta-runs, so this lane gates on the median of 7 independent sweep-fits -- measurement-quality only, the frozen floor + band are untouched), slope ~ 45.3 ns/level (band `[27.18, 63.41]`, sweep `[2^11, 2^17]`, 15-sample slope median 45.296) -- AMORTIZED (a lazy forest consolidated by degree on demand; a single pop can do an O(n) consolidation and a single decreaseKey an O(n) cascade, so BOTH the MAX single popMin AND the MAX single decreaseKey are DISCLOSED, never gated), the FAMILY's STEEPEST per-level slope because it does the most pointer-chasing per level of any heap here (textbook-optimal in asymptotics, honestly slower wall-clock than Pairing/Binary); Fenwick2D `update` R^2 ~ 0.99 (median-of-fits), slope ~ 3.5 ns per `(log2 n)^2` unit (band `[2.13, 4.96]`) and `rectSum` R^2 ~ 0.99, slope ~ 4.8 ns per `(log2 n)^2` unit (band `[2.90, 6.77]`), both gated over exact power-of-two square sides `[2^5, 2^11]` on the family's FIRST SQUARED-log axis (`nsPerOp = intercept + slope*(log2 n)^2`, via a per-lane `xOf` hook that defaults to `Math.log2` so every prior lane is byte-identical) -- WORST-case (no MAX-single-op line), each O(n^2)-per-op dense-rescan foil OFF the line; SortedArray `get` R^2 ~ 0.98 (median-of-7 fits), slope ~ 1.0 ns/level (band `[0.59, 1.38]`, sweep `[2^12, 2^18]`) -- WORST-case O(log n) (a deterministic contiguous lower-bound binary search, the family's SHALLOWEST per-level slope because a packed search touches fewer cache lines per level than a pointer-chasing descent), with the MAX single insert (an O(n) tail shift) DISCLOSED, never gated, and its O(n) linear-scan foil OFF the line (R^2 ~ 0.78). The allocation table is extended per member as each lands.

</details>

## Testing

`node:test` only, zero runtime deps. `npm test` runs 596 tests -- the per-member contract, boundary, and fuzz-vs-oracle suites plus the cross-member `QaAudit` block; the torture, witness, perf-gate, and demo harnesses run under their own scripts (below).

- `npm test` -- per-member contract + boundary + fuzz-vs-oracle suites, plus the cross-member `QaAudit` block (VERSION trinity, author-spelling guard, ASCII-only source, the six-file pack).
- `npm run torture` -- `node --expose-gc test/torture.mjs`: 0 B/op on every hot path, `gc major = 0`, leak tracker `size 0/0`.
- `npm run witness` -- the O(log n) witness harness: log-linear `R^2` + slope fit, with an O(n) foil that must leave the line.
- `npm run test:perf` -- `@zakkster/lite-perf-gate` zero-alloc scenarios, each with a must-fail teeth case that proves the instrument has teeth.
- `npm run test:types` -- `tsc` over the ambient `LogN.d.ts` surface.
- `npm run verify` -- all of the above in sequence.

## What this is not

- **Not a bounded-integer priority queue.** If your priorities are small bounded integers, a heap's O(log n) is the wrong tool -- use `@zakkster/lite-o1`'s `BucketQueue` (Dial, O(1)) or `@zakkster/lite-scheduler`'s `FastBitScheduler`. lite-logn's heap is the GENERAL comparator PQ at O(log n).
- **Not an approximate-membership library.** Bloom / cuckoo / binary-fuse filters live in `@zakkster/lite-filter`. lite-logn owns exact ordered structures.
- **Not a cache.** `@zakkster/lite-lru` uses ordering internally for eviction but is a cache, not an ordered-collection library.
- **Not an addressable double-ended queue.** MinMaxHeap is a DEPQ, but it is NON-addressable: its id is an opaque, non-unique payload (no reverse map), so it has no `changeKey` / `remove`. For an addressable single-ended priority queue (reprioritize / remove by entity id) use **BinaryHeap**. MinMaxHeap also ships the classic one-element-per-node min-max heap only -- the interval-heap DEPQ (two elements per node) is a deliberately deferred alternative (see [`decisions/0009-minmaxheap.md`](./decisions/0009-minmaxheap.md)).
- **Not an order-statistic tree, and not read-only-safe under iteration -- for SplayTree.** SplayTree is the LEAN member: it has no `rank` / `select` / `split` / `merge` (use **Treap** or **Scapegoat** for order statistics), and because a `get` / `has` SPLAYS (restructures the tree and bumps the version), a read taken mid-`rangeIter` fails closed. If you need worst-case (not amortized) reads that never restructure, use **Scapegoat** (deterministic worst-case O(log n) `get`); reach for SplayTree when the access pattern is skewed / has temporal locality and you want hot keys to ride near the root (see [`decisions/0010-splaytree.md`](./decisions/0010-splaytree.md)).
- **Not an addressable or decrease-key heap -- for BinomialHeap.** BinomialHeap is the family's LEAN MERGEABLE priority queue: its id is an opaque, non-unique payload (no reverse map), so it has no `decreaseKey` / `remove` / `changeKey` / `rank` / `select`. Reach for BinomialHeap when you want a mergeable PQ with a small per-node footprint and do NOT need to reprioritize by id; its meld is O(log n). Meld requires both heaps to share one arena (`BinomialHeap.arena(...)`) and CONSUMES the argument (see [`decisions/0011-binomialheap.md`](./decisions/0011-binomialheap.md)).
- **Not an ordered map or an order-statistic tree -- for PairingHeap.** PairingHeap is the ADDRESSABLE MERGEABLE priority queue: it has `decreaseKey` / `remove` / `has` / `keyOf` by an **arena-wide-unique** id and an **O(1) meld** (better than BinomialHeap's O(log n)), but it is a priority queue, not an ordered map -- no `rank` / `select` / `successor` / `rangeIter` (use **Treap** / **Scapegoat** / **SkipList** for ordered queries), and no `changeKey` (use `decreaseKey`, which moves TOWARD the extreme only). Reach for PairingHeap for a **Dijkstra / Prim relaxation loop** (decrease-key by node id) or when you need an O(1) meld of two priority queues; ids are unique arena-wide and `decreaseKey` / `remove` on a sibling heap's id fails closed (see [`decisions/0012-pairingheap.md`](./decisions/0012-pairingheap.md)). For an addressable single-ended PQ with an unrestricted `changeKey` (either direction) over a private (non-arena) id space, use **BinaryHeap**; for both extremes use **MinMaxHeap**.
- **Not the fastest mergeable heap -- for FibonacciHeap.** FibonacciHeap is the arc's FINALE: the same ADDRESSABLE + MERGEABLE surface as PairingHeap (`decreaseKey` / `remove` / `has` / `keyOf` by arena-wide-unique id, an O(1) meld), reaching the tightest textbook amortized bounds (O(1)-amortized push/meld/decreaseKey, O(log n)-amortized popMin/remove) via cascading cuts + degree consolidation. But it is **often slower wall-clock than PairingHeap or BinaryHeap** on real hardware (large constant factors, long consolidation/cascade spikes) -- the benchmark shows this plainly. Reach for FibonacciHeap when the ASYMPTOTIC bound is what matters (a teaching reference, or an analysis that needs the O(1)-amortized decreaseKey on paper); reach for **PairingHeap** when you want the same addressable mergeable surface and the best real-world speed (see [`decisions/0013-fibonacciheap.md`](./decisions/0013-fibonacciheap.md)).
- **Not a 2D min / max / gcd structure -- for Fenwick2D.** Fenwick2D answers 2D rectangle **SUM** in O(log^2 n), and only sum: `rectSum` works because subtraction inverts addition, and min / max / gcd have no such inverse. It is also index-addressed (by grid position), not keyed -- no `changeKey` / `rank` / `select`. Reach for Fenwick2D for a mutable grid of counts / weights where you query rectangle totals under point updates (heatmaps, 2D prefix analytics, image integral-image updates); for 2D range min / max / gcd reach for **SegmentTree2D** (shipped in v0.13.0), not a BIT (see [`decisions/0014-fenwick2d.md`](./decisions/0014-fenwick2d.md)).
- **Not a grow-on-demand collection.** Capacity is fixed at construction and overflow fails closed.

## Ecosystem

Part of the `@zakkster/*` LiteLibrariesSuite of zero-GC, single-file ESM micro-libraries.

- [`@zakkster/lite-o1`](https://www.npmjs.com/package/@zakkster/lite-o1) -- the O(1) sibling and intended pair. lite-o1 holds the constant; lite-logn holds the logarithm. Keep the witnesses kin: a flat line vs a straight-log line.
- [`@zakkster/lite-filter`](https://www.npmjs.com/package/@zakkster/lite-filter) -- approximate / probabilistic membership.
- [`@zakkster/lite-lru`](https://www.npmjs.com/package/@zakkster/lite-lru) -- zero-GC cache family.

## License

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
