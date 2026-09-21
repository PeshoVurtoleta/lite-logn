# @zakkster/lite-logn

> Zero-GC, O(log n) data structures that PROVE their logarithm. The O(log n) sibling of `@zakkster/lite-o1`: where lite-o1 holds the constant (a flat ops/ms line), lite-logn holds the logarithm (a straight line on a log-x axis -- one added level per doubling of n). v0.9.0 ships nine members: BinaryHeap (array-embedded O(log n) push / pop min|max heap), Fenwick / BIT (O(log n) point-update AND prefix-sum via the `i & -i` walk), SegmentTree (O(log n) associative range-query -- min / max / sum / gcd -- plus point-update over a flat 2n array), SkipList (pointer-free expected-O(log n) ordered map over a private free-list node pool), Treap (a randomized-balanced augmented ordered map with O(log n) rank / select / split / merge), Scapegoat (a DETERMINISTIC weight-balanced augmented ordered map: worst-case-O(log n) get, amortized-O(log n) set / delete, zero-GC rebuild), MinMaxHeap (an array-embedded double-ended priority queue: O(1) peekMin / peekMax, O(log n) push / popMin / popMax), SplayTree (a self-adjusting ordered map: amortized-O(log n) get / set / delete via top-down splay, hot keys ride near the root), and BinomialHeap (a mergeable priority queue: O(log n) meld of two heaps over a shared arena, O(1)-amortized push, O(log n) popMin) -- each zero-GC, each shipped with a log-linear Witness that fits `nsPerOp = intercept + slope*log2(n)` and shows the straight log line while an O(n) foil leaves it.

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

**v0.9.0 ships nine members: BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree and BinomialHeap.** Members land one per session, each append-only so prior members stay byte-identical. The planned roster below fills in per release.

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

One member per session, each landing append-only (prior members stay byte-identical). At v0.9.0, BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree and BinomialHeap are shipped.

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

Later tiers (OrderStatTree, IndexedHeap, SortedArray, and presets) are queued in [`ROADMAP.md`](./ROADMAP.md).

## The O(log n) Witness

The family anchor. Time a fixed batch of the hot op at each `n` in a geometric sweep, fit `nsPerOp = intercept + slope * log2(n)` by least squares, and gate:

- `R^2 >= floor` (a straight line fits -- genuinely logarithmic), AND
- `slope` inside the member's band (the per-level cost, ns/level), AND
- the FOIL leaves the line (low `R^2` -- the O(n) default a working programmer reaches for, shown losing as `n` grows).

