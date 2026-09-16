# lite-logn Research Notes

**Status**: Living research document
**Scope**: Design decisions, theoretical anchors, and experimental directions for a tree-shakeable,
zero-GC family of **O(log n) data structures** in JavaScript/TypeScript that doubles as a teachable
textbook -- each member solves a real ordering/priority/range problem AND proves that its logarithm
is real. It is the deliberate O(log n) sibling of [[lite-o1]] (which holds the line at the constant);
together the two span the "how fast is your structure, and can you prove it?" spectrum.

---

## 1. Core Identity

- **The complexity class IS the product.** Every member's headline op is O(log n) worst-case,
  O(log n) expected (randomized), or O(log n) amortized -- and the library's job is to PROVE the
  logarithm, not assert it (see section 2). "O(log n)" without evidence is a claim; the witness makes
  it a shape you can see.
- Fixed, preallocated capacity (node/element count, not bytes). `null` is not zero; an unsized
  structure is never a zero-capacity one. Fail closed on every unverified state.
- Zero garbage collection on the steady-state hot path (0 B/op). This is the family's HARD problem:
  a naive O(log n) structure allocates a `new Node` per insert, and that per-op allocation is a GC
  pause that an engine will not honor -- it silently turns your clean logarithm into jitter. lite-logn
  removes it (see "the honest unifying thread").
- Structure-of-Arrays (SoA) + typed-array substrate for cache locality. Ordering is by a numeric key
  or an injected comparator over a numeric key column -- never by boxing values into objects.
- Tree-shakeable: import ONE structure and extend it. No barrel forces the others into the bundle.
- Single-file ESM per package, zero runtime dependencies, `node:test` only, ASCII-only source.
- **"Measure the logarithm" as the primary product differentiator** (section 2).

The library does not compete on breadth with a general collections package, nor on cleverness with a
data-structures course. It wins on a different axis: a curated family of the O(log n) structures that
actually matter -- ordering, priority, and range queries -- each zero-GC, each shipped with a harness
that DEMONSTRATES the logarithmic cost curve, and each written to teach the trick that buys the log.

### The honest unifying thread

O(log n) structures are heterogeneous: a binary heap, a Fenwick tree, and a skip list do not share
one swappable interface the way lite-lru's eviction policies share `get`/`put` or lite-filter's
members share `add`/`mightContain`. A heap is `push`/`popMin`; a Fenwick tree is `update`/`prefix`;
a skip list is an ordered map (`get`/`set`/`successor`). So the family is unified NOT by a single
interface but by three things:

1. **The complexity guarantee** -- every member's headline op is O(log n), ALWAYS labeled which
   flavor: worst-case, expected (randomized), or amortized (section 5).
2. **The zero-GC substrate** -- two shapes, chosen per member:
   - **Array-embedded** structures (binary heap, Fenwick tree, segment tree) live in a single flat
     typed array with implicit `2i+1 / 2i+2` or lowest-set-bit index arithmetic -- no nodes at all,
     naturally zero-GC.
   - **Pointer-free node-pool** structures (skip list, treap, balanced BST) replace `new Node` and
     object pointers with a **free-list slot allocator over parallel `Uint32Array` link columns**
     (`left`/`right`/`parent`, or per-level `next` for a skip list) plus a numeric key/value column.
     A "pointer" is an integer index; a "null pointer" is a reserved sentinel (`NIL = 0` with slot 0
     unused, so `null` is never confused with a real slot). This is the family's teachable substrate
     and the counterpart to lite-o1's `SlotPool` -- reconcile, do not fork (section 6).
3. **The logarithmic-growth witness** -- one measurement harness (section 2) proves the log for every
   member the same way: a straight line on a log-x axis.

Where an ordered-collection spine DOES fit (`get`/`has`/`delete`/`min`/`successor`/`rank` over an
ordered numeric domain), members share it; structure-specific ops (`push`/`popMin`, `update`/`prefix`,
`rangeQuery`) extend it. The spine is offered where honest, never forced where it is not.

---

## 2. The Analytical Anchor: The O(log n) Witness (logarithmic growth)

### Why it belongs in the project

lite-lru's killer feature is "% of Belady optimal." lite-filter's is "measured vs theoretical FPR."
[[lite-o1]]'s is the **O(1) Witness** -- ops/ms that stays FLAT as `n` grows. lite-logn inherits the
same discipline (measure the real structure against a provable reference, never a marketing number)
but its anchor is the opposite shape:

> **lite-logn's analytical anchor is logarithmic growth made visible: per-op cost that rises by a
> CONSTANT ADDITIVE STEP each time `n` DOUBLES -- one extra level of the tree per doubling.**

That constant step IS the proof of O(log n). Plot per-op time against `log2(n)` and an O(log n)
structure draws a STRAIGHT LINE: doubling the data adds one comparison / one level / one bit of work,
always the same increment. An O(1) structure draws a flat line (slope ~ 0 -- it belongs in lite-o1).
An O(n) structure curves up exponentially on that same log-x axis (linear-in-`n` is `2^(log2 n)`), and
no straight line fits it. So the benchmark does not merely report a number -- it reports a SHAPE, and
the shape is the theorem made visible.

**Why it is a killer feature**:

- "BinaryHeap does 40 M ops/s" is ambiguous -- at what size, and is that the log or a hidden O(n)?
- "BinaryHeap's ns/op fits `a + b*log2(n)` with R^2 = 0.99, slope 6.1 ns/level from n=1e3 to n=1e7,
  while a sorted-array-insert foil's ns/op explodes off the straight line (R^2 = 0.31)" is
  immediately convincing: the logarithm is real, the per-level cost is bounded, and the foil that a
  working programmer would reach for by default loses as `n` grows.
