# 0022 -- EulerTourTree: a dynamic-connectivity subtree-aggregate tree via an Euler tour in a treap (D-ETT1..D-ETT8)

- Status: ACCEPTED
- Severity: S1 (the twentieth member and the family's SUBTREE / dynamic-connectivity structure -- the
  LinkCutTree sibling decisions/0021 D-LCT6 defers subtree folds to. Picks a Henzinger-King Euler tour
  over a parent-pointer TREAP (NON-mutating reads, EXPECTED cost) over a splay sequence, an
  endpoint-addressed open-addressed arc table with backward-shift delete, the min / max / sum / gcd folds
  frozen at ctor with a per-kind store + an always-on vertex-count column, the complement-fold subtree
  semantics in an UNROOTED forest, the surface as listed, the subtreeAggregate witness on the DEFAULT
  single-log log2(n) axis with a DISCLOSED-not-gated max single link / cut, and a FLOAT-product capacity
  guard)
- Date: 2026-10-04
- Session: EulerTourTree (v1.5.0)

## Context

EulerTourTree is the twentieth member and the structure LinkCutTree explicitly defers to (0021 D-LCT6).
LinkCutTree folds PATHS in a ROOTED forest; EulerTourTree folds SUBTREES and whole COMPONENTS in an
UNROOTED forest under `link(u, v)` / `cut(u, v)`, and answers `connected(u, v)` without restructuring
anything. Together they are the dynamic-forest pair. The teaching trick: store each tree's EULER TOUR --
every edge walked both ways -- as a balanced-BST sequence. Linking and cutting trees then become splitting
and concatenating sequences; a subtree is one contiguous tour segment, so a subtree fold is a range fold.

LCT or ETT? Path fold / evert -> LinkCutTree. Subtree or component fold, read-only connectivity ->
EulerTourTree.

## Decisions

**D-ETT1 backing BST = a parent-pointer TREAP, not a splay. SETTLED.** With a treap (seeded instance-local
LCG, the same one `Treap` uses), `connected` / `componentAggregate` / `subtreeAggregate` / `componentSize` /
`subtreeSize` / `at` are NON-mutating reads: they climb parent pointers to the tour root and read the range
folds top-down, no rotation and no PRNG on the read path. That avoids LCT's mutating-read class (0021 F9 /
S3). The cost is EXPECTED rather than amortized, which the family already discloses for SkipList / Treap. A
splay sequence would be amortized, but every read would have to splay (an unsplayed parent climb is unbounded
under amortized analysis), making every read a mutation -- the LCT problem again.

**D-ETT2 tour representation = Henzinger-King. SETTLED.** One VERTEX node per vertex (carries the value), two
ARC nodes per edge (`u->v` and `v->u`, carry the fold identity). The tour is CYCLIC; a vertex node follows one
of its entering arcs (or is alone). A rotation preserves every fold, so "reroot at u" is a split + concat.
`link(u, v)` reroots each tour at its endpoint and splices `rot_u ++ [u->v] ++ rot_v ++ [v->u]`; `cut(u, v)`
splits the tour at the two arc occurrences into `A (arcLo) B (arcHi) C` and keeps `B` and `C ++ A`. Node
budget = V vertex slots + 2(V-1) arc slots, fixed at construction; arc slots come from a fixed private
free-list (`NodePool`, indices not objects). Slot 0 is NIL; vertex slots are `[1, V]` (id `v` -> slot `v+1`),
arc slots `[V+1, 3V-2]`.

**D-ETT3 edge addressing = an endpoint-addressed open-addressed arc table. SETTLED.** `cut(u, v)` / `hasEdge(u, v)`
find the arc slot by endpoints through a private table: LINEAR probing, BACKWARD-SHIFT delete (no tombstone
buildup under churn), power-of-two size `>= 4V`, two `Int32Array` key columns (`_arcFrom` / `_arcTo`) + one
`Uint32Array` slot column (`_arcSlot`, 0 = empty). The hash mixes the two endpoints and masks to the power-of-
two size with `>>> 0` so it stays a Smi (REVIEW CORRECTION: the `_arcHash` mask is applied as an unsigned
32-bit op, `(h & _arcMask) >>> 0`, so the probe index never leaves the Smi range and the hot probe loop boxes
nothing). The alternative (an edge handle returned by `link`) was rejected: it pushes the stale-handle risk to
the caller.

**D-ETT4 folds = min / max / sum / gcd frozen at construction via small-int `_k`, plus an ALWAYS-ON vertex-count
column. SETTLED.** `_pull(x)` recomputes `_size` / `_vcnt` / `_agg` from the children and own value with a
per-kind store in EACH branch -- no tagged phi that would box a pure-double sum arm together with `segGcd`'s
non-inlined return (0021 F3 / lesson 12.2.1). `_vcnt` (vertex nodes count 1, arc nodes 0) gives
`componentSize` / `subtreeSize` for free. An UNSET vertex reads the fold IDENTITY (min +Inf, max -Inf, sum /
gcd 0), never 0 (null is not zero); `clear()` returns every vertex to it. The sum kind bounds
`|value| <= MAX_VALUE / (2 * capacity)` at `setValue` (a component holds <= capacity vertices and arc nodes
carry the identity, so no fold reaches Infinity / NaN); gcd requires a nonnegative integer.

