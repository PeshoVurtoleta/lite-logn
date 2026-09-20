# lite-logn -- which structure to pick (GUIDE)

A repo-only decision guide for the O(log n) family: which member, reach-for /
avoid, and how to measure the logarithm yourself. At v0.7.0 seven members have
shipped -- BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat and
MinMaxHeap -- so this guide carries their per-member sections. It is NOT an API
encyclopedia (that is the README + `LogN.d.ts`); it answers "which member, and is
my logarithm real?"

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
|   ordered iteration)?                                         -> SkipList (exp)     [v0.4.0]
|
+-- ORDER STATISTICS (rank / select) or set SURGERY (split /
|   merge) on an ordered map?                                   -> Treap (exp)       [v0.5.0]
|
+-- ORDER STATISTICS (rank / select) with a HARD WORST-CASE
|   per-lookup bound (no unlucky-tail spike), and set/delete
|   can be amortized?                                           -> Scapegoat (wc/am) [v0.6.0]
|
+-- BOTH the min AND the max, repeatedly, with insert
    (a double-ended priority queue)?                           -> MinMaxHeap (wc)   [v0.7.0]
```

Heap tiebreak: **BinaryHeap** for ONE frozen extreme (min OR max) with an
addressable `changeKey` / `remove` by entity id; **MinMaxHeap** when you need BOTH
extremes from one structure (a DEPQ: O(1) `peekMin` AND `peekMax`, O(log n)
`push` / `popMin` / `popMax`) and do NOT need addressable reprioritize/remove (its
id is an opaque, non-unique payload -- no reverse map).

Ordered-map tiebreak: **SkipList** for a plain ordered map (get / set / successor
/ range) with the flattest surface; **Treap** when you ALSO need `rank(x)` (how
many keys are `< x`), `select(k)` (the k-th smallest), or O(log n) `split` /
`merge`; **Scapegoat** when you need the same order statistics but a DETERMINISTIC
**worst-case** per-lookup bound -- no RNG, no unlucky-tail spike (its `get` is
worst-case O(log n), the price being amortized-O(log n) `set` / `delete` with an
occasional rebuild). Treap vs Scapegoat is the expected-vs-worst-case pair: reach
for Treap when you need `split` / `merge` (Scapegoat has none) or the smoothest
per-op latency; reach for Scapegoat when a single slow lookup is unacceptable and
you can absorb the amortized rebuild on writes. All three are ordered maps; Treap
and Scapegoat add the order-statistic column, SkipList is the leaner plain store.

---

## Picker table

| Need | Member | Bound | Version |
| --- | --- | --- | --- |
| Repeated min / max + insert | BinaryHeap | O(log n) push / pop, O(1) peek | 0.1.0 |
| Prefix sums under updates | Fenwick (BIT) | O(log n) update / prefix | 0.2.0 |
| Associative range query + point update | SegmentTree | O(log n) query / update | 0.3.0 |
| Ordered map / successor / range iterate | SkipList | expected O(log n) | 0.4.0 |
| Ordered map + rank / select / split / merge | Treap | expected O(log n) | 0.5.0 |
| Ordered map + rank / select, WORST-case get (no RNG) | Scapegoat | worst-case O(log n) get, amortized O(log n) set/delete | 0.6.0 |
| BOTH min AND max + insert (a double-ended PQ) | MinMaxHeap | O(1) peekMin/peekMax, O(log n) push/popMin/popMax | 0.7.0 |

Per-member "reach for it / avoid it / measure it yourself" sections land with
each member release (BinaryHeap's section is pending; Fenwick's, SegmentTree's,
SkipList's, Treap's, Scapegoat's and MinMaxHeap's are below).

---

## Measured cost (the benchmark suite)

Numbers, not adjectives. The repo-only suite (`npm run bench` -> tables +
`benchmark/results.json`; `npm run bench:report` -> inline-SVG `report.html`)
measures every member across eight dimensions; D1 is the O(log n) Witness itself
(delegated to `test/witness.mjs`). One run, Apple M4 Pro (arm64), Node v26 --
machine-specific, reproducible from seed `0x9e3779b1`.

**Per-level cost (D1 slope, ns/level -- the price of one added level per doubling):**

| Op | slope ns/level | `R^2` | memory (B/live) | pick it when |
| --- | --- | --- | --- | --- |
| `Fenwick.update` / `.prefix` | 2.6 - 2.8 | 0.97 - 0.98 | 8 (exact) | the cheapest per-level cost + the tightest memory; sum-only prefix/range |
| `SegmentTree.update` | 3.1 | 0.99 | 16 (exact) | any associative fold (min/max/sum/gcd), point update |
| `SegmentTree.query` | 7.0 | 0.998 | 16 (exact) | as above -- a range fold is ~2 nodes/level, so its slope is higher than update's |
| `BinaryHeap.pop` | 8.4 | 0.996 | 16 | repeated extremum + addressable reprioritize |
| `SkipList.get` | 8.0 | 0.988 | 88 | an ordered map: successor / predecessor / range |
| `SkipList.set` | 12.1 | 0.985 | 88 | as above -- insert is a double descent + a random-height splice |
| `Treap.get` | 4.0 | 0.988 | 16 | an ordered map WITH rank / select / split / merge -- lower per-level cost + leaner store than SkipList |

Read it as a ladder: the index-addressed array members (Fenwick, SegmentTree)
are the cheapest per level AND the tightest in memory; the comparison-ordered
members (BinaryHeap, SkipList) cost more per level and, for SkipList, carry the
`ceil(log2 cap)+1` link-column tower (88 B/live) that BUYS the ordered queries.

**The order tax (SkipList vs a native Map).** If you only need `get` / `set` by
exact key and NEVER `successor` / `predecessor` / `rangeIter`, a native `Map` is
O(1) (`~27 ns/op`, flatter than any log line) -- reach for it. The moment you need
even one ordered query, Map cannot answer it at all; SkipList's log factor is the
honest price of order. Every gated op-row is **0 B/op** (D6, and the precise
`node --expose-gc test/torture.mjs` proof). SkipList is EXPECTED O(log n): the
witness discloses a MAX single insert (`~18-130 us`, an unlucky tall tower) a mean
would hide -- if a bounded worst-case per op matters more than the average, prefer
the array-embedded members whose bound is worst-case, not expected.

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

## Treap -- an ordered map with order statistics + set surgery

**Reach for it when** you need everything SkipList offers (key-addressed get / set /
delete, `successor` / `predecessor` / `rangeIter`) PLUS one of the augmented queries a
plain ordered map cannot answer: `rank(x)` (how many stored keys are strictly `< x` --
the position of a key), `select(k)` (the k-th smallest key -- the inverse of rank), or
O(log n) `split(key)` / `Treap.merge(a, b)` (cut an ordered set in two at a key, or
splice two disjoint ranges back together). Canonical uses: a live leaderboard (rank /
select), an order-statistic index, percentile queries over a changing set, "the item
at position k in sorted order", or an ordered set you repeatedly partition and rejoin.
Keys are arbitrary finite numbers. Deterministic from an instance-local seed.

**Avoid it when:**

- You need a plain ordered map and will NEVER call rank / select / split / merge.
  **SkipList** (v0.4.0) is the same expected-O(log n) ordered map without the subtree-
  size column -- though note Treap's per-level cost is actually lower and its store is
  leaner (16 B/live vs 88), so "avoid" here is really "either works; SkipList if you
  want the narrower surface."
- You only need MIN / MAX with insert. **BinaryHeap** (v0.1.0) is leaner and worst-case
  O(log n); a treap carries child + priority + size columns a heap does not need.
- Your keys are dense integer INDICES and you want prefix sums or range folds. Use
  **Fenwick** (v0.2.0) or **SegmentTree** (v0.3.0) -- indexed, flat, worst-case O(log n).
- You need a WORST-CASE bound. A treap is EXPECTED O(log n): an unlucky priority draw
  can build a tall thin tree and spike a single op (the rotation chain -- the witness
  prints that MAX single insert). set / delete / split / merge recurse to the tree
  height (O(n) worst-case), though the instance-local priority PRNG makes that
  unreachable via caller-chosen keys. If a hard worst-case matters, a deterministic
  balanced BST (a later tier) is the fit.
- You want `split` / `merge` to return INDEPENDENT copies. They rewire in place and
  SHARE the source arena (consuming their inputs) -- that is what keeps them O(log n).

**Measure it yourself:** `npm run witness` fits `get` against
`nsPerOp = intercept + slope*log2(n)`; it must clear the shared R^2 floor (0.958) and
sit inside its own band (`get [2.55, 5.95]` ns/level -- LOWER than SkipList's because a
BST descent touches one node per level, not a tower of links; see
[`decisions/0007-treap.md`](./decisions/0007-treap.md)), over the `[2^11, 2^17]` sweep.
The O(n) linear-scan foil must MISS the floor. The witness ALSO prints the MAX single
insert (the unlucky-priority rotation-chain tail): if your workload cares about the
tail, not the mean, read that bar. `node --expose-gc test/torture.mjs` proves every hot
op (get / set / delete / rank / select / successor / forEach / rangeIter) at 0 B/op.

---

## Scapegoat -- a deterministic ordered map with order statistics, worst-case get

**Reach for it when** you need everything Treap's ordered-map + order-statistic surface
offers (get / set / delete, `successor` / `predecessor` / `rangeIter`, `rank(x)`,
`select(k)`) BUT a single slow lookup is unacceptable: Scapegoat is DETERMINISTIC, so
`get` / `rank` / `select` are WORST-CASE O(log n) (a hard height bound
`<= log_{1/alpha}(n) + 1`), never merely expected -- there is no RNG and therefore no
unlucky-tail spike on reads. It is the honest PAIR to Treap: the reads are worst-case,
the price being AMORTIZED O(log n) `set` / `delete` (an occasional subtree rebuild
absorbs the imbalance in bulk). Canonical uses: a read-latency-sensitive
order-statistic index / leaderboard where a tail-spike on a query would breach an SLA,
a percentile query over a changing set with predictable lookup cost, any ordered map
where you want a reproducible shape from the insert order (no seed, no RNG). Keys are
arbitrary finite numbers; `alpha` (default `2/3`) trades rebuild frequency against
height -- closer to `0.55` = tighter height, more rebuilds; closer to `0.75` = looser
height, fewer rebuilds.

**Avoid it when:**

- You need `split` / `merge`. Scapegoat has NEITHER (no priority heap to merge by; an
  honest deterministic split/merge would be O(n) rebuilds) -- reach for **Treap**
  (v0.5.0), which carries the arena-sharing set surgery for the family.
- Your WRITES are latency-sensitive at the tail. Scapegoat's `set` / `delete` are
  AMORTIZED: most are a plain descent, but an occasional one triggers a subtree (or, on
  delete, whole-tree) rebuild -- a real spike, disclosed by the amortized-trace witness.
  If you need smooth per-write latency AND can tolerate an expected (not worst-case)
  read, **Treap** (v0.5.0) is the fit; if you need worst-case writes too, that is a
  different structure than any lite-logn member ships.
- You need a plain ordered map and never call rank / select. **SkipList** (v0.4.0) is
  the leaner store.
- You only need MIN / MAX with insert (**BinaryHeap**), or your keys are dense integer
  indices for prefix sums / range folds (**Fenwick** / **SegmentTree**).

**Measure it yourself:** `npm run witness` fits `get` against
`nsPerOp = intercept + slope*log2(n)`; it must clear the shared R^2 floor (0.958) and
sit inside its own band (`get [2.41, 5.63]` ns/level -- a touch LOWER than Treap's
because a scapegoat is more balanced than a random treap; see
[`decisions/0008-scapegoat.md`](./decisions/0008-scapegoat.md)), over the `[2^11, 2^17]`
sweep. The O(n) linear-scan foil must MISS the floor. Because `get` is worst-case there
is no expected-op MAX-single-op bar; instead the witness runs the AMORTIZED-TRACE
assertion -- the cumulative ascending-insert (rebuild-heavy) cost/op must track a LOG
curve (last/first ratio `< 4x` over `[2^11, 2^17]`), proving the rebuilds amortize away.
`node --expose-gc test/torture.mjs` proves every hot op -- INCLUDING a rebuild-heavy
ascending-insert lane -- at 0 B/op (the rebuild reuses preallocated scratch, never a
fresh array).

---

## MinMaxHeap -- a double-ended priority queue (both extremes from one heap)

**Reach for it when** you need BOTH the smallest AND the largest element, repeatedly, with
insert -- a double-ended priority queue (DEPQ). MinMaxHeap serves both ends from ONE
array-embedded binary heap whose levels alternate min / max: `peekMin` / `peekMax` /
`peekMinKey` / `peekMaxKey` are O(1), and `push` / `popMin` / `popMax` are all WORST-case
O(log n). Canonical uses: a bounded "keep the k best AND drop the worst" buffer, a
sliding min-and-max window, a median-ish / trimming structure that evicts from both ends,
any priority workload that pops from the top AND the bottom. It is the id+key idiom
BinaryHeap uses (an opaque Uint32 payload + a finite-number key), so it stores a payload
per entry without object nodes.

**Avoid it when:**

- You only ever need ONE extreme (min OR max). **BinaryHeap** (v0.1.0) is the leaner
  single-ended heap -- and it is ALSO the one to reach for when you need addressable
  `changeKey` / `remove` by entity id: MinMaxHeap is deliberately NON-addressable (no
  reverse map), so it has no `changeKey` / `remove`, and its id is an opaque, NON-unique
  payload (duplicates allowed).
- You need to reprioritize or remove an arbitrary element. MinMaxHeap cannot (no `_pos`
  map) -- use **BinaryHeap** for the addressable priority queue.
- Your priorities are small bounded integers -> `@zakkster/lite-o1` `BucketQueue` (O(1)),
  not a comparator heap's O(log n).

**Measure it yourself:** `npm run witness` fits `popMin` (the full-height level-aware
trickle-down) against `nsPerOp = intercept + slope*log2(n)`; it must clear the shared R^2
floor (0.958) and sit inside its own band (`popMin [6.18, 14.42]` ns/level -- a touch
ABOVE BinaryHeap.pop's because a min-max trickle-down compares against up to six
descendants per level; see [`decisions/0009-minmaxheap.md`](./decisions/0009-minmaxheap.md)),
over the `[1e4, 1e6]` sweep. The O(n) linear min-scan-and-splice foil must MISS the floor.
push / popMin / popMax are ALL worst-case O(log n), so there is no expected-op
MAX-single-op bar. `node --expose-gc test/torture.mjs` proves the popMin / popMax / mixed
push+popMin+popMax churn and the peek reads at 0 B/op (hole-punching sifts, only local
scalar temporaries).

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
