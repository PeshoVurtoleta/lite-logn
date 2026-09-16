# lite-logn -- which structure to pick (GUIDE)

A repo-only decision guide for the O(log n) family: which member, reach-for /
avoid, and how to measure the logarithm yourself. At v0.1.0 the family is the
SCAFFOLD release -- no member has shipped yet, so this guide is a skeleton: the
one question every member answers, the shape of the picker, and the family
boundary. A per-member section (flowchart leaf + reach-for / avoid + measure-it)
lands with each member release. It is NOT an API encyclopedia (that is the
README + `LogN.d.ts`); it answers "which member, and is my logarithm real?"

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
each member release.

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
