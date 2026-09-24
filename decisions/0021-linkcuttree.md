# 0021 -- LinkCutTree: a dynamic-forest path-aggregate tree via preferred-path splay (D-LCT1..D-LCT7)

- Status: ACCEPTED
- Severity: S1 (the nineteenth member and the family's FIRST dynamic-topology structure -- picks a full
  link-cut tree WITH evert over a strictly-rooted variant, a commutative-fold aggregate that is
  reversal-INVARIANT (no mirrored aggregate), a FIXED vertex set with NO allocator (link / cut flip edges
  only), the min / max / sum / gcd path folds frozen at ctor, a PATH-only surface with subtree aggregates
  deferred to a future EulerTourTree, and the amortized pathAggregate witness lane on the DEFAULT
  single-log log2(n) axis with a DISCLOSED-not-gated max single-op bar)
- Date: 2026-09-24
- Session: LinkCutTree (v1.3.0)

## Context

LinkCutTree is the nineteenth member and the family's FIRST dynamic-topology structure: everything
before it is either a fixed-capacity container (the heaps, the ordered maps over one arena) or a
static / immutable built-once structure (SortedArray-read, PersistentSegTree, MergeSortTree,
WaveletTree, CartesianTree). LinkCutTree maintains a FOREST of rooted trees under `link(child, parent)`
and `cut(node)` and answers PATH aggregates -- `pathAggregate(u)` (root -> `u`) and `pathAggregate(u, v)`
(the `u..v` path) -- in AMORTIZED O(log n), zero-allocation, over a Sleator-Tarjan preferred-path
decomposition where each preferred path is a splay tree keyed by depth and path-parent pointers stitch
the paths together.

It is the dynamic complement to CartesianTree (member 18, the STATIC RMQ = LCA tree): where CartesianTree
answers range-extreme over a frozen array, LinkCutTree answers a path fold over an edge-mutable forest.
It reuses the PATTERN of SplayTree (member 8) -- an iterative, native-stack-free, zero-allocation splay --
but it is a distinct DEPTH-keyed splay with path-parent pointers, not the ordered-map splay, so it is a
fresh class, not a subclass.

Amortized, like SplayTree / PairingHeap / FibonacciHeap: a single link / cut / access can splay a long
preferred path, so there is a real single-op spike. The witness fits the amortized log line and
DISCLOSES the max single-op bar (never gates it) -- the established amortized-member honesty contract.

## Decision

**D-LCT1 a FULL link-cut tree WITH evert (makeRoot), NOT a strictly-rooted variant.** `evert(u)` re-roots
the tree containing `u` at `u`. It is what makes `pathAggregate(u, v)` possible: evert `u`, access `v`,
read `v`'s aggregate = the fold over `u..v`. A strictly-rooted tree could only fold root -> `u`, and the
`u..v` path is the query people actually reach for a link-cut tree. Evert is cheap here (D-LCT3) because
the folds are commutative, so it earns its place.

**D-LCT2 (THE REPRESENTATION) preferred-path splay forest over eight flat columns, iterative splay.** The
forest is stored as splay trees of preferred paths: `_val` / `_agg` (Float64), `_l` / `_r` / `_p`
(Uint32, NIL = 0, slot 0 reserved), `_rev` (Uint8 lazy-reversal flag), and `_stk` (a preallocated Uint32
push-down scratch). Vertex ids are `[0, capacity)`, mapped to live slots `[1, capacity]`. `_p` is
DUAL-ROLE: for a node inside a splay tree it is the splay parent; for the splay-tree ROOT it is the
PATH-parent (or NIL). The standard `_isRoot(x)` test -- `x` is not a child of `_p[x]` -- distinguishes
them with no extra column. `_access(x)` makes the root-to-`x` path preferred and splays `x` to the top;
`_splay` walks up with lazy `_push` on the way DOWN and `_pull` after each rotation. Everything is
ITERATIVE over the reused `_stk` -- never recursion, which a degenerate O(n)-deep chain would overflow
(the SplayTree D-SP1 precedent) -- so every hot op is 0 B/op.

**D-LCT3 (THE LOAD-BEARING IDIOM) commutative folds make reversal AGGREGATE-INVARIANT.** min / max / sum
/ gcd are all COMMUTATIVE, so the fold over a path does not depend on the direction it is read. `evert`
therefore only swaps a node's `_l` / `_r` children and flips its `_rev` bit (pushed down lazily on the
next access); it does NOT need to maintain a second, mirror-order aggregate. `_pull(x)` recomputes
`_agg[x]` from `_agg[_l[x]]`, `_val[x]`, `_agg[_r[x]]` in ctor-frozen fold order, and that single
aggregate is correct in either traversal direction. This is what keeps evert O(log n) amortized and
0 B/op, and it is the reason the folds are restricted to commutative ones (D-LCT4 / alternatives).