For amortized / randomized members the witness also prints the MAX single-op time -- the honesty hook: a rebuild spike or a degenerate tail shows as a tall bar even when the mean still fits the line. The `R^2` floor (0.958) is frozen family-wide in BinaryHeap; each member then calibrates its OWN per-op slope band (median-of-15 fit-runs x `[0.6, 1.4]`), because a cheaper op honestly has a lower per-level slope (see [`decisions/0004-witness-band.md`](./decisions/0004-witness-band.md)). At v0.9.0 the witness gates twelve ops: BinaryHeap `pop` (R^2 ~ 0.99, slope ~ 8-10 ns/level), Fenwick `update` (R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level) and `prefix` (R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level), SegmentTree `update` (R^2 ~ 0.99, slope ~ 3.2 ns/level, band `[2.29, 5.35]`) and `query` (R^2 ~ 0.99, slope ~ 7 ns/level, band `[4.30, 10.04]`), SkipList `get` (R^2 ~ 0.97-0.99, slope ~ 9 ns/level, band `[5.27, 12.30]`) and `set` (R^2 ~ 0.97-0.99, slope ~ 14 ns/level, band `[8.36, 19.50]`), Treap `get` (R^2 ~ 0.99, slope ~ 4 ns/level, band `[2.55, 5.95]`), Scapegoat `get` (R^2 ~ 0.99, slope ~ 4 ns/level, band `[2.41, 5.63]`), MinMaxHeap `popMin` (R^2 ~ 0.99, slope ~ 10.3 ns/level, band `[6.18, 14.42]`), SplayTree `get` (R^2 ~ 0.98, slope ~ 27 ns/level, band `[16.39, 38.24]`, sweep `[2^12, 2^17]`), and BinomialHeap `popMin` (R^2 ~ 0.98, slope ~ 44.8 ns/level, band `[26.89, 62.75]`, sweep `[2^11, 2^17]`) all ON the line. BinomialHeap is the family's first MERGEABLE heap: its `popMin` is WORST-case O(log n) (unlink the extreme root, reverse its child list, union back, rescan the roots -- no max-single-op line), and its per-level slope sits well above the array-embedded heaps because it chases scattered forest slots (which is why it is gated over the cache-resident exact-power window, not the [1e4, 1e6] band). SplayTree is DETERMINISTIC and SELF-ADJUSTING: its `get` is AMORTIZED O(log n) (a read SPLAYS the touched key to the root -- the slope sits well above a read-only BST descent because rotations rewrite links every op), measured over a uniform-random working set of size n so the amortized line shows (a skewed pattern would flatten it -- the member's speedup, not what a straight-log witness measures); because a single cold access can splay an O(n) chain, the witness also prints the MAX single get as a disclosure, never gated. Scapegoat is DETERMINISTIC, so its `get` is WORST-case (not expected) O(log n); its rebuild spike lives on the AMORTIZED `set` path and is proven not by a per-op line but by an amortized-trace assertion -- the cumulative ascending-insert (rebuild-heavy) cost/op tracks a LOG curve (last/first ratio ~1.5x over `[2^11, 2^17]`, gated `< 4x`) where a rebuild-less BST would degenerate to an O(n)-amortized chain and blow the ratio to ~64x. Treap's descent touches one node per level, so its per-level slope is lower than SkipList's tower search -- expected, which is why only the R^2 floor is shared and each op calibrates its own band. SkipList's two ops are gated over DIFFERENT sweeps -- each measured where its logarithm is visible, not where the cache wall is: `get` (a clean search with no per-op randomness) over `[2^11, 2^17]` for dynamic range; `set` (a heavier insert+delete churn whose per-insert tower height is random) over the smaller, fully cache-resident `[2^9, 2^14]` so the fit sees the structural level count, not DRAM latency. Because SkipList is EXPECTED (not worst-case) O(log n), the witness also prints the MAX single insert over a realistic randomized build trace -- the unlucky-tower tail a mean hides. Each op's O(n) foil fits well below the floor: the sorted-array insert (BinaryHeap / SkipList) foil runs R^2 ~ 0.77-0.87, the Fenwick foils (prefix-array rebuild, naive re-sum) and SkipList's linear-scan search foil hold at R^2 ~ 0.75-0.82, and SegmentTree's foils (whole-tree rebuild per update, scan-fold per query) fit at R^2 ~ 0.72-0.85 -- all foil families sit comfortably under the 0.958 floor.

## Benchmarks

