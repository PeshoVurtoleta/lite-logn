# 0020 -- CartesianTree: a static, immutable range-minimum tree via binary-lifting LCA (D-CT1..D-CT6)

- Status: ACCEPTED
- Severity: S1 (the eighteenth member and the family's range-MINIMUM tree -- picks binary-lifting
  worst-case O(log n) over a linear-space expected structure and over a swap to a dynamic LinkCutTree,
  a STATIC/immutable copy-in build, a materialized walkable parent/left/right/depth topology as the
  load-bearing idiom, a frozen `min`/`max` kind, the honest O(log n)-vs-SparseTable-O(1) redundancy at
  the same O(n log n) space, and the rangeMinIndex witness lane on the DEFAULT single-log log2(n) axis)
- Date: 2026-09-24
- Session: CartesianTree (v1.2.0)

## Context

CartesianTree is the eighteenth member and the family's range-MINIMUM (RMQ) tree. It is a STATIC,
IMMUTABLE heap-ordered Cartesian tree: over a fixed sequence of finite numbers it answers
`rangeMinIndex(lo, hi)` (the INDEX of the extreme value in an INDEX range) and `rangeMin(lo, hi)` (its
value) in worst-case O(log n), zero-allocation, and it MATERIALIZES a walkable `parent` / `left` /
`right` / `depth` / `root` topology plus `at(i)`. It is the family's FOURTH static member (after
SortedArray-read, MergeSortTree, WaveletTree) and, like MergeSortTree / WaveletTree, truly immutable:
the source is COPIED in at construction and there are NO mutators.

The binding idea is the classic RMQ = LCA equivalence: a Cartesian tree is a binary tree whose in-order
traversal is the original index order and whose every parent holds a value <= (for a `min` tree) / >=
(for `max`) its children (heap order). The range minimum over `[lo, hi]` is then EXACTLY the lowest
common ancestor of nodes `lo` and `hi`. This is the teaching bridge the library was missing: the Treap
(member 5) is the RANDOMIZED Cartesian tree (value + a random priority, dynamic); CartesianTree is the
DETERMINISTIC value-keyed one (static, RMQ-shaped).

This is the SparseTable / MergeSortTree / WaveletTree / lite-o1 static-member honesty contract (see the
lite-o1 static-members-admitted call): the query is worst-case O(log n) zero-alloc, but the O(n) tree
build + O(n log n) binary-lifting SPACE are a DISCLOSED co-headline, never hidden. There is no
max-single-op line (a build-once immutable tree has no randomization and no amortization).

## Decision

**D-CT1 static build-once + IMMUTABLE, NOT a dynamic tree.** `new CartesianTree(values, kind)` (or the
`CartesianTree.build(values, kind)` factory) COPIES a snapshot of `values` into an internal
`Float64Array`; mutating the caller's array afterward never changes a result. There are NO mutators
(no set / update / insert / delete / clear) -- the tree is frozen at construction, so every query is a
read-only climb. This mirrors MergeSortTree (D-MST1) / WaveletTree (D-WT1): the RMQ power depends on
knowing all values up front; the mutable / dynamic Cartesian-tree role is already covered by the Treap.

**D-CT2 (THE BUILD) a monotonic-stack Cartesian tree + a binary-lifting ancestor table.** A single O(n)
monotonic-stack pass builds the tree: keep the RIGHT spine on the stack, pop while the top must sit
BELOW `i` (min: `val[top] > val[i]`; max: `val[top] < val[i]`) -- STRICT, so an EQUAL value keeps the
EARLIER index as the ancestor, giving `rangeMinIndex` the FIRST-occurrence (leftmost-wins) tie rule a
linear scan gives. The last popped node becomes `i`'s left child; the new stack top (if any) becomes
`i`'s parent with `i` as its right child. An ITERATIVE preorder DFS then fills each node's `depth` (an
explicit stack over the `stack` scratch -- never recursion, which would blow the call stack on a
degenerate O(n)-deep chain). The binary-lifting table `up[i][k] = 2^k-th ancestor of i` is built column
by column in O(n log n) over a flat `n * L` `Int32Array` (`L = ceil(log2 n) + 1`), with `-1`
propagation (a `-1` ancestor stays `-1` up every higher level). All flat typed arrays: `_val`
(Float64), `_left` / `_right` / `_parent` / `_depth` / `_up` (Int32) -- no per-node objects, no
pointers, contiguous and cache-friendly, which is what makes every query 0 B/op.