**D-LCT4 the four path folds (min | max | sum | gcd) FROZEN at construction.** `new LinkCutTree(capacity,
kind)` bakes `kind` into a small-int `_k` (0 min, 1 max, 2 sum, 3 gcd) read by an INLINE switch in
`_pull` -- no closure, no function reference, no megamorphic call site (the SegmentTree / PersistentSegTree
/ SegmentTree2D pattern). The fold identity `_idv` (min +Infinity, max -Infinity, sum / gcd 0) is the
aggregate of NIL so a missing child folds away. The set matches the family's other associative-fold
members; gcd rejects negative / non-integer values at the `setValue` door.

**D-LCT5 a FIXED vertex set, NO allocator; link / cut flip EDGES only; clear() resets in place.** The
vertices are fixed at construction (`capacity` of them); `link` / `cut` / `evert` change EDGES, never the
node set, so there is NO per-op allocation, NO free-list (unlike SkipList / Treap / the pointer members),
and NO bump allocator (unlike PersistentSegTree) -- the buffers are sized once and only their contents
change. `link(c, p)` everts `c` and hangs it under `p` with one path-parent pointer; `cut(node)` accesses
it and splits off its shallower subtree. `setValue(id, v)` is an absolute O(log n)-amortized write.
`connected(u, v)` is `findRoot(u) === findRoot(v)`. `clear()` resets every column IN PLACE (edges dropped,
reversal flags cleared, values + aggregates back to identity, edge count 0) in O(n), zero-allocation, so
the instance is immediately reusable -- LinkCutTree is a MUTABLE member and takes its place among the
`clear()` witnesses (it is NOT one of the three static members excluded from that set).

**D-LCT6 PATH-only; NO subtree aggregate (the documented sibling asymmetry).** LinkCutTree answers PATH
queries. Subtree aggregates and unrooted dynamic-connectivity-with-subtree-folds are deliberately NOT
here -- they are the job of a future EulerTourTree (an Euler tour held in a balanced BST), the planned
dynamic-forest sibling. Naming the boundary is the honesty discipline: reach for LinkCutTree for path
folds under link / cut; reach for the future EulerTourTree for subtree folds. `findRoot` / `connected`
are the connectivity surface offered here (cheap by-products of `access`).