**D-ETT5 subtree semantics in an UNROOTED forest. SETTLED.** `subtreeAggregate(v, p)` = the fold over v's side
after removing edge `(v, p)`; it throws if `(v, p)` is not an edge. Read-only: find the ranks of arc `p->v` and
arc `v->p` by parent climbs. If `p->v` comes first, fold the OPEN segment strictly between them; otherwise fold
the COMPLEMENT as two range folds (`[0, j-1]` and `[i+1, N-1]`). The complement form works for min / max / gcd,
which have no inverse -- it never subtracts, it folds two sub-ranges. `subtreeSize` is the same with the
vertex-count column.

**D-ETT6 surface. SETTLED.** `link(u, v)` (throws on a bad id / self / cycle -- the cycle test is the read-only
`connected`), `cut(u, v)` (throws on a non-edge), `setValue(v, x)`, `at(v)`, `connected(u, v)`,
`componentAggregate(v)`, `componentSize(v)`, `subtreeAggregate(v, p)`, `subtreeSize(v, p)`, `hasEdge(u, v)`,
`clear()`; getters `capacity` / `kind` / `edges`. NO evert and NO path fold (LinkCutTree's job; the sibling
asymmetry). NO forEach / iterator (a forest has no single timeline; walk it through `connected` / the folds).
`forEachInComponent` is deliberately NOT shipped (add on demand).

**D-ETT7 witness. SETTLED.** Gated op = `subtreeAggregate` on the DEFAULT log2(n) axis. Workload: a random
recursive tree over n vertices (uniform-random parent picks), with an interleaved cut + relink churn pass so
the treap shape stays random, then hammer `subtreeAggregate` on a FIXED `(v, p)` edge set chosen OUTSIDE timing
(min-over-batches). EXPECTED member, so the witness DISCLOSES the MAX single link + cut, never gates them.
Foil: an O(component) DFS over an adjacency list, which must miss the R^2 floor. Sweep: EXACT powers of two
`2^9..2^17` (8 levels). The sub-L2 points below 2^9 are pure fixed overhead (two arc-table probes + short rank
climbs) well under the structural log signal, so they sit flat off the line -- dropped, the SplayTree.get /
SortedArray.get / LinkCutTree "drop the too-fast low point" lesson (decisions/0004 "Post-1.4.1": a fast lane
needs dynamic RANGE, and the clean log signal only emerges above the L2 cache cliff where memory latency x
log-depth dominates). Shared 0.958 R^2 floor (frozen), lane-scoped median-of-9 fit. The slope band is
CALIBRATED by the decisions/0004 rule: 15 warm post-torture single fits on 2^9..2^17 (200000-iter
min-over-25-batches) gave slopes 88.39..94.78 ns/level (median 91.936) at R^2 0.9749..0.9931 (all >> the
floor); band = 91.936 x [0.6, 1.4] = [55.16, 128.71]. The O(component) DFS foil fits R^2 ~0.78-0.79 (off).

**D-ETT8 capacity = a FLOAT-product guard. SETTLED.** `ETT_MAX_CAPACITY = 0x10000000` (2^28), such that the
3V-1 node slots, the power-of-two (>= 4V) arc table, and every typed-array length stay < 2^31. 4V is the
binding product: its next power of two must stay below 2^31, so 4V <= 2^30, i.e. V <= 2^28. The constructor
recomputes `3V-1` and the arc-table size as FLOATS and fails closed with `!(x < 2147483648)` (never `| 0`): a
huge typed array is an uncatchable V8 fatal, not a RangeError, so the cap is checked BEFORE allocating.

## Footprint (REVIEW CORRECTION)

~188-236 B/vertex, not the ~170 B the pre-build note estimated. The columns are 3V-1 node slots x (6 Uint32
columns `_left` / `_right` / `_parent` / `_prio` / `_size` / `_vcnt` + 2 Float64 columns `_val` / `_agg`) = 3V-1
x 44 B ~ 132 B/vertex, plus the `_stk` scratch (3V-1 Uint32, ~12 B/vertex), plus the private arc free-list pool
(~8 B/vertex), plus the power-of-two (>= 4V) arc table at 12 B/entry (48-96 B/vertex depending on how far V sits
above the previous power of two). The headline figures: 188 B/vertex at a power-of-two V, 236 at V = 1025, 203
at V = 1e5. This is the D3 co-headline -- the price of subtree folds + read-only connectivity over LCT's ~41
B/vertex path-only footprint.

## clear() (REVIEW CORRECTION)

`clear()` zeroes the structural columns AND the arc-table KEY columns: `_arcSlot.fill(0)` (every entry empty),
`_arcFrom.fill(0)` and `_arcTo.fill(0)` (no stale endpoint keys survive). Without zeroing the key columns a
cleared-then-reused instance could probe-match a stale key; zeroing all three makes `clear()` byte-identical to
a fresh constructor. Values + aggregates reset to the fold identity (not 0), the arc free-list refills, the LCG
reseeds to its initial seed, and the edge count returns to 0.

## Lessons applied from birth

No tagged phi in `_pull` (12.2.1); `<= 1 box/op` for double returns from non-inlined calls, disclosed
(12.2.2-3); ITERATIVE split / merge / rank / range-fold over `_stk`, with `clear()` tested on a 2^20 path
(12.2.5); no views, so no shared-clear hazard (12.2.6); the sum bound from S1 (12.2.7).

## Consequences

- EXPECTED, not amortized or worst-case: the witness discloses the MAX single link + cut; the honesty class in
  the bench OP_CLASS is `OLOGN_EXPECTED` (the SkipList / Treap class).
- NON-mutating reads: a column snapshot is byte-identical before and after every read op (a torture +
  test assertion).
- The twentieth member; prior members stay byte-identical (only the `LogN.js` header + `VERSION` change, plus
  the LCT doc cross-reference to the now-shipped sibling).