- Almost no JS data-structure library ships the evidence that its O(log n) claim survives contact with
  a real engine (megamorphic call sites, GC pauses, cache misses, deopts, and -- for randomized
  members -- an unlucky seed). This one does.

### The witness, precisely

Three numbers per member, all cheap to report:

- **ns/op at each `n`** across a geometric sweep (e.g. n = 1e3, 1e4, 1e5, 1e6, 1e7).
- **The log-linear fit**: least-squares `nsPerOp = intercept + slope * log2(n)`. O(log n) => high
  `R^2` (a straight line fits) and `slope > 0` within a per-member band (the per-level cost). O(1) =>
  `slope ~ 0`. O(n) => low `R^2` (a line cannot fit the exponential-on-log-x curve) and a slope that
  balloons with the range. The gate is falsifiable: `R^2 >= floor` AND `slope` inside its band. If the
  fit degrades or the slope leaves its band, the logarithm regressed and the build fails.
- **Step constancy**: the first-difference of ns/op per doubling should stay ~constant (== `slope`).
  Rising steps betray a hidden super-log term (a bad rebalance, a probe storm, a degenerate seed) even
  when the average still looks logarithmic.

A useful cross-check: for a true O(log n) member, `opsPerMs(n_min) / opsPerMs(n_max)` should track
`log2(n_max) / log2(n_min)` (e.g. ~2.3x across 1e3 -> 1e7), not ~1.0 (that is O(1)) and not -> infinity
(that is O(n)).

Paired with the suite's existing zero-alloc proof (`0 B/op` via lite-leak + lite-gc-profiler), the
witness closes both halves of an honest O(log n) claim: **the log is a straight line AND there is no
per-op allocation.** A GC pause is the logarithm's silent killer -- a per-insert `new Node` allocates,
and the resulting pause dwarfs the log factor it was supposed to cost. So the two gates run together.
But growth-shape and allocation are only two of the eight axes an honest claim needs; the full
benchmark suite (section 3) surrounds the witness with the other six and is the product's MVP.

### Reference harness (the witness)

```js
/**
 * The O(log n) Witness: logarithmic growth under growing n.
 *
 * Times a fixed batch of the structure's hot op at each n in a geometric sweep,
 * reports ns/op, then fits ns/op = intercept + slope*log2(n). O(log n) => a straight
 * line (high R^2, slope > 0 = one extra level per doubling); O(1) => slope ~ 0;
 * O(n) => the curve leaves the line (low R^2, exploding slope). Warms up to defeat
 * JIT tiering, then measures. An OFFLINE proof tool, never a hot-path dependency.
 *
 * @param {(n:number)=>{op:(i:number)=>void}} build  builds a warmed structure of size
 *                                                   n and returns its hot op closure
 * @param {number[]} sizes    geometric n sweep, ascending (e.g. [1e3,1e4,1e5,1e6,1e7])
 * @param {number}   batch    ops timed per size (fixed, so ns/op is comparable)
 * @returns {{rows:{n,opsPerMs,nsPerOp}[], slope:number, intercept:number, r2:number, steps:number[]}}
 */
export function logWitness(build, sizes, batch) {
    const rows = [];
    for (let s = 0; s < sizes.length; s++) {
        const n = sizes[s] | 0;
        const { op } = build(n);
        for (let i = 0; i < batch; i++) op(i);            // warm-up: tier up to optimized code
        const t0 = performance.now();
        for (let i = 0; i < batch; i++) op(i);
        const dt = performance.now() - t0;
        rows.push({ n, opsPerMs: dt > 0 ? batch / dt : Infinity, nsPerOp: dt > 0 ? (dt * 1e6) / batch : 0 });
    }
    // Least-squares fit of nsPerOp against log2(n).
    const xs = rows.map(r => Math.log2(r.n));
    const ys = rows.map(r => r.nsPerOp);
    const m = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < m; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const denom = m * sxx - sx * sx;
    const slope = denom !== 0 ? (m * sxy - sx * sy) / denom : 0;
    const intercept = (sy - slope * sx) / m;
    // R^2 of the linear fit: ~1 => genuinely logarithmic; low => not a line (O(1) flat or O(n) curve).
    let ssTot = 0, ssRes = 0; const ymean = sy / m;
    for (let i = 0; i < m; i++) {
        const pred = intercept + slope * xs[i];
        ssRes += (ys[i] - pred) * (ys[i] - pred);
        ssTot += (ys[i] - ymean) * (ys[i] - ymean);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    // Step constancy: ns added per doubling; a rising trend exposes a hidden super-log term.
    const steps = [];
    for (let i = 1; i < m; i++) steps.push((ys[i] - ys[i - 1]) / ((xs[i] - xs[i - 1]) || 1));
    return { rows, slope, intercept, r2, steps };
}
```

### The foil (making the shape legible)

Every member's bench ships a deliberately-chosen FOIL on the identical sweep, so the reader sees two
curves: the member's straight log line and the foil's departure from it. The foil is not a strawman --
it is the thing a working programmer reaches for by default, shown losing as `n` grows:

- **BinaryHeap vs a sorted array** kept in order by insertion (O(n) shift per push) -- or vs a linear
  scan for the min. The heap's push/pop stays a straight log line; the sorted-array insert curves up.
- **SkipList / Treap (ordered map) vs a sorted array** with binary-search lookup: search is O(log n)
  for both, but INSERT is O(n) for the array -- the honest comparison is the mixed insert+query trace.
- **Fenwick / SegmentTree vs the naive baselines**: prefix-sum by re-summing the range (O(n) query),
  or point-update by rebuilding a prefix array (O(n) update). The member keeps both update AND query on
  the log line; the naive version is log on one and O(n) on the other.
