# 0015 -- SegmentTree2D: the 2D segment tree of segment trees, O(log^2 n) point-update + rectangle-fold (D-S2-1..D-S2-5)

- Status: ACCEPTED
- Severity: S1 (the family's SECOND multi-dimensional member and SECOND squared-log witness
  member; picks the flat 2R x 2C tree-of-trees layout, the 4*R*C product-overflow door, the
  two-phase linear build, the inner-then-outer point-update order, the commutative-only boundary,
  and reuses the (log2 n)^2 witness axis Fenwick2D introduced)
- Date: 2026-09-21
- Session: SegmentTree2D (v0.13.0)

## Context

SegmentTree2D is the thirteenth member. It completes the 2D range story Fenwick2D (0014, v0.12.0)
opened: Fenwick2D is INDEX-ADDRESSED and SUM-ONLY (a BIT inverts addition to answer a rectangle
from four prefixes, so it can only fold an invertible group). SegmentTree2D folds ANY associative
+ commutative operation over an axis-aligned rectangle -- min / max / sum / gcd -- because it
stores a fold of each sub-rectangle at its internal nodes rather than a prefix. It is to Fenwick2D
exactly what the 1D SegmentTree (0005, v0.3.0) is to the 1D Fenwick: SegmentTree2D : Fenwick2D ::
SegmentTree (1D) : Fenwick (1D). It lifts the rectangle MIN / MAX / GCD that Fenwick2D lists as
its documented not-for.

It is the family's SECOND member whose gated witness op is O(log^2 n) (O(log rows * log cols) for
a square grid of side n), so it REUSES the per-lane `xOf = (log2 n)^2` axis hook Fenwick2D added
to test/witness.mjs -- no new harness mechanism, a second member on the squared-log axis.

## Decision

**D-S2-1 layout = a flat `Float64Array(2*rows * 2*cols)`, the iterative "2n" segment tree in BOTH
dims (a tree OF trees).** One contiguous typed array holds a `2*rows` x `2*cols` grid, row stride
`_w = 2*cols`; the cell of ROW-node `i` (in `[1, 2*rows)`) at COL-node `j` (in `[1, 2*cols)`) is
`_t[i*_w + j]`. Leaf rows are `i` in `[rows, 2*rows)` (public row `r` -> `rows + r`); leaf cols are
`j` in `[cols, 2*cols)` (public col `c` -> `cols + c`). Index 0 in each dim is UNUSED (null is not
zero). Fields: `_r` / `_c` (frozen dims), `_w` (row stride), `_k` (ctor-frozen fold small-int),
`_idv` (fold identity), `_t` (the flat backing array). No pointers, no per-op allocation -- the whole
cost is the O(log rows * log cols) nested walk. `query` descends the OUTER row dim half-open
(`l = rows+r1`, `r = rows+r2+1`, `l < r`, `l&1` / `r&1` boundary picks) collecting O(log rows)
boundary row-nodes, and for EACH does an INNER col-range fold over `[c1, c2]` (the same `l&1` /
`r&1` descent) into one identity-seeded accumulator -- both boundaries in both dims (the double
`&1` picks).

**D-S2-2 the point-update order is INNER-then-OUTER (the correctness site).** `update(r, c, value)`
writes the leaf cell, climbs the LEAF ROW's col-tree on column c's path, THEN climbs the ROW-tree:
at each row-ancestor `i` it FIRST recomputes the changed leaf column `_t[i*_w + (cols+c)] =
fold(_t[2i*_w + (cols+c)], _t[(2i+1)*_w + (cols+c)])` from its two row-children, THEN fixes that
row-node's col-tree up column c's path. Getting the order wrong (fixing the col-tree before the leaf
column is recomputed from the row-children, or skipping the row-child recombine) yields a silently
WRONG rectangle answer that only shows up when a query crosses the mutated cell AFTER the update --
which is why the differential fuzz queries AFTER interleaved updates, not only after build.

