# @zakkster/lite-logn

> Zero-GC, O(log n) data structures that PROVE their logarithm. The O(log n) sibling of `@zakkster/lite-o1`: where lite-o1 holds the constant (a flat ops/ms line), lite-logn holds the logarithm (a straight line on a log-x axis -- one added level per doubling of n). v0.2.0 ships two members: BinaryHeap (array-embedded O(log n) push / pop min|max heap) and Fenwick / BIT (O(log n) point-update AND prefix-sum via the `i & -i` walk); SegmentTree (O(log n) associative range-query + point-update) and SkipList (pointer-free expected-O(log n) ordered map) are planned -- each zero-GC, each shipped with a log-linear Witness that fits `nsPerOp = intercept + slope*log2(n)` and shows the straight log line while an O(n) foil leaves it.

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

**v0.2.0 ships two members: BinaryHeap and Fenwick.** Members land one per session, each append-only so prior members stay byte-identical. The planned roster below fills in per release.

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
- [API reference](#api-reference)
  - [Constants](#constants)
  - [BinaryHeap](#binaryheap)
  - [Fenwick](#fenwick)
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

One member per session, each landing append-only (prior members stay byte-identical). At v0.2.0, BinaryHeap and Fenwick are shipped; SegmentTree and SkipList are planned.

| Member | Version | Status | Shape | Hot ops |
| --- | --- | --- | --- | --- |
| **BinaryHeap** | 0.1.0 | shipped | array-embedded complete binary min|max heap over a flat `Float64Array` | `push` / `pop` O(log n), `peek` O(1) |
| **Fenwick** (BIT) | 0.2.0 | shipped | flat `Float64Array`, lowest-set-bit walk (`i & -i`) | `update` / `prefix` / `rangeSum` / `at` / `set` O(log n) |
| **SegmentTree** | 0.3.0 | planned | flat, array-embedded tree; associative fold chosen at construction | `rangeQuery` / `pointUpdate` O(log n) |
| **SkipList** | 0.4.0 | planned | pointer-free over a shared node pool; expected O(log n) | `get` / `set` / `delete` / `successor` |

Later tiers (Treap / Scapegoat, OrderStatTree, IndexedHeap, SortedArray, MinMaxHeap, SplayTree, and presets) are queued in [`ROADMAP.md`](./ROADMAP.md).

## The O(log n) Witness

The family anchor. Time a fixed batch of the hot op at each `n` in a geometric sweep, fit `nsPerOp = intercept + slope * log2(n)` by least squares, and gate:

- `R^2 >= floor` (a straight line fits -- genuinely logarithmic), AND
- `slope` inside the member's band (the per-level cost, ns/level), AND
- the FOIL leaves the line (low `R^2` -- the O(n) default a working programmer reaches for, shown losing as `n` grows).

For amortized / randomized members the witness also prints the MAX single-op time -- the honesty hook: a rebuild spike or a degenerate tail shows as a tall bar even when the mean still fits the line. The `R^2` floor (0.958) is frozen family-wide in BinaryHeap; each member then calibrates its OWN per-op slope band (median-of-15 fit-runs x `[0.6, 1.4]`), because a cheaper op honestly has a lower per-level slope (see [`decisions/0004-witness-band.md`](./decisions/0004-witness-band.md)). At v0.2.0 the witness gates three ops: BinaryHeap `pop` (R^2 ~ 0.99, slope ~ 8-10 ns/level) and Fenwick `update` (R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level) and `prefix` (R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level) all ON the line; each op's O(n) foil fits well below the floor: the sorted-array insert (BinaryHeap `push`) foil runs R^2 ~ 0.77-0.84 run-to-run, and the Fenwick foils (prefix-array rebuild, naive re-sum) hold steadier at R^2 ~ 0.75-0.76 -- both foil families sit comfortably under the 0.958 floor.

## API reference

### Constants

| Export | Type | Value | Meaning |
| --- | --- | --- | --- |
| `VERSION` | `string` | `'0.2.0'` | The package version. One of the three version sites (package.json / `LogN.js` `VERSION` const / `llms.txt`), kept in lockstep and enforced in review. |

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

Gated witness numbers (this machine, shared R^2 floor 0.958): BinaryHeap `pop` R^2 ~ 0.99, slope ~ 8-10 ns/level; Fenwick `update` R^2 ~ 0.98-0.99, slope ~ 2.9-3.0 ns/level (band `[1.84, 4.30]`); Fenwick `prefix` R^2 ~ 0.97, slope ~ 2.6-2.7 ns/level (band `[1.76, 4.10]`). The allocation table is extended per member as each lands.

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
- **Not a grow-on-demand collection.** Capacity is fixed at construction and overflow fails closed.

## Ecosystem

Part of the `@zakkster/*` LiteLibrariesSuite of zero-GC, single-file ESM micro-libraries.

- [`@zakkster/lite-o1`](https://www.npmjs.com/package/@zakkster/lite-o1) -- the O(1) sibling and intended pair. lite-o1 holds the constant; lite-logn holds the logarithm. Keep the witnesses kin: a flat line vs a straight-log line.
- [`@zakkster/lite-filter`](https://www.npmjs.com/package/@zakkster/lite-filter) -- approximate / probabilistic membership.
- [`@zakkster/lite-lru`](https://www.npmjs.com/package/@zakkster/lite-lru) -- zero-GC cache family.

## License

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