**D-CT3 (THE LOAD-BEARING IDIOM) rangeMinIndex = a binary-lifting LCA climb.** `rangeMinIndex(lo, hi)`
is the LCA of nodes `lo` and `hi`: make the deeper node `a`, lift it up by the depth difference bit by
bit over `_up`, and if it meets `b` return it (b was an ancestor); otherwise co-lift both in lock-step
from the highest level down, taking each jump that keeps them on DIFFERENT nodes, and return the common
parent. It reads `_depth` / `_up` into local scalars only -- O(log n), O(1) per level, zero allocation.
Because `kind` is baked into the tree at build (D-CT4), there is NO per-op value compare or branch in
the climb. `rangeMin` is `_val[rangeMinIndex(...)]` (one extra read). `at` / `parent` / `left` / `right`
/ `depth` / `root` are O(1) point reads over the flat arrays.

**D-CT4 kind ('min' | 'max') FROZEN at construction.** The `kind` selects the pop comparison at build
and is then baked into the whole tree shape, so the hot climb never re-reads it. This is the
SparseTable / MinStack ctor-cached-boolean pattern (`_isMin`): the range queries report the minimum for
a `min` tree, the maximum for a `max` tree, with no per-op cost for the choice. A tree built `min`
cannot answer max queries (and vice versa) -- build two trees if you need both.

**D-CT5 (THE HONEST REDUNDANCY) O(log n) query vs lite-o1 SparseTable's O(1), at the SAME O(n log n)
space.** CartesianTree deliberately overlaps lite-o1's `SparseTable`, which answers RMQ in O(1) at the
same O(n log n) space. The overlap is disclosed, not hidden: the O(log n) cost is justified ONLY by (a)
the MATERIALIZED, WALKABLE tree (`parent` / `left` / `right` / `depth` / `root`) that SparseTable's flat
sparse table does not expose, and (b) the RMQ = LCA teaching bridge -- the reason this member exists in
an O(log n) family that PROVES its logarithm. If you need the O(1) query and never walk the tree, reach
for lite-o1's SparseTable; if you need the tree shape or the LCA structure, reach here. This honesty
clause is repeated in llms / README / GUIDE / CHANGELOG.

**D-CT6 fail closed on every unverified state; witness = `rangeMinIndex` on the SINGLE-log log2(n)
axis, WORST-CASE, NO max-single-op line.** The source must be an array-like of FINITE numbers
(typeof-guarded FIRST -- Symbol / BigInt / NaN / +-Infinity each throw `[lite-logn]`; null is not zero),
the length an integer in `[1, CT_MAX_LENGTH]` (`0x7FFFFFFF`), `kind` exactly `'min'` or `'max'`, and the
`n * L` lift-cell count a PRODUCT guarded by a FLOAT multiply against `CT_MAX_CELLS` (`0x7FFFFFFF`) --
never `| 0`, which would wrap a large product and fail OPEN (the MST_MAX_CELLS / WT_MAX_CELLS lesson).
`L = ceil(log2 n) + 1` is computed by an EXACT float loop (`while (2 ** bitlen < n) bitlen++`), never
`1 << k` (wraps at k >= 31) and never `Math.log2` (mis-rounds a power of two); the `+1` gives one lift
level above the tallest possible chain (depth <= n - 1 < 2^ceil(log2 n)) so the climb can always clear
it. Query bounds are integers with `0 <= lo <= hi < n`; bad indices / ranges / kinds / types throw via
cold-path builders off the hot body. The gated witness op is `rangeMinIndex`: a single LCA climb of the
levels with O(1) `_up` per step, so it is O(log n) and fits the DEFAULT log2(n) axis (a single log).
Shared R^2 floor 0.958 (D-08 / decisions/0004), FROZEN. CartesianTree's OWN slope band =
median-of-15-fit-runs * [0.6, 1.4], centered on the MEDIAN measured UNDER REPRESENTATIVE (post-torture /
post-witness / post-perf, warm) conditions -- the state the `verify` gate actually runs in (2.8092
ns/level on this machine -> band [1.69, 3.93]; a first pass calibrated on a quiet freshly-started process
measured 2.585 -> [1.55, 3.62], which sat only ~5% under the warm ceiling and was re-centered post-QA --
see the witness.mjs inline note); the lane opts into the median-of-7-fits hook (like WaveletTree /
MergeSortTree / PST) for post-torture thermal robustness. The O(n) LINEAR extreme-scan foil (walk the index window, track the
running extreme) is LINEAR on the log2(n) axis and MUST miss the floor. There is DELIBERATELY NO
max-single-op disclosure line: a static immutable member has no randomized tail and no amortized spike
(the MergeSortTree / WaveletTree / SortedArray-read precedent).

