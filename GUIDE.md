# lite-logn -- which structure to pick (GUIDE)

A repo-only decision guide for the O(log n) family: which member, reach-for /
avoid, and how to measure the logarithm yourself. At v0.4.0 four members have
shipped -- BinaryHeap, Fenwick, SegmentTree and SkipList -- so this guide carries
their per-member sections. It is NOT an API encyclopedia (that is the README +
`LogN.d.ts`); it answers "which member, and is my logarithm real?"

Scope discipline (mirrors lite-o1's GUIDE): a decision flowchart + a picker
table up top, then reach-for / avoid + measure-it per member. No re-documenting
signatures.

---

## The one question every member answers

> Is the headline op O(log n) on a REAL engine, or only on paper?

lite-logn's answer is the O(log n) Witness: `nsPerOp = intercept + slope*log2(n)`
that fits a straight line as `n` grows is the proof (one added level per
doubling). Every "reach for it" below will be conditional on the witness staying
above its `R^2` floor and inside its slope band for YOUR workload -- run
`npm run witness` and read the shape.

The family delta with lite-o1: lite-o1 proves a FLAT ops/ms line (the constant);
lite-logn proves a STRAIGHT log line (the logarithm). Same discipline, different
gate shape.

---

## Which member? (decision flowchart)

ASCII, routes on the discriminating questions. `(wc)` = worst-case O(log n),
`(am)` = amortized, `(exp)` = expected. At v0.3.0 BinaryHeap, Fenwick and
SegmentTree have shipped; SkipList fills in per release.

```
START -- what do you need?
|
+-- The SMALLEST (or largest) element, repeatedly, with insert? -> BinaryHeap (wc)   [v0.1.0]
|
+-- PREFIX SUMS that stay correct under point updates?          -> Fenwick / BIT (wc) [v0.2.0]
|
+-- Any ASSOCIATIVE fold (min / max / sum / gcd) over a RANGE,
|   with point updates?                                         -> SegmentTree (wc)   [v0.3.0]
|
+-- An ORDERED map / set (get / set / delete / successor /
    ordered iteration)?                                         -> SkipList (exp)     [v0.4.0]
```

---

## Picker table

| Need | Member | Bound | Version |
| --- | --- | --- | --- |
| Repeated min / max + insert | BinaryHeap | O(log n) push / pop, O(1) peek | 0.1.0 |
| Prefix sums under updates | Fenwick (BIT) | O(log n) update / prefix | 0.2.0 |
| Associative range query + point update | SegmentTree | O(log n) query / update | 0.3.0 |
| Ordered map / successor / range iterate | SkipList | expected O(log n) | 0.4.0 |

Per-member "reach for it / avoid it / measure it yourself" sections land with
each member release (BinaryHeap's section is pending; Fenwick's, SegmentTree's
and SkipList's are below).

---

## Fenwick (BIT) -- prefix sums that stay correct under point updates

**Reach for it when** you need a running total / prefix sum over an array whose
elements KEEP CHANGING, and you cannot afford an O(n) re-sum per query or an O(n)
rebuild per update. Fenwick makes BOTH the point-update and the prefix-query
O(log n) over one flat `Float64Array`. Canonical uses: cumulative frequency
tables, a sliding "sum of the first k" under edits, order-statistics-by-count
(how many elements <= x), rolling weighted totals, any "prefix that must stay
live" workload. `rangeSum(lo, hi)` (inclusive both ends) and `at(i)` fall out of
the same walk for free.

**Avoid it when:**

- Your array is STATIC (no updates after load). A plain prefix-sum array gives
  O(1) queries -- Fenwick's O(log n) query buys you nothing if nothing changes.
- You need a NON-invertible fold over ranges (min / max / gcd), not a sum.
  Fenwick's `rangeSum` works because subtraction inverts addition; min has no
  inverse. Reach for **SegmentTree** (v0.3.0) instead.
- Your keys are arbitrary values, not dense integer indices in `[0, length)`.
  Fenwick is indexed by position, not keyed; use an ordered map (**SkipList**,
  v0.4.0) for key-addressed structure.
- You need exact integer sums beyond 2^53. Values are IEEE-754 doubles, so very
  large integer corpora lose the last ULP -- the step count is exact, the last
  bit of the sum is not.

**Measure it yourself:** `npm run witness` fits `update` and `prefix` against
`nsPerOp = intercept + slope*log2(n)`. Both must clear the shared R^2 floor
(0.958) and sit inside their own slope bands (`update [1.84, 4.30]`,
`prefix [1.76, 4.10]` ns/level -- lower than BinaryHeap's pop because a single
`i & -i` touch per level is cheaper than a sift; see
[`decisions/0004-witness-band.md`](./decisions/0004-witness-band.md)). Both O(n)
foils -- a prefix-array rebuild per update, a naive re-sum per query -- must MISS
the floor (they fit at R^2 ~ 0.76). If your workload's fit leaves the line, your
`n` is outside the honest steady band or your access pattern is memory-bound.

---

## SegmentTree -- any associative fold over a range, under point updates

**Reach for it when** you need a range query that is NOT a plain sum -- a range
MIN, range MAX, or range GCD -- over an array whose elements keep changing, and
you cannot afford an O(n) scan per query. SegmentTree folds any associative +
commutative operation (min / max / sum / gcd) over `[lo, hi]` INCLUSIVE in
O(log n), with point `update` also O(log n) and `at` O(1). Canonical uses:
sliding-window minima under edits, "cheapest / hottest in this range right now",
range-GCD queries, or a range-SUM when you also want the SAME structure to serve
a min/max query. The fold is fixed at construction, so pick the kind up front.

**Avoid it when:**

- You only ever need a range SUM (no min / max / gcd). **Fenwick** (v0.2.0) is
  leaner: one `n`-wide array vs SegmentTree's `2n`, and its `i & -i` walk is a
  hair cheaper per level. Reach for SegmentTree when the fold is non-invertible
  (min / max / gcd) or when one structure must serve several range folds.
- Your array is STATIC (no updates after load). For a static range-min / max, a
  sparse table gives O(1) queries -- see `@zakkster/lite-o1`'s `SparseTable`.
  SegmentTree's O(log n) query buys you nothing if nothing changes.
- You need a NON-commutative fold (matrix product, string concat, non-abelian
  monoid). The iterative `2n` layout mixes left- and right-boundary contributions
  into one accumulator, so it is correct ONLY for commutative folds; a
  non-commutative fold needs a pow2 layout with separate ordered accumulators
  (see [`decisions/0005-segtree.md`](./decisions/0005-segtree.md)).
- You need RANGE updates (add x to every element in `[lo, hi]`). v0.3.0 is
  point-update only; lazy propagation is deferred (D-05).

**Measure it yourself:** `npm run witness` fits `update` and `query` against
`nsPerOp = intercept + slope*log2(n)`. Both must clear the shared R^2 floor
(0.958) and sit inside their own slope bands (`update [2.29, 5.35]`,
`query [4.30, 10.04]` ns/level -- query is steeper because it folds ~2 nodes per
level where update writes one; see
[`decisions/0005-segtree.md`](./decisions/0005-segtree.md)). The gated sweep is
EXACT powers of two in `[2^10, 2^16]`: a segment-tree op touches a node per level
spread across the `2n` array, so above ~2^16 the tree leaves the steady cache
band, and exact powers keep the range decomposition a regular node count. Both
O(n) foils -- a whole-tree rebuild per update, a scan-fold per query -- must MISS
the floor. If your workload's fit leaves the line, your `n` is above the steady
cache band or your access pattern is memory-bound.

---

## SkipList -- an ordered map with successor / predecessor / range iteration

**Reach for it when** you need a KEY-ADDRESSED ordered collection: get / set /
delete by an arbitrary numeric key, PLUS ordered queries the array-embedded members
cannot give -- `successor(k)` (next key up), `predecessor(k)` (next key down), and
`rangeIter(lo, hi)` (every key in a window, in order). Canonical uses: a sorted
index that keeps changing, "the next event at or after time t", nearest-key lookups,
an ordered set / map where you also iterate in order. Keys are arbitrary finite
numbers (not dense indices), which is exactly what Fenwick / SegmentTree cannot do
-- they are indexed by position in `[0, length)`. Deterministic from an
instance-local seed, so a fixed seed replays an identical structure.

**Avoid it when:**

- You only need MIN / MAX with insert (a priority queue), not key-addressed lookup
  or ordered iteration. **BinaryHeap** (v0.1.0) is leaner and worst-case O(log n);
  a skip list is expected O(log n) and carries per-node link columns it does not
  need.
- Your keys are dense integer INDICES in `[0, length)` and you want prefix sums or
  range folds. Use **Fenwick** (v0.2.0) or **SegmentTree** (v0.3.0) -- indexed, flat,
  worst-case O(log n), no pointer columns.
- You need a WORST-CASE bound. A skip list is EXPECTED O(log n): an unlucky seed can
  build a tall thin tower and spike a single op (the witness prints that MAX single
  insert). If a hard worst-case matters, reach for a balanced BST member (a later
  tier) instead.
- Your keys are bounded small integers and you want O(1). That is `@zakkster/lite-o1`
  territory (SparseSet / a bucketed structure), not an O(log n) ordered map.

**Measure it yourself:** `npm run witness` fits `get` and `set` against
`nsPerOp = intercept + slope*log2(n)`. Both must clear the shared R^2 floor (0.958)
and sit inside their own slope bands (`get [5.27, 12.30]`, `set [8.36, 19.50]`
ns/level -- steeper than the array members because a skip list chases a random slot
INDEX per level, not an arithmetic one; see
[`decisions/0006-skiplist.md`](./decisions/0006-skiplist.md)). The two ops are gated
over DIFFERENT sweeps -- `get` (a clean search) over `[2^11, 2^17]` for dynamic
range; `set` (a heavier insert+delete churn with a random-height splice) over the
cache-resident `[2^9, 2^14]` so the fit sees the structural level count, not DRAM
latency. Both O(n) foils -- a linear scan per search, a sorted-array insert per write
-- must MISS the floor. The witness ALSO prints the MAX single insert (the unlucky-
tower tail): if your workload cares about the tail, not the mean, read that bar.

---

## Family boundary (where NOT to reach for lite-logn)

- **Bounded-integer priorities** -> `@zakkster/lite-o1` `BucketQueue` (Dial,
  O(1)) or `@zakkster/lite-scheduler` `FastBitScheduler`. A heap's O(log n) is
  the wrong tool when priorities are small bounded integers.
- **Approximate membership** -> `@zakkster/lite-filter` (Bloom / cuckoo /
  binary-fuse). lite-logn owns exact ordered structures.
- **Caching / eviction** -> `@zakkster/lite-lru`. It uses ordering internally but
  is a cache, not an ordered-collection library.

---

MIT (c) Zahary Shinikchiev
