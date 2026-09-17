# lite-logn -- which structure to pick (GUIDE)

A repo-only decision guide for the O(log n) family: which member, reach-for /
avoid, and how to measure the logarithm yourself. At v0.2.0 two members have
shipped -- BinaryHeap and Fenwick -- so this guide carries their per-member
sections; SegmentTree and SkipList are still skeleton rows that fill in per
release. It is NOT an API encyclopedia (that is the README + `LogN.d.ts`); it
answers "which member, and is my logarithm real?"

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

ASCII, routes on the discriminating questions. Every leaf is a planned member;
`(wc)` = worst-case O(log n), `(am)` = amortized, `(exp)` = expected. None have
shipped at v0.1.0 -- this fills in per release.

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
each member release (BinaryHeap's section is pending; Fenwick's is below).

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