**D-LCT7 fail closed on every unverified state; reads that splay validate FIRST; witness = pathAggregate
on the DEFAULT log2(n) axis, AMORTIZED, with a DISCLOSED-not-gated max bar.** `capacity` is an integer in
`[1, LCT_MAX_CAPACITY]` (`0x7FFFFFFF`); `kind` is exactly `'min' | 'max' | 'sum' | 'gcd'`; every vertex id
is an integer in `[0, capacity)`, typeof-guarded (Symbol / BigInt-safe via `Number.isInteger`) BEFORE any
splay -- the SplayTree 0010 fail-OPEN lesson: a MUTATING read (`findRoot` / `connected` / `pathAggregate`)
must reject a bad id before it half-mutates. `link` throws `[lite-logn]` as a no-op on a self-link or a
CYCLE-creating link (the two vertices already connected); `cut` throws on cutting a vertex with no parent
edge (a tree root); a two-endpoint `pathAggregate` across different trees throws (no path -- checked
BEFORE any evert half-mutates); `setValue` throws on a non-finite value or (gcd) a negative / non-integer.
The gated witness op is `pathAggregate`: an amortized access + splay, a single log descent, so it fits the
DEFAULT log2(n) axis (like WaveletTree / CartesianTree). Shared R^2 floor 0.958 (D-08 / decisions/0004),
FROZEN. LinkCutTree's OWN slope band = median-of-15-fit-runs * [0.6, 1.4], centered on the MEDIAN measured
under REPRESENTATIVE (post-torture / post-witness / post-perf, warm) conditions -- the state the `verify`
gate runs in (56.2396 ns/level on this machine -> band [33.74, 78.74]). RE-CENTERED ON THE FIXED WORKLOAD
during QA: the witness measures `pathAggregate` over a UNIFORM-RANDOM working set of size n (a shuffled
permutation of ALL n vertices, cycled -- SplayTree.get's discipline), so every op re-prefers a fresh
root-to-node path and churns the full height. An earlier workload accessed 1024 FIXED targets in FIXED
order; after warmup those paths stayed preferred + cache-resident, so the timed op was a warm CACHED
re-access whose cost barely scaled with log2 n -- the fit sat OFF the line (R^2 ~ 0.72-0.93, slope flaky
run-to-run) and its warm band [8.68, 20.25] (warm median 14.4618; a cold first pass measured 12.4949 ->
the provisional [7.50, 17.49]) was measured on that flaky workload. The fixed workload measures the TRUE
amortized access (multiple splays climbing the path-parent chain), intrinsically ~4x costlier per level,
and fits clean + stable (all 15 warm fits R^2 in [0.9869, 0.9995]). This SUPERSEDES the [8.68, 20.25] band;
see the witness.mjs inline note. The lane opts into the median-of-7-fits hook, like Splay / Wavelet /
CartesianTree, for post-torture thermal robustness. Because the member is AMORTIZED, the max single
pathAggregate is DISCLOSED as a co-headline and NEVER gated (the SplayTree / PairingHeap / FibonacciHeap
precedent). The O(depth) naive parent-walk foil (fold the root-to-node path by walking parent pointers,
which is O(n) on a deep chain) is linear on the log2(n) axis and MUST miss the floor.

## Consequences

- The family gains dynamic forests: `link` / `cut` under path folds (min / max / sum / gcd) in amortized
  O(log n), the dynamic-connectivity / dynamic-MST / max-flow workhorse, and its FIRST mutable-topology
  member. A clean contrast with the STATIC CartesianTree (RMQ = LCA over a frozen array) and the
  randomized dynamic Treap (an ordered map, not a forest).
- Every hot op is 0 B/op: link / cut / evert / findRoot / connected / pathAggregate / setValue / clear are
  splay / in-place resets over the flat columns. Proven by `node --expose-gc test/torture.mjs` (a
  per-cycle build-forest / churn / discard tracker lane over multiple kinds, hot pathAggregate churn on a
  warmed forest held OUTSIDE the loop, an arrayBuffer soak, and an EDGE-conservation check across
  cut-then-re-link rounds).
- The amortized witness DISCLOSES the max single-op bar (D-LCT7); the O(log n)-amortized bound and the
  path-only scope (subtree deferred to EulerTourTree) are stated in llms / README / GUIDE / CHANGELOG.
- Space is fixed at construction; there is no grow path, so the backing stores are never reallocated, and
  `clear()` reuses them in place.

## Alternatives rejected

- **A strictly-rooted link-cut tree (no evert).** Rejected (D-LCT1): it can only fold root -> `u`, but the
  `u..v` path fold is the common link-cut query. Evert is cheap here because the folds are commutative
  (D-LCT3), so the full tree is the right default.
- **A mirror-order aggregate to support NON-commutative path folds** (e.g. matrix product, string concat,
  a non-commutative monoid). Rejected (D-LCT3 / D-LCT4): a non-commutative fold under reversal needs BOTH
  a forward and a reversed subtree aggregate, swapped on every `_rev` flip -- more columns, more work per
  rotation. Restricting to COMMUTATIVE folds makes reversal aggregate-invariant (a single `_agg`), which
  is what keeps evert and pathAggregate lean and 0 B/op. The four admitted folds (min / max / sum / gcd)
  are all commutative and match the family's other fold members.
- **A subtree aggregate on LinkCutTree.** Rejected / DEFERRED (D-LCT6): subtree folds are the job of a
  future EulerTourTree (Euler tour in a balanced BST). Folding both path and subtree into one member would
  blur the teaching boundary and the surface; the two are documented siblings.
- **A free-list NodePool or a bump allocator.** Rejected (D-LCT5): the vertex set is FIXED and link / cut
  flip edges only -- no node is ever allocated or freed per op, so neither the SkipList / Treap free-list
  nor the PersistentSegTree bump cursor applies. The columns are sized once; `clear()` resets in place.
- **A recursive splay / access.** Rejected (D-LCT2): a degenerate O(n)-deep preferred path would overflow
  the native call stack. Splay and access are iterative over the reused `_stk` scratch.
- **A per-op `kind` compare in `_pull`.** Rejected (D-LCT4): the ctor-frozen small-int `_k` drives an
  inline switch, so all four folds share one hot path with no closure or megamorphic dispatch.
- **Gating pathAggregate on the squared-log axis (like MergeSortTree).** Rejected (D-LCT7): an access is a
  single splay descent, a genuine single log; gating on `(log2 n)^2` would misstate its shape. It fits the
  DEFAULT log2(n) axis, like WaveletTree / CartesianTree.
- **Gating the amortized max single-op (like a worst-case member).** Rejected (D-LCT7): a single access
  can splay a long path, an amortized spike, not a worst-case-per-op bound. The max bar is DISCLOSED, not
  gated -- the SplayTree / PairingHeap / FibonacciHeap contract.