## Consequences

- The family gains the range MINIMUM / MAXIMUM (RMQ) query over a fixed sequence and its binding of the
  RMQ = LCA equivalence -- a clean teaching contrast with the randomized dynamic Treap (member 5) and
  with the range-RANK / order-statistic static members (MergeSortTree / WaveletTree).
- Queries are 0 B/op: rangeMinIndex / rangeMin are read-only LCA climbs; at / parent / left / right /
  depth are point reads. Proven by `node --expose-gc test/torture.mjs` (a per-cycle build/discard
  tracker lane over both kinds + hot query churn lanes on an immutable tree held OUTSIDE the loop + an
  arrayBuffer soak with a rangeMin == at(rangeMinIndex) round-trip check).
- The O(n) tree build + O(n log n) lift table + space are a DISCLOSED co-headline in llms / README /
  GUIDE / CHANGELOG, and the O(log n)-vs-SparseTable-O(1) redundancy (D-CT5) is stated plainly wherever
  the member is described.
- Space is fixed at construction (fail-closed float-product cell guard); there is no grow path, so the
  backing stores are never reallocated.

## Alternatives rejected

- **Option B: a linear-SPACE RMQ (the Bender-Farach-Colton +-1 RMQ / four-Russians blocks, expected
  O(n) space, O(1) query).** Rejected: it removes the O(n log n) space but its construction reduces RMQ
  to an Euler-tour +-1 LCA with a lookup table over `1/2 log n`-sized blocks -- and a SORTED (or
  reverse-sorted) input builds a DEGENERATE O(n)-deep chain whose Euler tour is O(n) with no block
  structure to exploit, a degenerate O(n) path that defeats the worst-case bound this family gates on.
  Binary lifting (Option A) is worst-case O(log n) on ANY input, including the adversarial sorted /
  reverse / all-equal cases the oracle suite hammers, at the disclosed O(n log n) space -- the honest
  worst-case pick for a family that PROVES its logarithm.
- **Option C: swap the whole member to a dynamic LinkCutTree (O(log n) amortized path/LCA under
  edits).** Rejected / DEFERRED: a link-cut tree buys dynamic connectivity + path aggregates, but it is
  amortized (splay-based), pointer-heavy, and a poor fit for the STATIC RMQ = LCA teaching goal here; it
  is deferred to a possible future dynamic-tree member, not folded into CartesianTree.
- **A recursive depth DFS.** Rejected (D-CT2): a degenerate sorted input builds an O(n)-deep chain that
  would overflow the native call stack. The depth pass is an ITERATIVE preorder DFS over a reused scratch
  stack.
- **A per-op `kind` compare in the climb.** Rejected (D-CT4): baking `kind` into the tree shape at build
  keeps the hot LCA climb free of any value compare (it walks `_depth` / `_up` only), so a `min` and a
  `max` tree share one hot path.
- **A `| 0` lift-cell-budget guard.** Rejected (D-CT6): it fails OPEN on overflow. The FLOAT product
  fails CLOSED.
- **Gating rangeMinIndex on the squared-log axis (like MergeSortTree).** Rejected (D-CT6): the LCA climb
  is a single descent with O(1) `_up` per level, a genuine single log -- gating it on `(log2 n)^2` would
  understate its shape. It fits the DEFAULT log2(n) axis, like WaveletTree.
