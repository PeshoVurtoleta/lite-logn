# lite-logn -- which structure to pick (GUIDE)

A repo-only decision guide for the O(log n) family: which member, reach-for /
avoid, and how to measure the logarithm yourself. At v0.14.0 fourteen members have
shipped -- BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat,
MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D,
SegmentTree2D and SortedArray -- so this guide carries their per-member sections. It is NOT an API
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
`(am)` = amortized, `(exp)` = expected. At v0.14.0 all fourteen members have
shipped; each branch's `[vX.Y.Z]` tag records the release it landed in.

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
|   (a double-ended priority queue)?                           -> MinMaxHeap (wc)   [v0.7.0]
|
+-- An ORDERED map whose ACCESS is SKEWED (temporal locality:
|   a hot working set), and you want hot keys to ride near
|   the root -- amortized, no order statistics needed?         -> SplayTree (am)    [v0.8.0]
|
+-- Repeated min (or max) + insert, AND you must MELD two
|   priority queues into one in O(log n) (not O(n) rebuild)?   -> BinomialHeap (wc) [v0.9.0]
|
+-- Repeated min (or max) + insert, AND you must DECREASE-KEY /
|   remove an arbitrary element by id, AND/OR MELD in O(1)
|   (e.g. a Dijkstra / Prim relaxation loop)?                  -> PairingHeap (am)  [v0.10.0]
|
+-- Same as PairingHeap, but you want the textbook-optimal
|   O(1)-amortized decrease-key bound ON PAPER (a teaching /
|   analysis reference) and accept slower real wall-clock?     -> FibonacciHeap (am) [v0.11.0]
|
+-- RECTANGLE SUMS over a 2D grid that stay correct under
|   point updates (2D prefix sums; SUM only, not min/max)?     -> Fenwick2D (wc)    [v0.12.0]
|
+-- 2D rectangle MIN / MAX / GCD (or SUM) over a grid that
|   stay correct under point updates (a general 2D fold that
|   a sum-only 2D BIT cannot do; ~4x the space)?              -> SegmentTree2D (wc) [v0.13.0]
|
+-- An ORDERED map where READS dominate and writes are rare,
    and you want O(1) select / min / max / order-statistic
    index + the fastest ordered iteration (a sorted array)?  -> SortedArray (wc)   [v0.14.0]