- **The O(1) counter-foil (what you give up)**: a native `Map`/`Set` is O(1) but UNORDERED. Where a
  member's job is ordering/priority/range, the bench shows the `Map` winning on raw lookup and LOSING
  the moment you need `min` / `successor` / `rangeQuery` -- the log factor is the honest price of order,
  and the witness shows that price is small and bounded.

---

## 3. The Benchmark Suite (the ecosystem MVP)

**`benchmark/` is the flagship deliverable, not a supporting tool** -- exactly as in [[lite-o1]]. The
O(log n) Witness of section 2 is the analytical ANCHOR, but the growth shape is NECESSARY and far from
SUFFICIENT: it hides latency tails, memory behaviour, cache effects, GC jitter, and real workloads. A
library that advertises O(log n) has to prove the logarithm on every axis a real consumer feels. The
suite ships both TABLES and GRAPHS and compares every member against the language builtins -- a
`Map`/`Set` for ordered-map members, `Array.prototype.sort` + a manual array for heap/priority members
-- so a user sees exactly where the library wins and where it does not.

The witness (section 2) is dimension 1 (growth shape + fit quality). The other seven turn a suggestive
curve into an honest, complete picture. **These are the same eight dimensions [[lite-o1]] defines** (the
user's authoritative benchmark spec), adapted where O(log n) changes the emphasis:

1. **Latency distribution (the most important addition).** p50/p90/p99/p99.9/max per op, WITH and
   WITHOUT forced GC. Doubly important here: randomized members (skip list, treap) have a real tail from
   unlucky levels, and amortized members (sorted-array rebuild, scapegoat rebuild) have a genuine O(n)
   spike. The tail is the quantified form of the section 5 honesty hook.
2. **Amortized cost over long mixed traces.** Millions of interleaved insert/delete/query ops with
   growth past power-of-two boundaries; cumulative cost / op should track `log n`, not drift upward.
3. **Memory footprint and stability.** Bytes per LIVE element vs the theoretical minimum (a node-pool
   skip list vs an object-pointer one is the headline win); high-water after fill -> delete -> refill;
   what a fixed-capacity member deliberately retains after `clear()`.
4. **Cache and memory-subsystem behaviour.** Array-embedded members (heap, Fenwick) are cache-friendly;
   pointer-chasing trees are where a node pool with contiguous `Uint32` link columns beats scattered
   objects. Sequential vs random access gap.
5. **Bundle size and tree-shaking effectiveness.** Min+gzip for one import vs several; unused members
   truly vanish. Feeds the tree-shaking open question (section 11).
6. **GC pressure and allocation rate.** Allocs/op and total GC pause -- the axis that exposes a
   `new Node` per insert. Extends the `0 B/op` gate from pass/fail into a curve.
7. **Scalability across key types and load factors.** Numeric keys, comparator over object keys,
   duplicate-heavy vs distinct, sorted vs random vs adversarial insertion order (the last is where an
   unbalanced BST degenerates and a skip list / treap must hold the log).
8. **Workload micro-benches.** Priority-queue drain (Dijkstra/event-loop), top-k streaming, range-sum
   sliding window (Fenwick), order-statistic select/rank, ordered iteration.

> **Authoritative steer (user, 2026-09-16):** the eight-dimension benchmark suite is **COMPLETE** and is
> NOT to be reinvented. lite-o1 shipped it as Bench v2 -- the full-rigor blueprint (strong baselines +
> bootstrap CI + Mann-Whitney + overhead-subtraction + a load-factor curve) with a `Template.mjs` and a
> `METHODOLOGY.md` **written expressly for the siblings to copy**. lite-logn ADOPTS that framework
> wholesale: copy the harness, the child-process-per-cell orchestrator, the honesty header, the vacuity
> gate, and the inline-SVG report renderer verbatim, then swap in only the two things that are genuinely
> O(log n)-specific -- the witness's log-linear FIT (R^2 + slope vs `log2(n)`, section 2) in dimension 1,
> and the ordered FOILS (sorted-array-insert, `Map`/`Set` counter-foil). There is no "design the suite"
> session and no reuse-vs-fork question: the suite exists, it is a dev-only shared blueprint, and the
> member-specific work is a port plus the dimension kernels, not a rebuild.

---

## 4. The Candidate Roster (all candidates)

O(log n) here means the HEADLINE op; every member states its exact bound and its flavor -- worst-case,
expected (randomized), or amortized -- plus its worst-case single-op cost (the honesty hook, section 5).
Build order is one concept per release, simplest and most broadly useful first. **The roster below folds
in the user's own candidate list (2026-09-15) as the authoritative input.**

### Tier 1 -- core roster (the members to ship)

| Structure       | Headline op(s)                          | Bound (flavor)              | Why it earns a slot |
|-----------------|-----------------------------------------|-----------------------------|---------------------|
| **BinaryHeap**  | push / popMin (or popMax) / peek        | O(log n) worst-case         | THE textbook O(log n) structure: an array-embedded complete binary tree, sift-up/sift-down, `2i+1`/`2i+2` children. Naturally zero-GC (no nodes). Universally useful -- priority queues, Dijkstra, event loops, top-k, scheduling. The cleanest witness and the headline member. d-ary variant as a preset. |
| SkipList        | get / set / delete / successor / rangeIter | O(log n) EXPECTED (randomized) | Ordered map/set. Easier to implement correctly than a balanced tree, excellent expected performance. The pointer-free node-pool showcase (per-level `Uint32` `next` columns). The randomized-honesty hero (section 8's spirit). |
| Fenwick (BIT)   | update / prefix / rangeSum              | O(log n) worst-case         | The lowest-set-bit prefix-sum trick: point-update AND prefix-query both in O(log n) over a single flat typed array. Naturally zero-GC. Running sums, cumulative frequencies, inversion counts, order-statistics-by-value. The most elegant "teach the trick that buys the log" member (section 8). |
| SegmentTree     | rangeQuery / pointUpdate / (lazy range) | O(log n) worst-case         | General range query (min/max/sum/gcd) + point or lazy-range update over a flat typed array. More general than Fenwick (arbitrary associative fold), a touch heavier. The range-query workhorse. |

### Tier 2 -- strong candidates (next releases)

| Structure       | Headline op(s)                          | Bound (flavor)              | Why it earns a slot |
|-----------------|-----------------------------------------|-----------------------------|---------------------|
| Treap           | insert / delete / search                | O(log n) EXPECTED           | Balanced BST via randomized heap priorities -- far simpler than red-black/AVL while giving good guarantees. The teachable balanced tree; a split/merge core that order-statistics and interval members can reuse. |
| Scapegoat       | insert / delete / search                | O(log n) amortized          | Balanced BST via partial rebuilds on an alpha-weight-imbalance trigger -- no per-node balance metadata. The AMORTIZED-worst-case member and the honest O(n)-single-rebuild teaching case (section 5). An alternative to Treap where determinism (no RNG) is wanted. |
| OrderStatTree   | select(k) / rank(x) + insert / delete   | O(log n)                    | k-th smallest and "how many below x" in O(log n). Either an augmented Treap/Scapegoat (subtree-size column) or a Fenwick-over-value-domain; state the boundary between the two rather than shipping both blindly. |
| IndexedHeap     | push / popMin / decreaseKey(handle)     | O(log n) worst-case         | Binary heap + a handle->position map so `decreaseKey`/`remove` are O(log n) -- what Dijkstra/A\* actually need and a plain heap cannot do. Uses the `keys:'int'` index substrate. Possibly Tier 1.5 given how often it is the real requirement. |
| SortedArray     | insert / search / rangeIter             | search O(log n); insert O(n) worst, amortized-cheaper with deferred/batched rebuild | Sorted dynamic array + binary search with occasional rebuilding. The AMORTIZED member and an honest edge case: worst-case O(n) insert stated up front, witness MAX bar shows the rebuild spike. Best when reads dominate writes. |
| MinMaxHeap      | pushMin/Max / popMin / popMax / peekMin/Max | O(log n) worst-case         | Double-ended priority queue (DEPQ) in ONE array-embedded heap: alternating min/max levels give BOTH extremes in O(log n) over a single flat typed array, no second structure. Old but gold (Atkinson et al. 1986). The zero-GC answer to "I need a bounded window's min AND max as a priority queue" -- the interval-heap variant is a preset. Naturally node-free; a clean second heap-family witness beside BinaryHeap. |
| SplayTree       | get / set / delete / successor          | O(log n) AMORTIZED (self-adjusting) | Self-adjusting BST: every access splays the touched node to the root, so a working-set / recently-used access pattern beats the log (the working-set theorem). No balance metadata at all -- a pointer-free node-pool member. The honest amortized-with-a-real-single-op-spike hero AND the "your access pattern is skewed" specialist (LRU-ish locality, rope/edit buffers). Deterministic (no RNG), unlike Treap. |

### Tier 3 -- adjacent / substrate (evaluate; may fold in or cross-reference)

| Structure       | Headline op(s)                          | Bound              | Note |
|-----------------|-----------------------------------------|--------------------|------|
| NodePool        | alloc / free                            | O(1)               | The pointer-free index node allocator (free-list + optional generational handles) the skip list / treap / BST reuse. This is [[lite-o1]]'s `SlotPool` / lite-arena's Arena -- reconcile, cross-link, do NOT fork (section 6). Substrate, not a headline O(log n) member. |
| DaryHeap        | push / popMin                           | O(log_d n) worst-case | d-ary heap: shallower tree, fewer sift levels, better cache and faster decrease-key. Likely a BinaryHeap preset (`arity` option) rather than a separate member. |
| DaryHeapPreset  | push / popMin                           | O(log_d n) worst-case | (see DaryHeap above) -- a `BinaryHeap({arity:d})` preset, not a separate class. |
| BinomialHeap    | push / popMin / meld                    | O(log n) worst-case | Forest of binomial trees; O(log n) MELD of two heaps (an array heap cannot meld cheaply). The clean, WORST-CASE mergeable heap -- the honest baseline the fancier melding heaps are measured against. Pointer-free node-pool member. |
| PairingHeap     | push / popMin / decreaseKey / meld      | O(log n) amortized (decreaseKey o(log n) conjectured) | The practical self-adjusting mergeable heap: dead-simple to implement, superb in practice, and its decrease-key is famously fast-but-subtle to bound. The honest "great measured constants, delicate amortized analysis -- here is the witness, not a promise" member. |
| FibonacciHeap   | push / popMin / decreaseKey / meld      | popMin O(log n) amortized; decreaseKey / push / meld O(1) amortized | The textbook Dijkstra/Prim optimum: O(1) amortized decrease-key is what makes the classic shortest-path bound. Routed HERE from [[lite-o1]] (it is amortized-log, not constant). Old but gold, heavy, and the honest teaching case for "asymptotically optimal, often beaten in practice by a pairing heap" -- ship with the caveat measured. |
| IntervalTree    | insert / stab / overlapQuery            | O(log n + k)       | Augmented BST for interval overlap queries (the `+k` is output size). Practical (scheduling, genomics, collision broadphase) but augmentation-heavy; a Treap-core specialization if it lands. |
| Fenwick2D       | update(x,y) / prefix(x,y) / rangeSum    | O(log n * log m) worst-case | The Fenwick trick in two dimensions: cumulative sums over a grid (image integral tables, 2D range counts, submatrix sums). A flat-array preset of Fenwick once the 1D member ships; naturally zero-GC. |
| WeightBalanced  | insert / delete / search / select / rank | O(log n) worst-case | Weight-balanced tree (BB[alpha]): balance by SUBTREE SIZE, which the tree already stores -- so order-statistics (select/rank) come free and there is no separate balance byte. Deterministic (no RNG). A strong OrderStatTree substrate and the functional-persistence-friendly balanced BST. |

### Tier 4 -- exotic but a golden niche (research track; each a dedicated future member with an honest "when it pays" note)

These are less-known structures that own a sharp niche no Tier 1-2 member covers. Each is "old but gold"
in its corner of the literature; each earns a slot only with the witness + the honest caveat that its
constant factor or its `+k`/`log^2` term is real. Build any of these only after the core roster and only
when a real use case names it.

| Structure          | Headline op(s)                              | Bound (flavor)                    | The golden niche it owns |
|--------------------|---------------------------------------------|-----------------------------------|--------------------------|
| PersistentSegTree  | version(t).rangeQuery / kthInRange          | O(log n) query, O(log n) new-version | FULLY PERSISTENT (functional) segment tree: every update forks a new version sharing O(log n) nodes with the old, so you can query any past version AND answer "k-th smallest in [l, r]" offline. The classic competitive-programming golden hammer; the node-pool + copy-path teaching beat. Space is O(n log n) over the version history -- stated up front. |
| MergeSortTree      | countInRange(l, r, <= v) / kthInRange        | O(log^2 n) query, O(n log n) build | A segment tree whose every node stores its subrange SORTED: answers "how many values <= v in positions [l, r]" and range-k-th by binary-searching each covering node. STATIC (build-once). The honest O(log^2 n) member -- its extra log is the teaching point vs the persistent tree. |
| WaveletTree        | rank / select / quantile / rangeCount        | O(log sigma) per op               | Rank/select/quantile over a sequence drawn from an integer alphabet sigma: "how many x <= v in [l, r]", "the k-th smallest in [l, r]", "position of the j-th occurrence of v". A succinct-structures cornerstone (bio-informatics, text indexing). O(log sigma) not O(log n) -- so it lives on the boundary with lite-loglogn; it earns a lite-logn slot as the general-sequence range member. Static; bit-packed, naturally cache-friendly. |
| LinkCutTree        | link / cut / pathAggregate / findRoot         | O(log n) amortized                | DYNAMIC forests: maintain a forest of rooted trees under link/cut and answer path queries (sum/min/max on the path to the root) in amortized O(log n). The dynamic-connectivity / dynamic-MST / max-flow workhorse. A splay-tree-of-preferred-paths -- the deepest "exotic but foundational" member. Amortized with a real single-op spike; witness MAX bar earns its keep. |
| EulerTourTree      | link / cut / connected / subtreeAggregate     | O(log n) amortized                | Dynamic connectivity for UNROOTED forests via an Euler tour held in a balanced BST: `connected(u, v)`, subtree aggregates, and link/cut under edge insertions/deletions. The simpler-to-reason dynamic-forest sibling of LinkCutTree (subtree, not path, queries). |
| CartesianTree      | build / rangeMinQuery (via LCA)               | O(n) build, O(1) RMQ with prep     | The tree whose in-order is the array and whose heap-order is by value: its LCA IS the range-minimum. The bridge between lite-logn (a treap is a Cartesian tree on random priorities) and lite-o1's SparseTable/StaticRMQ -- a teaching cross-link more than a standalone member, but a beautiful one. |
| XorTrie            | insert / maxXor(x) / kthXor / erase           | O(w) = O(log U) per op            | Binary trie over the bits of integer keys: "the present key that MAXIMIZES x XOR key" in O(w) bit-steps -- the max-XOR-pair / XOR-basis-adjacent golden hammer (networking, competitive programming). O(log U) not O(log n): a bounded-integer member that sits on the lite-loglogn boundary; ship here only if the XOR query (not successor) is the point. Pointer-free 2-ary node pool. |

### The boundary -- explicitly NOT in lite-logn (out of scope, and why)

Naming the boundary is the honesty discipline (as lite-lru kept LIRS/CLOCK-Pro out of its v1 and
lite-o1 keeps heaps out of ITS scope). These are fine structures, but their headline op is not the
log, so they do not belong here:

- **O(1) / O(1)-amortized structures** -- sparse set, ring deque, union-find, bucket queue, hash map.
  That is [[lite-o1]]. In particular a bounded-integer priority queue is O(1) (Dial's bucket queue in
  lite-o1; and lite-scheduler's `FastBitScheduler` is an O(1) 32-tier bucket queue). lite-logn's heap is
  the GENERAL comparator priority queue whose bound is O(log n); the two are siblings, not rivals -- see
  section 6.
- **O(log log n)** -- van Emde Boas / y-fast trie successor-predecessor over a bounded integer universe.
  Sub-logarithmic; a DIFFERENT package if ever wanted.
- **O(n log n) comparison sorts** -- a sort is an algorithm, not a data structure (heapsort falls out of
  BinaryHeap and is noted as a recipe, not a member).
- **Red-black / AVL trees for their own sake** -- strictly worst-case O(log n) but heavy and error-prone;
  lite-logn deliberately prefers the SIMPLER Treap (expected) and Scapegoat (amortized) that give
  comparable guarantees with far less code, per the user's steer. Ship an RB/AVL only if a member proves
  it needs strict per-op worst-case that Scapegoat's amortization cannot provide.
- **B-tree / LSM-tree** -- O(log n) but block/disk-oriented; a different niche (a `lite-store`-adjacent
  package), out here.

If a sibling "sub-logarithmic but not constant" family (vEB and friends) is ever wanted, it is its own
package. lite-logn holds the line at the logarithm, just as lite-o1 holds it at the constant.

---

## 5. The Growth-Honesty Hook (worst-case vs expected vs amortized)

O(log n) is not one promise -- it is three, and conflating them is the dishonesty this family refuses:

- **Worst-case O(log n)** -- every single op is `<= c*log n` (BinaryHeap, Fenwick, SegmentTree). The
  strongest promise; these are preferred for the core tier.
- **Expected O(log n)** -- randomized, `O(log n)` with high probability, but an unlucky coin sequence or
  an adversarial input can degrade (SkipList, Treap). The honest caveats: ship DETERMINISTIC seeding for
  reproducibility, document that a hostile input can push the tail out, and let the witness report the
  ACTUAL distribution rather than the expectation. This is lite-logn's "measure your own workload"
  counterpart to lite-filter's "measure your own keys."
- **Amortized O(log n) (or amortized worst-case)** -- a single op can be O(n) but the SEQUENCE averages
  down (SortedArray's rebuild, Scapegoat's partial rebuild). The single spike is real and must be
  stated and MEASURED, never hidden.

The discipline, enforced by the harness:

- Every member documents its flavor and its worst-case single-op cost explicitly, in the README and the
  `dump()`-drawn demo.
- The witness harness (section 2) reports the **max single-op time** across the batch, not just the mean
  ns/op -- so a rebuild spike or a degenerate-input blowup shows up as a tall bar even when the average
  still fits the log line. The latency distribution (benchmark dimension 1) is its quantified form.
- Fixed-capacity members that fail closed at capacity (rather than silently growing and paying an
  amortized resize) are PREFERRED, matching the suite's "fail closed on every unverified state" law.
  Growth, where offered, is opt-in and its amortized cost is labeled.

This is the lite-logn equivalent of BlockedBloom reporting its FPR penalty as a labeled floor: the
logarithm is stated with its flavor and its edges, and the bench proves both the promise and its price.

---

## 6. Boundaries with sibling packages (no duplication)

The suite ships one clear niche per package. lite-logn must not re-implement what a sibling already owns:

- **[[lite-o1]]** (the O(1) family) is the closest sibling and the intended pair: lite-o1 holds the
  constant, lite-logn holds the logarithm. Cross-link heavily; keep the witness harnesses recognizably
  kin (flat line vs straight-log line). Any bounded-integer priority queue (O(1)) is lite-o1's, not a
  lite-logn heap.
- **lite-arena** (zero-GC ECS allocator) and lite-o1's **`SlotPool`** already provide a free-list slot
  allocator. lite-logn's `NodePool` is the same primitive; re-export or depend rather than fork. Resolve
  the ownership at planning time (this is the single most important cross-package decision).
- **lite-scheduler** ships `FastBitScheduler`, an O(1) 32-tier Int32 bucket queue for BOUNDED integer
  priorities. lite-logn's `BinaryHeap`/`IndexedHeap` is the GENERAL comparator priority queue at O(log n);
  the README must state the boundary so a user with small integer priorities is sent to the O(1) tool.
- **lite-fastbit32** (branchless 32-bit flag manager): any lite-logn member needing a bitmap uses it as a
  policy-local dependency, never a reimplementation.
- **lite-filter** owns approximate membership and probabilistic sketches; lite-logn owns exact ordered
  structures. No overlap, noted for completeness.
- **lite-lru** uses ordering internally for eviction but is a cache, not an ordered-collection library;
  cross-link only.

---

## 7. Reference Implementation: BinaryHeap (the headline member)

The cleanest demonstration of a real O(log n) constant per level, array-embedded so it is zero-GC with
no node pool at all. Min-heap over a numeric key column; a comparator/`arity` variant is a later preset.

```js
/**
 * BinaryHeap -- a zero-GC O(log n) binary min-heap over a flat typed array.
 *
 * push/pop are O(log n) worst-case: one sift up or down the tree, and the tree has
 * ceil(log2(n)) levels. The heap is COMPLETE, so it lives in an array with implicit
 * children at 2i+1 / 2i+2 -- no nodes, no pointers, nothing allocated per op. peek is
 * O(1). Fixed capacity; fail closed on overflow (never a silent grow + amortized resize
 * that would break the worst-case bound). `null` is not zero: an empty pop returns
 * undefined, never a real key.
 */
export class BinaryHeap {
    constructor(capacity) {
        if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("[lite-logn] capacity must be an integer >= 1");
        this._keys = new Float64Array(capacity); // the heap array; _keys[0] is the root (min)
        this._cap = capacity;
        this._n = 0;
    }

    get size() { return this._n; }
    get capacity() { return this._cap; }

    /** The minimum, or undefined if empty. O(1). */
    peek() { return this._n > 0 ? this._keys[0] : undefined; }

    /** Insert a key. O(log n): sift the new leaf up to its level. Fail closed when full. */
    push(key) {
        if (typeof key !== "number" || Number.isNaN(key)) throw new TypeError("[lite-logn] key must be a non-NaN number: " + String(key));
        if (this._n === this._cap) throw new Error("[lite-logn] BinaryHeap full (" + this._cap + ")");
        const a = this._keys;
        let i = this._n++;
        a[i] = key;
        while (i > 0) {                          // sift up: at most log2(n) swaps
            const parent = (i - 1) >> 1;
            if (a[parent] <= a[i]) break;
            const t = a[parent]; a[parent] = a[i]; a[i] = t;
            i = parent;
        }
        return this;
    }

    /** Remove and return the minimum, or undefined if empty. O(log n): sift the last leaf down. */
    pop() {
        const n = this._n;
        if (n === 0) return undefined;           // empty is undefined, never a stale slot
        const a = this._keys;
        const min = a[0];
        const last = a[--this._n];
        if (this._n > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {                           // sift down: at most log2(n) swaps
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < this._n && a[l] < a[m]) m = l;
                if (r < this._n && a[r] < a[m]) m = r;
                if (m === i) break;
                const t = a[m]; a[m] = a[i]; a[i] = t;
                i = m;
            }
        }
        return min;
    }

    /** Empty the heap in O(1): reset the count, touch no store. */
    clear() { this._n = 0; }
}
```

The teaching beat: push and pop each touch exactly one root-to-leaf PATH, and the tree height is
`ceil(log2(n))`, so the cost is one level of work per doubling of `n` -- the witness's straight line,
made of `<=` comparisons and swaps with zero allocation. The foil (a sorted array kept in order by an
O(n) shift per insert) curves off that line as `n` grows.

---

## 8. Experimental Direction: Fenwick tree (the trick worth teaching)

The member whose Big-O is most delightfully non-obvious and most in need of the witness: BOTH a
point-update AND a prefix-sum query in O(log n) over a single flat array, using nothing but the
lowest-set-bit trick. "How can update and query BOTH be logarithmic on a plain array?" is exactly the
claim a reader should demand proof of, and the harness delivers two straight log lines.

```js
/**
 * Fenwick (Binary Indexed Tree) -- zero-GC O(log n) prefix sums over a flat typed array.
 *
 * update(i, delta) and prefix(i) are both O(log n): each walks the indices whose binary
 * representation differs by one lowest-set-bit step (i & -i), and there are at most
 * log2(n) such steps. No nodes, no pointers, nothing allocated per op. 1-based indices
 * internally (index 0 is the identity sentinel -- null is not zero here either).
 *
 * The HONEST note (section 5): worst-case O(log n) per op, no amortization games. The
 * witness reports the max single-op time so the flat log line is proven, not assumed.
 */
export class Fenwick {
    constructor(size) {
        if (!Number.isInteger(size) || size < 1) throw new RangeError("[lite-logn] size must be an integer >= 1");
        this._n = size;
        this._t = new Float64Array(size + 1);    // 1-based; _t[0] unused (the NIL/identity sentinel)
    }

    get size() { return this._n; }

    /** Add delta at position i (0-based). O(log n): climb by lowest-set-bit. */
    update(i, delta) {
        if (i < 0 || i >= this._n) throw new RangeError("[lite-logn] index out of range: " + String(i));
        if (typeof delta !== "number" || Number.isNaN(delta)) throw new TypeError("[lite-logn] delta must be a non-NaN number: " + String(delta));
        const t = this._t;
        for (let k = i + 1; k <= this._n; k += k & -k) t[k] += delta; // <= log2(n) steps
    }

    /** Sum of positions [0, i] (0-based, inclusive). O(log n): descend by lowest-set-bit. */
    prefix(i) {
        if (i < 0 || i >= this._n) throw new RangeError("[lite-logn] index out of range: " + String(i));
        const t = this._t;
        let s = 0;
        for (let k = i + 1; k > 0; k -= k & -k) s += t[k];             // <= log2(n) steps
        return s;
    }

    /** Sum of positions [lo, hi] (0-based, inclusive). Two prefix queries. O(log n). */
    rangeSum(lo, hi) {
        return lo > 0 ? this.prefix(hi) - this.prefix(lo - 1) : this.prefix(hi);
    }

    /** Zero all counts in place, no realloc. O(n) once (setup), not a hot-path op. */
    clear() { this._t.fill(0); }
}
```

Why it is the "experimental direction" slot (the UnionFind / LiteMGLRU counterpart in [[lite-o1]]): the
`i & -i` lowest-set-bit walk is the trick that BUYS the logarithm, it is invisible until you see it, and
the witness turns "trust me, both are O(log n)" into two measured straight lines. The `SkipList`
(section 4) is the randomized-honesty hero and the pointer-free node-pool showcase; its zero-GC
reference implementation (per-level `Uint32Array` `next` columns over a `NodePool`) is a natural
follow-up note once the substrate is finalized.

---

## 9. The Demo (in the style of lite-lru / lite-o1)

A repo-only dev artifact, never shipped in the tarball, modeled beat-for-beat on lite-lru's and
lite-o1's demos:

- **One shared op-stream fed to all members side by side.** The "trace" is a stream of structure ops
  (pushes/pops/updates/queries/inserts) from a seeded workload at a chosen `n`. Each panel is drawn
  STRICTLY from that member's live `dump()`/`inspect()` snapshot after each step -- no shadow state.
- **The headline stat is the O(log n) witness.** Each panel shows a live **ns/op reading and the
  log-linear fit**; as you crank `n` up by orders of magnitude, the member's point stays ON the straight
  line while a second lane runs the member's FOIL (the O(n) default) and visibly leaves it. The
  straight-log-line-vs-departing-foil pair is the demo's whole point, exactly as "flat vs collapsing" is
  lite-o1's and "hit-rate vs Belady OPT" is lite-lru's.
- **Each panel draws the STRUCTURE, from its snapshot.** BinaryHeap: the tree levels filling and the
  sift path highlighting on each push/pop. Fenwick/SegmentTree: the array cells and the `i & -i` (or
  range-fold) touch-path lighting up per op. SkipList: the express lanes and the search descending
  through levels. Treap/Scapegoat: the tree rebalancing / rebuilding live.
- **Architecture mirrors the five-file demo.** `Visualize.mjs` (headless engine, imports only the
  package main, Node-main prints a per-member ns/op + fit table), `renderers.mjs` (pure, one renderer per
  member, each declares its snapshot `fields` + a `model(snap)` the test deep-equals against `dump()`),
  `serve.mjs` (zero-dep http, computes the seeded op-stream + the foil timings, serves statics),
  `visuals.html` (dark terminal-green, one canvas panel per member, controls: structure / workload /
  seed / **n** / play / step / speed), `Demo.test.mjs` (model==dump, renderer teeth, determinism,
  zero-alloc engine step, leak-free build/run/reset, fail-closed serve + fetch matrix).
- **The honesty caveat rendered:** for randomized and amortized members the panel also shows the **max
  single-op** bar (section 5), so the demo never lets an expected/amortized member masquerade as
  worst-case O(log n). A "seed" control lets the viewer watch a randomized member's tail move.

The demo and any build/insertion animations are their own later sessions, as with lite-filter and
lite-o1; the first demo shows steady-state ops + the logarithmic-growth witness.

---

## 10. Recommended Path

1. Finalize the zero-GC substrate: confirm `NodePool` against lite-arena / lite-o1's `SlotPool` (section
   6) so the pointer-free members do not fork an allocator, and settle the array-embedded vs node-pool
   split per member.
2. Ship **BinaryHeap** as the headline member (array-embedded, the cleanest O(log n) witness) + the
   `logWitness` harness (section 2) as a core feature from day one, alongside the standing zero-alloc
   perf gate (@zakkster/lite-perf-gate, as adopted in lite-o1).
3. Add **Fenwick** (the trick worth teaching, worst-case, naturally zero-GC), then **SegmentTree** (the
   range workhorse), then **SkipList** (the randomized hero + the node-pool showcase).
4. Ship the demo (section 9) once 3-4 members exist, so the witness comparison has range.
5. **ADOPT the completed benchmark suite (section 3):** the eight-dimension framework is DONE in lite-o1
   (Bench v2 -- `Template.mjs` + `METHODOLOGY.md` written for the siblings to copy). Port it verbatim,
   then add only the log-linear witness fit (dimension 1) and the ordered foils. This is a copy-and-wire
   session, not a design-from-scratch one; do it once 3-4 members exist so the sweep has range.
6. Move into Tier 2: Treap / Scapegoat (the balanced BST pair), OrderStatTree, IndexedHeap (decrease-key
   for Dijkstra/A\*), SortedArray (the amortized member), MinMaxHeap (the DEPQ), SplayTree (the
   self-adjusting/working-set member) -- one concept per release.
7. Keep Tier 3 as presets/substrate (DaryHeap as a `BinaryHeap({arity})` preset, Fenwick2D as a Fenwick
   preset, NodePool as shared substrate) and the mergeable-heap family (BinomialHeap -> PairingHeap ->
   FibonacciHeap, the worst-case -> practical -> textbook-optimal progression) plus IntervalTree /
   WeightBalanced on the research track until each earns a standalone slot.
8. **Tier 4 (exotic but a golden niche)** -- PersistentSegTree, MergeSortTree, WaveletTree, LinkCutTree,
   EulerTourTree, CartesianTree, XorTrie -- each a dedicated future member built ONLY when a real use case
   names it, each shipped with the witness AND its honest caveat (the `+k`, the `log^2`, the O(w), or the
   amortized single-op spike). These are the "old but gold / exotic" reserve, not the near-term queue.
9. Every member proven by `node --expose-gc test/torture.mjs` (0 B/op) AND the witness gate (the
   log-linear fit stays within its `R^2` floor and slope band across the `n` sweep) AND the perf gate.
   No gate output is a FAIL.

Cadence (per the user, mirroring lite-o1): ONE member per session, DISCUSSION-DRIVEN -- the planner
produces the spec, it comes back to the user to study and refine BEFORE any code, then
coder -> reviewer -> qa + the torture, witness, and perf gates. A+ bar per member.

---

## 11. Open Questions

- **The package name -- DECIDED (user, 2026-09-15): `lite-logn`.** Folder `LiteLogN`, single
  PascalCase main file `LogN.js`. Rejected: `lite-log-n` (the user's call -- npm's search/normalization
  handles the extra hyphen-separated token poorly, hurting discoverability and inviting confusion with
  `log` packages) and `lite-log` (reads as a LOGGING library). `lite-logn` is the lean, unambiguous form
  that still spells "log n". Error tags are `[lite-logn]`.
- **The witness's fit thresholds.** What `R^2` floor and slope band make a fair, non-flaky gate for
  "genuinely logarithmic" across machines and CI noise -- strict enough to catch a hidden O(n) or a
  degenerate randomized run, loose enough not to fail on a busy runner? (lite-o1's flatness-floor
  question, transposed to a linear fit.)
- **`NodePool` ownership.** Re-export lite-o1's `SlotPool`, depend on lite-arena, or ship a deliberately
  separate general primitive? The single most consequential cross-package call (section 6).
- **The ordered-collection spine's honest reach.** How much of `get`/`has`/`delete`/`min`/`successor`/
  `rank` can be a shared interface before it lies about members that do not fit it (a heap has no
  `successor`; a Fenwick tree has no `get` in the map sense)? (lite-o1's spine-reach question.)
- **Treap vs Scapegoat as the first balanced BST.** Randomized-expected (simpler, needs a seeded RNG and
  a distribution story) vs amortized-deterministic (no RNG, but an O(n) rebuild spike). Ship one first,
  or both as the "randomized vs deterministic" honest pair?
- **Benchmark framework -- RESOLVED (user, 2026-09-16): ADOPT, do not fork or reinvent.** lite-o1's
  Bench v2 is complete and shipped a `Template.mjs` + `METHODOLOGY.md` expressly for the siblings to copy.
  lite-logn ports that harness verbatim (a dev-only shared blueprint, zero RUNTIME deps preserved) and
  changes only the witness FIT (log-linear vs `log2(n)`) and the ordered FOILS. The only open sub-question
  is calibrating the witness's own R^2 floor + slope band (the item above), not the harness.
- **What does further user research add or reorder?** (This roster folds in the user's candidate list;
  treat any additional notes as authoritative input at planning time.)

---

*This document consolidates the design identity, the logarithmic-growth-witness anchor, the full
candidate roster with its explicit boundary, reference implementations, and the demo direction for the
lite-logn project. It is an internal research reference, modeled on lite-o1/RESEARCH.md, and is a PLAN,
not a go: no building until the user greenlights it.*