A repo-only, eight-dimension benchmark suite (`benchmark/`, ADOPTED field-for-field from `@zakkster/lite-o1`'s "Bench v2") surrounds the witness anchor. It is dev infra: NOT in the published tarball, imports NOTHING from the package but `LogN.js`, and spawns one child process per `(member x dimension)` cell for a clean GC/JIT state. **D1 is the O(log n) Witness itself** -- it DELEGATES to the shipped `test/witness.mjs` (the same frozen kernels, per-op sweeps, `R^2` floor and slope bands), so the headline dimension never re-implements the fit. Run it yourself:

```sh
npm run bench            # 32 cells -> benchmark/results.json + summary tables
npm run bench:report     # the above, then benchmark/report.html (hand-rolled inline-SVG graphs)
```

Numbers below are one run on an Apple M4 Pro (arm64), Node v26 -- machine-specific, reproducible from a fixed seed (`0x9e3779b1`). Every applicable cell is a positive number; every inapplicable cell is the string `n/a` (never a numeric 0).

### D1 -- the O(log n) Witness fit (per gated op-row)

Each op fits `nsPerOp = intercept + slope*log2(n)`. ON-LINE = `R^2 >= 0.958` (the frozen family floor) AND `slope` inside the member's per-op band; the O(n) foil MUST leave the line (`foil R^2 < 0.958`). All eight op-rows sit ON the line; all eight foils leave it.

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

**Scapegoat amortized-trace (the rebuild honesty).** Scapegoat's `get` is WORST-case O(log n) (a deterministic weight-balance height bound), so it carries no expected-op MAX-single-op disclosure. The rebuild spike lives on the AMORTIZED `set` path; D1 proves the amortization not with a per-op line but with an amortized-trace assertion -- the cumulative ascending-insert (rebuild-heavy) cost/op tracks a LOG curve (last/first ratio `~1.5x` over `[2^11, 2^17]`, gated `< 4x`) where a rebuild-less BST would blow to `~64x`.

**SkipList counter-foil (the order tax).** A native `Map` is O(1) at get/set (`~27 ns/op`, FLATTER than any log line) but ORDER-BLIND: it cannot answer `successor` / `predecessor` / `rangeIter`. The log factor SkipList pays buys exactly the ordered queries Map cannot. SkipList is EXPECTED O(log n), so D1 also DISCLOSES its MAX single insert (an unlucky tall tower over a randomized build: `~18-130 us`, not gated).

### D3 -- memory (bytes / live vs a theoretical floor)

| member | peak bytes @ 64Ki | B/live | theo min | overhead x | note |
| --- | --- | --- | --- | --- | --- |
| BinaryHeap | 1,048,576 | 16.0 | 12 | 1.33 | key (8) + id (4) dense; `_pos` reverse map is the universe overhead |
| Fenwick | 524,296 | 8.0 | 8 | 1.00 | one `Float64` tree cell per element -- exact |
| SegmentTree | 1,048,576 | 16.0 | 16 | 1.00 | the `2n` array -- exact |
| SkipList | 5,767,320 | 88.0 | 16 | 5.50 | key + value dense; the `ceil(log2 cap)+1` link columns are the tower overhead |

The overhead-x load-factor curve RISES as load falls for BinaryHeap + SkipList (fixed backing over fewer live) and is FLAT for the INDEX-ADDRESSED Fenwick + SegmentTree (every cell is always live) -- another honest `n/a` where insertion order does not apply.

### D5 -- bundle size + tree-shaking (esbuild min + gzip)

A single-member import must be `< 40%` of the all-member import. Three of four clear it; SkipList (the heaviest lone member) is the ONE honest exception at `~41%` -- stated, not rounded down, and never by moving the budget. The median lone-import ratio is `~0.32 (< 0.40)`; every member's lone import still drops the majority of the others (`< 0.50`).

| member | single gz (B) | all gz (B) | ratio | `< 40%`? |
| --- | --- | --- | --- | --- |
| BinaryHeap | 1,365 | 3,758 | 0.363 | yes |
| Fenwick | 826 | 3,758 | 0.220 | yes |
| SegmentTree | 1,071 | 3,758 | 0.285 | yes |
| SkipList | 1,546 | 3,758 | 0.411 | NO (the stated exception) |

### D6 -- GC pressure (the 0 B/op gate as a curve, per op-row)

All seven gated op-rows report **0 B/op** across the `n = 1e3..1e6` sweep, with `max major GC = 0`. The precise proof stays `node --expose-gc test/torture.mjs` (via `@zakkster/lite-gc-profiler`); D6 is the portable curve (min heap-delta over independent passes -- heap-accounting jitter only ADDS, so a truly-zero kernel hits 0 on its best pass while a per-op allocator stays positive on every pass).

### The other dimensions

- **D2 amortized cost** -- cumulative ns/op stays bounded over a `~1M`-op mixed trace (drift `< 1.0` here: the trace speeds up as the JIT warms, never degrades).
- **D4 cache (PROXY, labelled)** -- dense `forEach` iteration vs random single-element lookup; the random/dense gap is `~1.9x` (SegmentTree) to `~2.9x` (SkipList). No native perf counters.
- **D7 scalability** -- numeric substrates: string + object keys read `n/a`. Load factors `0.3/0.5/0.7/0.9`; insertion order (sorted / random / adversarial-reverse) applies to the comparison-ordered BinaryHeap + SkipList + Treap + Scapegoat + MinMaxHeap + SplayTree + BinomialHeap, `n/a` for the index-addressed Fenwick + SegmentTree.
- **D8 workloads** -- churn (all members) + an ordered scan (`successor` + `rangeIter`, SkipList + Treap + Scapegoat + SplayTree; `n/a` elsewhere, including MinMaxHeap and BinomialHeap -- priority queues, not ordered maps).

## API reference

### Constants

| Export | Type | Value | Meaning |
| --- | --- | --- | --- |
| `VERSION` | `string` | `'0.9.0'` | The package version. One of the three version sites (package.json / `LogN.js` `VERSION` const / `llms.txt`), kept in lockstep and enforced in review. |

### BinaryHeap

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

### Fenwick

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

### SegmentTree

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

### SkipList

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

### Treap

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

### Scapegoat

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

### MinMaxHeap

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

### SplayTree

A **splay tree**: a **self-adjusting** BST ordered map (key -> value) whose every access **SPLAYS** -- a chain of rotations that walks the touched node (or, for an absent key, the last node on the search path) to the **root** (Sleator & Tarjan 1985). Recently / frequently used keys ride near the top, giving **amortized O(log n)** per op and genuinely **faster-than-log** behaviour on skewed / working-set access. It keeps **no balance metadata**: four parallel pointer-free columns (`_key` / `_value` `Float64Array`, `_left` / `_right` `Uint32Array`) over the same private free-list (NodePool). The splay is **iterative and top-down**: slot 0 (the NIL sentinel) doubles as the splay's dummy header and two fixed scratch hands grow the two assembly trees, so there is **no parent column, no path stack, and no recursion** -- every hot op is 0 B/op and no degenerate chain can overflow the native stack. Keys and values are finite numbers (typeof-guarded before coercion; Symbol / BigInt / NaN / +-Infinity fail closed, key checked FIRST).

**A read mutates.** `get` / `has` / `successor` / `predecessor` SPLAY the touched (or closest) node to the root and **bump the iteration version** -- so an in-flight `rangeIter` fails closed even on a read. `rangeIter` / `forEach` / `[Symbol.iterator]` are the only non-mutating reads: NON-splaying in-order walks that leave the tree byte-identical. This is the **LEAN** member: deliberately **no `rank` / `select` / `split` / `merge`** (Treap / Scapegoat carry the augmented / order-statistic surface -- the documented asymmetry), and no seed argument (DETERMINISTIC, no RNG). See [`decisions/0010-splaytree.md`](./decisions/0010-splaytree.md).

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
| `rangeIter` | `rangeIter(lo, hi) -> IterableIterator<number>` | O(log n + k) | Keys in `[lo, hi]` inclusive, ascending; NON-splaying + version-stamped (any mutation mid-iteration, INCLUDING a get/has, throws). Bounds may be +-Infinity; NaN or lo > hi throws. |
| `forEach` | `forEach(fn) -> void` | O(n log n) | Visits `(key, value, tree)` in ascending key order (NON-splaying). |
| `[Symbol.iterator]` | `-> IterableIterator<number>` | O(n log n) | Yields keys in ascending order (NON-splaying). |
| `clear` | `clear() -> this` | O(capacity) | Empties the tree, keeps capacity. |
| `size` / `capacity` | getters | O(1) | Live entry count / fixed capacity. |

### BinomialHeap

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

Member signatures for later members are appended here as each ships.

## Zero-GC design notes

- **Array-embedded members allocate no nodes.** BinaryHeap, Fenwick, and SegmentTree live in flat typed arrays; there is no `new Node` per op, so there is nothing to collect. The parent / child / sibling relationships are index arithmetic (`2i+1`, `i & -i`), not pointers.
- **Pointer-based members use a pointer-free node pool.** SkipList and the later balanced-BST members allocate a slot INDEX from a free list over parallel `Uint32Array` link columns -- never a heap object. `NIL = 0`, slot 0 unused.
- **Fixed, preallocated capacity.** Overflow fails closed (a `[lite-logn]`-tagged throw), never a silent grow + amortized resize -- a resize would break the worst-case bound the witness proves.

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

Gated witness numbers (this machine, shared R^2 floor 0.958): BinaryHeap `pop` R^2 ~ 0.99, slope ~ 8-10 ns/level; Fenwick `update` R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level (band `[1.84, 4.30]`); Fenwick `prefix` R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level (band `[1.76, 4.10]`); SegmentTree `update` R^2 ~ 0.99, slope ~ 3.2 ns/level (band `[2.29, 5.35]`); SegmentTree `query` R^2 ~ 0.99, slope ~ 7 ns/level (band `[4.30, 10.04]`); SkipList `get` R^2 ~ 0.97-0.99, slope ~ 9 ns/level (band `[5.27, 12.30]`, sweep `[2^11, 2^17]`); SkipList `set` R^2 ~ 0.97-0.99, slope ~ 14 ns/level (band `[8.36, 19.50]`, cache-resident sweep `[2^9, 2^14]`); Treap `get` R^2 ~ 0.99, slope ~ 4 ns/level (band `[2.55, 5.95]`, sweep `[2^11, 2^17]`); Scapegoat `get` R^2 ~ 0.99, slope ~ 3.8-4.0 ns/level (band `[2.41, 5.63]`, sweep `[2^11, 2^17]`) -- WORST-case (deterministic), with the AMORTIZED `set` rebuild spike proven by the amortized-trace assertion (ratio `< 4x`), not a per-op line; MinMaxHeap `popMin` R^2 ~ 0.99, slope ~ 10.3 ns/level (band `[6.18, 14.42]`, sweep `[1e4, 1e6]`) -- WORST-case (a DEPQ whose push / popMin / popMax are all worst-case, so no MAX-single-op line), a touch ABOVE BinaryHeap.pop because a min-max trickle-down compares against up to six descendants per level; SplayTree `get` R^2 ~ 0.98, slope ~ 27.3 ns/level (band `[16.39, 38.24]`, sweep `[2^12, 2^17]`) -- AMORTIZED + DETERMINISTIC (a read SPLAYS -- rotations rewrite links every op, so the per-level slope sits well above a read-only descent), with the MAX single get (a cold deep splay) DISCLOSED, never gated; BinomialHeap `popMin` R^2 ~ 0.98, slope ~ 44.8 ns/level (band `[26.89, 62.75]`, sweep `[2^11, 2^17]`) -- WORST-case (a mergeable heap whose push / popMin / meld are all worst-case, so no MAX-single-op line), well ABOVE the array-embedded heaps because a binomial popMin chases scattered forest slots (which is why it is gated over the cache-resident exact-power window). The allocation table is extended per member as each lands.

## Testing

`node:test` only, zero runtime deps. At v0.1.0 the harnesses are scaffolds that run green and empty (no member to exercise yet); each member session fills its tier.

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
- **Not an addressable or decrease-key heap -- for BinomialHeap.** BinomialHeap is the family's MERGEABLE priority queue, but it is LEAN + non-addressable: its id is an opaque, non-unique payload (no reverse map), so it has no `decreaseKey` / `remove` / `changeKey` / `rank` / `select`. For an addressable single-ended PQ (reprioritize / remove by entity id) use **BinaryHeap**; for both extremes use **MinMaxHeap**. Reach for BinomialHeap when you need to **`meld` two priority queues in O(log n)** -- the op a single array-embedded heap cannot do without an O(n) rebuild. Meld requires both heaps to share one arena (`BinomialHeap.arena(...)`) and CONSUMES the argument (see [`decisions/0011-binomialheap.md`](./decisions/0011-binomialheap.md)).
- **Not a grow-on-demand collection.** Capacity is fixed at construction and overflow fails closed.

## Ecosystem

Part of the `@zakkster/*` LiteLibrariesSuite of zero-GC, single-file ESM micro-libraries.

- [`@zakkster/lite-o1`](https://www.npmjs.com/package/@zakkster/lite-o1) -- the O(1) sibling and intended pair. lite-o1 holds the constant; lite-logn holds the logarithm. Keep the witnesses kin: a flat line vs a straight-log line.
- [`@zakkster/lite-filter`](https://www.npmjs.com/package/@zakkster/lite-filter) -- approximate / probabilistic membership.
- [`@zakkster/lite-lru`](https://www.npmjs.com/package/@zakkster/lite-lru) -- zero-GC cache family.

## License

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