**D-S2-3 folds = min / max / sum / gcd, frozen at ctor as a small-int `_k`, COMMUTATIVE-ONLY.** The
fold is chosen once and cached; the hot body uses an INLINE switch on `_k` (no fn ref, no closure,
no megamorphic call site; `gcd` reuses the module `segGcd`). The iterative 2n layout is
ORDER-AGNOSTIC in BOTH dims -- `query` mixes left/right row and col contributions into one
accumulator -- so it is correct ONLY because min / max / sum / gcd are all COMMUTATIVE as well as
associative. A future NON-commutative fold (matrix product, string concat, affine) must NOT reuse
this layout; it needs a pow2 fixed-order layout with separate ordered accumulators. Identity fills
cleared / unused cells and is a legal RESULT (a cleared min grid queries `+Infinity`) but NEVER a
legal INPUT: the value door rejects user NaN / +-Infinity typeof-FIRST (Symbol/BigInt throw a native
TypeError before coercion), and the `gcd` kind additionally rejects negatives + non-integers.

**D-S2-4 the product-overflow door is a FLOAT multiply, never `| 0`.** The backing length is
`4 * rows * cols` (= `(2*rows) * (2*cols)`); `S2D_MAX_CELLS = 0x7FFFFFFF` (2^31 - 1) is the ceiling
so every flat index stays a valid `Float64Array` offset. The check `4 * rows * cols > S2D_MAX_CELLS`
is a FLOAT multiply (exact to 2^53), so a genuine overflow fails CLOSED with a `[lite-logn]`
RangeError. A `| 0` would wrap a large product to a small (possibly 0 / negative) int and PASS the
door -- fail OPEN -> under-allocation -> out-of-bounds writes. This is the exact Fenwick2D (0014)
lesson, applied to the 4x-larger 2D segment-tree footprint.

**D-S2-5 SPACE is the honest co-headline: 4*rows*cols cells (~4x Fenwick2D).** A 2D BIT stores
`(rows+1)*(cols+1)` ~ rows*cols cells; SegmentTree2D stores `4*rows*cols` -- roughly 4x. That is the
honest price for the GENERAL (non-invertible) rectangle folds a BIT cannot do. `build(matrix, kind)`
is O(rows*cols) TWO-PHASE: (1) seed every leaf, fold each LEAF ROW's col-tree deepest-first; (2)
fold the ROW-tree POSITION-WISE (each internal row-node's whole col-tree = combine of its two
row-children across all column nodes; the 2D fold is separable) -- NOT rows*cols individual O(log^2 n)
updates. The space tradeoff is disclosed in README, GUIDE, and llms.txt; reach for Fenwick2D when
the fold is a SUM (~1/4 the space), for SegmentTree2D when it is min / max / gcd.

## Witness

WORST-CASE member (a segment tree has no randomization / amortization), so there is deliberately NO
max-single-op disclosure line (the Fenwick2D / BinaryHeap precedent). Two gated lanes on the
`(log2 n)^2` axis, shared R^2 floor 0.958 (D-02), own bands = median-of-15 fit-runs * [0.6, 1.4] on
the calibration machine over exact power-of-two square sides 2^5..2^11:

- `SegmentTree2D.update`: MEDIAN slope 5.638 ns/level^2 (15 runs 5.608..5.656, R^2 0.9949..0.9954);
  band [3.38, 7.89]. Foil = a full 2D grid rebuild (O(n^2) per update) -- must miss the floor.
- `SegmentTree2D.query`: MEDIAN slope 5.105 ns/level^2 (15 runs 5.045..5.152, R^2 0.99993..0.99998);
  band [3.06, 7.15]. Foil = a naive rectangle scan (O(n^2) per query) -- must miss the floor.

Both lanes' single-fit R^2 clears the floor by a wide margin on EVERY calibration run, so NEITHER
needs the median-of-fits (`fitRuns`) hook the noisier lanes (PairingHeap / FibonacciHeap /
Fenwick2D.update / SegmentTree.update) use -- single-fit, rock-steady.

## Consequences

- Prior 12 classes stay BYTE-IDENTICAL; LogN.js changes are the VERSION line + one appended class.
- The `(log2 n)^2` witness axis now carries TWO members (Fenwick2D + SegmentTree2D); the axis hook
  is unchanged.
- The commutative-only constraint is a documented boundary; non-commutative 2D folds are deferred to
  a future pow2-layout member if ever wanted.
- The 4x space is the accepted, disclosed tradeoff for general rectangle folds.