```

Heap tiebreak: **BinaryHeap** for ONE frozen extreme (min OR max) with an
addressable `changeKey` / `remove` by entity id; **MinMaxHeap** when you need BOTH
extremes from one structure (a DEPQ: O(1) `peekMin` AND `peekMax`, O(log n)
`push` / `popMin` / `popMax`) and do NOT need addressable reprioritize/remove (its
id is an opaque, non-unique payload -- no reverse map); **BinomialHeap** when you
need ONE extreme AND the ability to **MELD two heaps in O(log n)** -- the mergeable
op a single array-embedded heap (BinaryHeap / MinMaxHeap) cannot do without an O(n)
rebuild. BinomialHeap is also non-addressable (opaque id, no `decreaseKey` /
`remove`); its meld requires both heaps to share an arena (`BinomialHeap.arena(...)`)
and CONSUMES the argument. Pick BinaryHeap/MinMaxHeap over BinomialHeap when you never
meld: they are faster per op (a flat array beats a pointer-chased forest).
**PairingHeap** is the ADDRESSABLE mergeable heap: like BinomialHeap it melds two
arena-sharing heaps (and CONSUMES the argument), but its meld is **O(1)** (better than
BinomialHeap's O(log n)) AND it supports **`decreaseKey` / `remove` / `has` / `keyOf`
by an arena-wide-unique id** -- the reprioritize-by-id BinomialHeap declines to carry.
Pick PairingHeap over BinomialHeap when you need decrease-key or an O(1) meld (the
graph-algorithm case); pick BinomialHeap over PairingHeap when you never reprioritize
and want a smaller per-node footprint (no reverse map / owner / alias). `decreaseKey`
moves TOWARD the extreme only (decrease for 'min', increase for 'max'); a move away
fails closed. A `decreaseKey` / `remove` on a **sibling** heap's id fails closed.
**FibonacciHeap** is the arc's FINALE: the SAME addressable + mergeable surface as
PairingHeap (decrease-key / remove by arena-wide-unique id, an O(1) meld), reaching
the tightest textbook amortized bounds (O(1)-amortized push/meld/decreaseKey via
cascading cuts + a mark bit, O(log n)-amortized popMin/remove via degree
consolidation). But it is **often SLOWER wall-clock than PairingHeap or BinaryHeap**
on real hardware -- large constant factors, long consolidation/cascade spikes (the
benchmark shows it losing plainly). Pick **FibonacciHeap** only when the ASYMPTOTIC
bound is the point (a teaching reference, or an analysis that needs the O(1)-amortized
decrease-key on paper); pick **PairingHeap** for the same surface at the best
real-world speed. It is shipped for completeness, not because it wins.

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
**SplayTree** is the fourth ordered map and the odd one out: it is SELF-ADJUSTING
(a `get` / `has` SPLAYS the touched key to the root), so it is the pick when your
access is SKEWED / has temporal locality -- hot keys ride near the top and cost
less than log n amortized. Its price: a read RESTRUCTURES (so it fails an in-flight
`rangeIter`, and is not read-only-safe under iteration), it is AMORTIZED not
worst-case (a cold deep access can splay an O(n) chain, disclosed by the witness),
and it is LEAN (no `rank` / `select` / `split` / `merge`). Reach for Scapegoat, not
SplayTree, when a single slow lookup is unacceptable; reach for SplayTree when the
workload is hot-key-skewed and you want the self-optimizing shape.
**SortedArray** is the fifth ordered map and the read-optimized one: it stores keys +
values in two parallel SORTED arrays (contiguous, not pointer-chased), so it is the
pick when READS DOMINATE and writes are rare -- it has the fastest `get` (a packed
lower-bound binary search), O(1) `select` / `keyAt` / `valueAt` / `min` / `max` (a raw
array index), and the fastest ordered `forEach` (a straight cache scan) of any member
here, plus `rank` / `successor` / `predecessor` in O(log n). Its price is the write:
`set` / `delete` are **O(n)** (an in-place `copyWithin` tail shift), so a write-heavy
workload should reach for SkipList / Treap / Scapegoat (O(log n) writes) instead.
SortedArray vs the BST ordered maps is the reads-vs-writes pair: reach for SortedArray
when the map is built rarely and queried often (and you want O(1) order statistics +
the leanest iteration); reach for a BST when inserts and deletes are frequent.

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
| Ordered map with SKEWED / hot-key access (self-adjusting) | SplayTree | amortized O(log n) get/set/delete (a read splays) | 0.8.0 |
| Priority queue you must MELD with another in O(log n) | BinomialHeap | O(1)-amortized push, O(log n) popMin/meld, O(1) peekMin | 0.9.0 |
| Priority queue with DECREASE-KEY / remove by id, and/or O(1) MELD (graph algorithms) | PairingHeap | O(1) push/meld, amortized O(log n) popMin/decreaseKey/remove | 0.10.0 |
| Same addressable + mergeable surface, textbook-optimal bounds ON PAPER (teaching / analysis; slower wall-clock) | FibonacciHeap | O(1)-amortized push/meld/decreaseKey, O(log n)-amortized popMin/remove | 0.11.0 |
| 2D grid RECTANGLE SUMS under point updates (2D prefix sums; SUM only) | Fenwick2D | O(log^2 n) update / prefix / rectSum | 0.12.0 |
| 2D grid RECTANGLE MIN / MAX / GCD / SUM under point updates (a general 2D fold; ~4x the space of a 2D BIT) | SegmentTree2D | O(log^2 n) update / query | 0.13.0 |
| Read-optimized ordered map (reads dominate, writes rare); O(1) select / min / max + fastest iteration | SortedArray | O(log n) get / rank / successor; O(1) select / keyAt / valueAt / min / max; O(n) set / delete | 0.14.0 |

Per-member "reach for it / avoid it / measure it yourself" sections land with
each member release (BinaryHeap's section is pending; Fenwick's, SegmentTree's,
SkipList's, Treap's, Scapegoat's, MinMaxHeap's, SplayTree's, BinomialHeap's, PairingHeap's, FibonacciHeap's, Fenwick2D's, SegmentTree2D's and SortedArray's are below).

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

## SplayTree -- a self-adjusting ordered map (hot keys ride near the root)

**Reach for it when** your ordered-map access is SKEWED -- a hot working set, temporal
locality, a Zipf-ish key distribution. A splay tree moves every touched key to the root
(an iterative top-down splay), so recently / frequently used keys stay shallow and cost
LESS than log n amortized. Canonical uses: an LRU-ish index whose recent keys dominate,
a parser / interpreter symbol table where a few identifiers are hot, any ordered store
where 90% of the lookups hit 10% of the keys. It is DETERMINISTIC (no RNG, no seed) and
the LEANEST ordered map to build: four flat columns over the shared free-list, no balance
metadata at all.

**Avoid it when:**

- A single slow lookup is unacceptable. SplayTree is AMORTIZED, not worst-case: a cold,
  deep access can splay an O(n) chain (the witness DISCLOSES the max single get). For a
  hard per-lookup bound use **Scapegoat** (worst-case O(log n) get, no RNG).
- Your access is UNIFORM / random with no locality. There is no hot set to cache, so you
  pay the splay's restructuring cost (rotations every read) for no benefit -- a plain
  ordered map (**SkipList**) or a read-cheap balanced BST (**Scapegoat**) is leaner.
- You need order statistics (`rank` / `select`) or set surgery (`split` / `merge`).
  SplayTree is LEAN and has NONE -- use **Treap** or **Scapegoat**.
- You iterate while reading. A `get` / `has` SPLAYS (restructures + bumps the version),
  so a read taken inside a `rangeIter` fails closed. Reads are not iteration-safe here;
  finish the walk first (or use a read-only member).
- You do a FULL `forEach` / `[Symbol.iterator]` / `rangeIter` walk over a tree built by pure
  SORTED insertion with no intervening access. The non-splaying walks RE-DESCEND by key each
  step (`O(n * depth)`), and a sorted-cold splay tree is a depth-n chain, so the walk degrades
  to `O(n^2)`. A splay tree self-balances only through access -- splay a key (or insert in mixed
  order) before a big walk, or reach for **SkipList** / **Treap** / **Scapegoat** if you build
  sorted and iterate before ever reading.

**Measure it yourself:** `npm run witness` fits `get` over a UNIFORM-RANDOM working set of
size n (so the amortized line shows -- a skewed pattern would flatten it, which is the
member's WHOLE POINT but not what a straight-log witness measures) against `nsPerOp =
intercept + slope*log2(n)`; it must clear the shared R^2 floor (0.958) and sit inside its
own band (`get [16.39, 38.24]` ns/level -- well ABOVE the read-only BST members because a
splay REWRITES links on every read; see [`decisions/0010-splaytree.md`](./decisions/0010-splaytree.md)),
over the `[2^12, 2^17]` sweep. The O(n) linear-scan foil must MISS the floor. Because it is
amortized, the witness also prints the MAX single get (a cold deep splay) as a disclosure,
never gated. `node --expose-gc test/torture.mjs` proves get (splays!) / working-set get /
set / delete+re-set / successor / forEach / rangeIter at 0 B/op (the top-down splay uses the
slot-0 header + two scalar hands; rotations rewrite existing slot links only).

---

## BinomialHeap -- a mergeable priority queue (meld two heaps in O(log n))

**Reach for it when** you need a priority queue that you must **MELD** with another one --
fuse two queues into a single ordered heap in O(log n), the op a plain array-embedded heap
(BinaryHeap / MinMaxHeap) cannot do without an O(n) rebuild. Canonical uses: merging
per-worker or per-partition priority queues into a global one; a Dijkstra / Prim frontier
assembled from sub-frontiers; any "combine these two work queues" step on a hot path. `push`
is O(1) amortized, `popMin` is O(log n), `peekMin` / `peekMinKey` are O(1). `kind` ('min' |
'max') is frozen at construction. To meld, both heaps must share ONE arena
(`BinomialHeap.arena(capacity, kind, count)`); a standalone `new BinomialHeap(...)` owns its
own arena and can only meld with siblings from the same `arena(...)` call.

**Avoid it when:**

- You never meld. A single array-embedded heap is faster per op (a flat `Float64Array` beats
  a pointer-chased forest, and the witness slope shows it: ~45 ns/level vs BinaryHeap's ~9).
  Use **BinaryHeap** (one extreme, addressable) or **MinMaxHeap** (both extremes) instead.
- You need to reprioritize or remove an arbitrary element. BinomialHeap is LEAN +
  non-addressable: the id is an opaque, non-unique payload (no reverse map), so there is no
  `decreaseKey` / `remove` / `changeKey`. For addressable reprioritize/remove use **BinaryHeap**.
- You need order statistics (`rank` / `select`) or an ordered scan (`successor` / range). A
  heap answers only the extreme -- use **Treap** / **Scapegoat** (order statistics) or
  **SkipList** (ordered scan).
- You reuse a melded-away heap. `a.meld(b)` CONSUMES `b`: it becomes empty and DEAD, and every
  later op on `b` throws (fail-closed, so a stale reference can never silently corrupt `a`).

**Measure it yourself:** `npm run witness` fits `popMin` (unlink the extreme root, reverse its
child list, union back, rescan the roots -- the mergeable heap's tallest honest walk) against
`nsPerOp = intercept + slope*log2(n)`; it must clear the shared R^2 floor (0.958) and sit
inside its own band (`popMin [26.89, 62.75]` ns/level -- well ABOVE the array-embedded heaps
because a binomial popMin chases scattered forest slots; see
[`decisions/0011-binomialheap.md`](./decisions/0011-binomialheap.md)), over the cache-resident
`[2^11, 2^17]` sweep. The O(n) linear min-scan-and-splice foil must MISS the floor. WORST-case
member (push / popMin / meld all worst-case), so NO max-single-op line. `node --expose-gc
test/torture.mjs` proves push / popMin / meld / arena-churn / forEach at 0 B/op, and asserts
conservation ACROSS MELD -- nodes move between root lists but never between pools.

---

## PairingHeap -- an ADDRESSABLE mergeable priority queue (decrease-key + O(1) meld)

**Reach for it when** you need a priority queue that supports **`decreaseKey` / `remove` by
id** AND/OR an **O(1) `meld`** -- the classic graph-algorithm heap. Canonical use: a
**Dijkstra / Prim relaxation loop**, where each edge relaxation decreases a frontier node's
key by its node id, and sub-frontiers are melded in O(1). `push` / `peekMin` / `peekMinKey` /
`meld` are O(1); `popMin` / `decreaseKey` / `remove` are amortized O(log n). ids are UNIQUE
ARENA-WIDE (integers in `[0, capacity)`); the reverse map is shared across every heap in the
arena, so `decreaseKey(id)` / `remove(id)` / `has(id)` / `keyOf(id)` are addressable by id.
`decreaseKey` moves TOWARD the extreme (decrease for 'min', increase for 'max'). `kind` is
frozen at construction. To meld, both heaps must share ONE arena
(`PairingHeap.arena(capacity, kind, count)`); a standalone `new PairingHeap(...)` owns its own
arena.

**Avoid it when:**

- You never decrease-key / remove by id AND never meld. A single array-embedded heap is faster
  per op (the witness slope shows it: ~22 ns/level vs BinaryHeap's ~9). Use **BinaryHeap** or
  **MinMaxHeap**.
- You meld but never reprioritize, and want a smaller per-node footprint. **BinomialHeap** has
  no reverse map / owner / alias columns; pick it when the addressable surface is dead weight
  (its meld is O(log n), PairingHeap's is O(1), so the trade is footprint vs meld cost).
- You need an unrestricted `changeKey` (either direction) or a private (non-arena) id space per
  heap. PairingHeap's `decreaseKey` moves TOWARD the extreme only, and its ids are unique
  arena-wide; for an either-direction `changeKey` over a per-instance id space use **BinaryHeap**.
- You need order statistics (`rank` / `select`) or an ordered scan (`successor` / range). A heap
  answers only the extreme -- use **Treap** / **Scapegoat** or **SkipList**.
- You reuse a melded-away heap, or touch a sibling heap's id. `a.meld(b)` CONSUMES `b` (empty,
  dead -- every later op throws); `decreaseKey` / `remove` on an id owned by a live sibling heap
  fails closed (an O(1) owner-tag check), never a silent cross-heap cut.

**Measure it yourself:** `npm run witness` fits `popMin` (unlink the root, TWO-PASS combine its
child list -- the pairing heap's tallest honest walk) against `nsPerOp = intercept +
slope*log2(n)`; it must clear the shared R^2 floor (0.958) and sit inside its own band
(`popMin [13.08, 30.52]` ns/level -- BETWEEN the array-embedded heaps and BinomialHeap, a single
multi-way tree not a forest; 15-sample median 21.799; see
[`decisions/0012-pairingheap.md`](./decisions/0012-pairingheap.md)), over the cache-resident
`[2^11, 2^17]` sweep. The O(n) linear min-scan-and-splice foil must MISS the floor. AMORTIZED
member: a single pop can fold a long child list, so the witness prints the MAX single popMin as a
disclosure, never gated. `node --expose-gc test/torture.mjs` proves push / popMin / decreaseKey /
remove / meld / arena-churn / forEach at 0 B/op (the two-pass combine is pointer-free, no temp
array), and asserts conservation ACROSS MELD and across the addressable decreaseKey / remove paths
-- nodes move between root lists but never between pools.

---

## FibonacciHeap -- the textbook-optimal ADDRESSABLE mergeable priority queue (the arc's finale)

**Reach for it when** the ASYMPTOTIC bound is the point: a teaching reference, or an analysis that
needs the O(1)-amortized `decreaseKey` on paper. FibonacciHeap (Fredman & Tarjan 1984) has the SAME
addressable + mergeable surface as PairingHeap -- `decreaseKey` / `remove` / `has` / `keyOf` by an
arena-wide-unique id, an O(1) `meld` -- and reaches the tightest textbook amortized bounds:
`push` / `meld` / `decreaseKey` O(1) amortized (a cascading cut governed by a per-node mark bit),
`popMin` / `remove` O(log n) amortized (a degree consolidation). ids are UNIQUE ARENA-WIDE; the
reverse map is shared across every heap in the arena; `decreaseKey` moves TOWARD the extreme;
`kind` is frozen at construction. To meld, both heaps must share ONE arena
(`FibonacciHeap.arena(capacity, kind, count)`); a standalone `new FibonacciHeap(...)` owns its own arena.

**The honest headline:** FibonacciHeap is textbook-optimal in ASYMPTOTICS but **often SLOWER
wall-clock than PairingHeap or BinaryHeap** on real hardware -- large constant factors, and long
consolidation / cascade spikes. The benchmark shows it losing plainly; it is shipped for
completeness and teaching, NOT because it wins. In practice, **PairingHeap is the one to reach for**
for the same addressable mergeable surface at the best real-world speed.

**Avoid it when:**

- You want the fastest addressable mergeable heap. Use **PairingHeap** -- same surface, a lean
  two-pass combine instead of a lazy-forest consolidation, and it usually wins wall-clock.
- You never decrease-key / remove by id AND never meld. Use **BinaryHeap** or **MinMaxHeap** (a flat
  array beats a pointer-chased forest by a wide margin).
- You meld but never reprioritize, and want a smaller per-node footprint. Use **BinomialHeap** (no
  reverse map / owner / alias / mark / degree columns).
- You need order statistics (`rank` / `select`) or an ordered scan. A heap answers only the extreme
  -- use **Treap** / **Scapegoat** or **SkipList**.
- You reuse a melded-away heap, or touch a sibling heap's id. `a.meld(b)` CONSUMES `b` (empty, dead
  -- every later op throws); `decreaseKey` / `remove` on a live sibling's id fails closed.

**Measure it yourself:** `npm run witness` fits `popMin` (splice the min root's children into the
root list, then CONSOLIDATE by degree -- the Fibonacci heap's tallest honest walk) against `nsPerOp
= intercept + slope*log2(n)`; it must clear the shared R^2 floor (0.958) and sit inside its own band
(`popMin [27.18, 63.41]` ns/level -- the FAMILY's STEEPEST per-level slope, a lazy forest
consolidated on demand; 15-sample median 45.296; see
[`decisions/0013-fibonacciheap.md`](./decisions/0013-fibonacciheap.md)), over the cache-resident
`[2^11, 2^17]` sweep. Because the full-drain average has genuine run-to-run SHAPE variance, this lane
gates on the MEDIAN of 7 independent sweep-fits (a single fit is flaky ~0.981-0.988 and can dip below
the floor across meta-runs) -- measurement-quality only, the frozen floor + band are untouched.
AMORTIZED member: a single popMin can do an O(n) consolidation and a single decreaseKey an O(n)
cascade, so the witness prints BOTH the MAX single popMin AND the MAX single decreaseKey as
disclosures, never gated. `node --expose-gc test/torture.mjs` proves push / popMin / decreaseKey /
remove / meld / arena-churn / forEach at 0 B/op (the cascade is iterative, no recursion; the degree
bucket is preallocated and cleared per call, never reallocated), and asserts conservation ACROSS MELD
and across the addressable decreaseKey / remove paths -- nodes move between root lists but never
between pools.

---

## Fenwick2D -- 2D rectangle sums that stay correct under point updates

**Reach for it when** you have a mutable 2D grid of counts / weights and need axis-aligned
RECTANGLE totals under point updates: heatmaps, 2D prefix analytics, an integral image that keeps
changing, a scoreboard over a coordinate plane. Fenwick2D lifts the 1D Fenwick's lowest-set-bit walk
to a rectangle: `update(r, c, delta)` and `prefix(r, c)` (the 2D prefix `[0..r] x [0..c]`) are both
O(log^2 n) = O(log rows * log cols), and `rectSum(r1, c1, r2, c2)` answers any axis-aligned rectangle
in O(log^2 n) via 2D inclusion-exclusion. Dims are frozen at construction; the whole grid is ONE flat
`Float64Array((rows+1)*(cols+1))`, zero allocation per op. Bulk-load a dense matrix with the O(rows*cols)
`Fenwick2D.build(matrix)`.

**Avoid it when:**

- You need 2D range **min / max / gcd** (not sum). Fenwick2D is SUM-ONLY -- `rectSum` works only
  because subtraction inverts addition, and min / max / gcd have no inverse. Those need a future 2D
  SegmentTree; do NOT try to fake them on a BIT.
- Your data is 1D. Use the 1D **Fenwick** (a rectangle collapses to a segment; the 2D machinery is
  wasted overhead).
- You key by value, not grid position, or you need `rank` / `select` / `changeKey`. Fenwick2D is
  index-addressed (by `(r, c)`), not keyed -- use an ordered map (**Treap** / **Scapegoat** /
  **SkipList**).
- The grid never changes. If updates never happen, a plain precomputed 2D prefix-sum array answers
  each query in O(1) -- Fenwick2D's O(log^2 n) query buys you nothing when nothing updates.

**Measure it yourself:** `npm run witness` fits BOTH `update` and `rectSum` against the family's FIRST
SQUARED-log axis, `nsPerOp = intercept + slope*(log2 n)^2` (its ops are O(log^2 n), not O(log n)); each
must clear the shared R^2 floor (0.958) and sit inside its own band (`update [2.13, 4.96]`, `rectSum
[2.90, 6.77]` ns per (log2 n)^2 unit; see [`decisions/0014-fenwick2d.md`](./decisions/0014-fenwick2d.md)),
over exact power-of-two square sides `[2^5, 2^11]`, while each O(n^2)-per-op dense-rescan foil leaves
the line. WORST-case member: every op is worst-case O(log^2 n), so there is no MAX-single-op line.
`node --expose-gc test/torture.mjs` proves update / prefix / rectSum / at / set at 0 B/op.

---

## SegmentTree2D -- the general 2D rectangle fold (min / max / sum / gcd) under point updates

**Reach for it when** you need an axis-aligned RECTANGLE query that is NOT a plain sum -- a rectangle
MIN, MAX, or GCD -- over a mutable 2D grid, and you cannot afford an O(rows*cols) scan per query.
SegmentTree2D is the 2D generalization of the 1D SegmentTree: a tree OF trees (an outer row segment
tree whose every node carries an inner column segment tree) that folds any associative + commutative
operation over the inclusive rectangle `[r1, c1]..[r2, c2]` in O(log^2 n) = O(log rows * log cols),
with point `update(r, c, value)` (an ABSOLUTE set, not a delta) also O(log^2 n) and `at(r, c)` O(1).
`kind` ('min' | 'max' | 'sum' | 'gcd') is frozen at construction. Canonical uses: a "cheapest / hottest
cell in this sub-region right now" heatmap under edits, sliding 2D-window minima, rectangle-GCD queries,
or a rectangle-SUM when you also want the SAME grid to serve a min/max query. Bulk-load a dense matrix
with `SegmentTree2D.build(matrix, kind)`.

**Avoid it when:**

- You only ever need a rectangle SUM (no min / max / gcd). **Fenwick2D** (v0.12.0) is far leaner: one
  `(rows+1)*(cols+1)` array (~1x the grid) vs SegmentTree2D's `4*rows*cols` (~4x the grid), and its
  nested `i & -i` walk is a hair cheaper per level. The 4x space is the honest price SegmentTree2D pays
  to fold the NON-invertible min / max / gcd a 2D BIT cannot. Reach for SegmentTree2D only when the fold
  is non-invertible, or when one grid must serve several rectangle folds.
- Your data is 1D. Use the 1D **SegmentTree** (a rectangle collapses to a segment; the tree-of-trees
  machinery is wasted overhead) -- or **Fenwick** for a 1D sum.
- The grid never changes (static). For a static 2D range-min / max a sparse-table variant gives O(1)
  queries; SegmentTree2D's O(log^2 n) query buys you nothing when nothing updates.
- You need a NON-commutative fold (matrix product, non-abelian monoid). Like the 1D SegmentTree, the
  iterative flat 2R x 2C layout mixes left- and right-boundary contributions into one accumulator, so it
  is correct ONLY for commutative + associative folds (see
  [`decisions/0015-segmenttree2d.md`](./decisions/0015-segmenttree2d.md)).
- You need RANGE updates (add x to every cell in a rectangle). v0.13.0 is point-update only; 2D lazy
  propagation is deferred.
- You key by value, not grid position, or you need `rank` / `select`. SegmentTree2D is index-addressed
  by `(r, c)` -- use an ordered map (**Treap** / **Scapegoat** / **SkipList**).

**Measure it yourself:** `npm run witness` fits BOTH `update` and `query` against the family's SECOND
SQUARED-log axis, `nsPerOp = intercept + slope*(log2 n)^2` (its ops are O(log^2 n), not O(log n)); each
must clear the shared R^2 floor (0.958) and sit inside its own band (`update [3.38, 7.89]`, `query
[3.06, 7.15]` ns per (log2 n)^2 unit; medians 5.638 / 5.105, both single-fit R^2 well clear of the floor
so NEITHER lane needs the median-of-fits hook; see
[`decisions/0015-segmenttree2d.md`](./decisions/0015-segmenttree2d.md)), over exact power-of-two square
sides `[2^5, 2^11]`, while each O(n^2)-per-op dense-rescan foil leaves the line. WORST-case member: every
op is worst-case O(log^2 n), so there is no MAX-single-op line. `node --expose-gc test/torture.mjs`
proves update / query / at / clear at 0 B/op.

---

## SortedArray -- the read-optimized ordered map (reads dominate, writes rare)

**Reach for it when** you have an ordered map / set that is BUILT rarely and QUERIED often, and you
want the leanest reads in the family. SortedArray keeps keys ascending in one flat `Float64Array` and
their values in a parallel one, so: `get` / `has` / `rank` / `successor` / `predecessor` are O(log n)
via a single contiguous lower-bound binary search (the family's SHALLOWEST per-level slope -- a packed
search touches fewer cache lines per level than a pointer-chasing BST descent); `select(k)` / `keyAt(k)`
/ `valueAt(k)` are O(1) (a raw array index -- order statistics for free, no augmentation); `min` / `max`
are O(1) (index 0 / size-1); and `forEach` is the fastest ordered iteration here (a straight cache scan,
no pointer-chasing). Keys are UNIQUE; `set` UPDATES the value in place when the key already exists
(O(log n), no shift). Canonical uses: a lookup table loaded once at startup then read in a hot loop, a
sorted index you occasionally patch, an order-statistic query surface (the k-th smallest, or "how many
keys below x") over a mostly-static set. Bulk-load two parallel array-likes with
`SortedArray.build(keys, values)` (O(n log n): sort once, load once).

**Avoid it when:**

- Writes are frequent. `set` (a genuine insert) and `delete` are **O(n)** -- an in-place `copyWithin`
  tail shift (0 B/op, but O(n) work). A write-heavy workload wants O(log n) writes: reach for **SkipList**
  (plain ordered map), **Treap** (also rank / select / split / merge), or **Scapegoat** (worst-case get).
  The O(n) insert is a DISCLOSED max-single-op bar the witness prints, never gated.
- Your access is hot-key-SKEWED and you want the structure to self-optimize. Reach for **SplayTree** (a
  read splays the hot key toward the root); SortedArray's cost is flat across all keys, it does not adapt.
- You need `split` / `merge` set surgery. SortedArray has none -- use **Treap**.
- You key by an object, or need duplicate keys / multiset semantics. SortedArray is a UNIQUE-key numeric
  map (finite-number keys AND values; `build` rejects a duplicate key); Symbol / BigInt / NaN / +-Infinity
  fail closed typeof-first.
- The data is a priority queue (you only ever want the extreme + pop). A heap (**BinaryHeap** /
  **MinMaxHeap**) is O(log n) pop with O(1) peek and no O(n) shift; SortedArray keeps the WHOLE order,
  which a PQ does not need.

**Measure it yourself:** `npm run witness` fits `get` against the default axis, `nsPerOp = intercept +
slope*log2(n)` (its `get` is O(log n), a deterministic worst-case binary search -- the Scapegoat.get
analogue, no RNG); it must clear the shared R^2 floor (0.958) and sit inside its band (`[0.59, 1.38]`
ns/level; median slope 0.984), over exact power-of-two sizes `[2^12, 2^18]`, while the O(n) linear-scan
foil leaves the line (R^2 ~ 0.78). Because a contiguous binary search is the FASTEST get in the family
(~1 ns/level, a ~6 ns fit span), this lane uses the widest + highest n-sweep and a 1e6-iteration
measurement to keep per-point noise off the fit, plus the MEDIAN of 7 independent sweep-fits as
measurement-quality insurance against the post-torture run's scheduler / thermal residue -- the frozen
0.958 floor and the slope band are UNTOUCHED (see [`decisions/0016-sortedarray.md`](./decisions/0016-sortedarray.md)).
The witness also DISCLOSES the MAX single insert (an O(n) tail shift), never gated. `node --expose-gc
test/torture.mjs` proves get / set / delete / rank / select / successor / predecessor / rangeIter at
0 B/op -- the O(n) write shifts in place, so even a write storm allocates nothing.

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
