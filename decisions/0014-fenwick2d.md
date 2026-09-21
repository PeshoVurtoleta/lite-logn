# 0014 -- Fenwick2D: the 2D Binary Indexed Tree, O(log^2 n) point-update + rectangle-sum (D-F2-1..D-F2-4)

- Status: ACCEPTED
- Severity: S1 (the family's FIRST 2D / multi-dimensional member and its FIRST squared-log
  witness axis; picks the flat SoA layout, the product-overflow door, the two-pass linear
  build, the rectSum inclusion-exclusion base case, and the (log2 n)^2 witness axis + its bands)
- Date: 2026-09-21
- Session: Fenwick2D (v0.12.0)

## Context

Fenwick2D is the twelfth member and the family's FIRST multi-dimensional structure. The 1D
Fenwick (0002-era member, v0.2.0) answers "how can point-update AND prefix-sum both be
O(log n) on a flat array?" via the lowest-set-bit walk (`i & -i`). Fenwick2D lifts that idea
to a rectangle: a 2D Binary Indexed Tree that answers point-update AND 2D-prefix (and therefore
arbitrary axis-aligned RECTANGLE sums via inclusion-exclusion) in O(log rows * log cols) =
O(log^2 n) for a square grid of side n. It is the same INDEX-ADDRESSED, SUM-ONLY family as the
1D Fenwick -- not a keyed / ordered structure -- and the same honest boundary applies: a Fenwick
inverts addition (subtraction) to answer a range from two prefixes, so it is SUM-ONLY. 2D
min / max / gcd need a future 2D SegmentTree, not a BIT.

This is also the family's FIRST member whose gated witness op is NOT O(log n) but O(log^2 n).
That forced the ONE cross-cutting harness change of the session: a per-lane `xOf` axis hook so
this lane can fit against `(log2 n)^2` while every prior lane keeps the default `xOf = log2` and
stays byte-identical.

## Decision

**D-F2-1 layout = a flat `Float64Array((rows+1)*(cols+1))`, 1-based on BOTH dims, nested
`i & -i`.** One contiguous typed array holds an `(rows+1) x (cols+1)` grid in row-major order
with a row stride `_w = cols + 1`; row 0 and col 0 are the unused identity sentinels (null is
not zero -- they are never read as data). `update` climbs BOTH dims by the lowest set bit (an
outer `i += i & -i` over rows, an inner `j += j & -j` over cols, one `_t` touch per (i, j) level
pair); `_pfx` descends both dims by `i -= i & -i`. Public coords are 0-based in
[0, rows) x [0, cols); internally 1-based. No pointers, no per-op allocation -- the whole cost is
the O(log rows * log cols) nested walk. Fields: `_r` / `_c` (frozen dims), `_w` (row stride),
`_t` (the flat backing array).

**D-F2-2 the product-overflow door is a FLOAT multiply, never `| 0`.** The backing length is
`(rows + 1) * (cols + 1)`; `F2D_MAX_CELLS = 0x7FFFFFFF` (2^31 - 1) is the ceiling (a single typed
array's max index domain). The guard computes the product as a JS FLOAT (exact to 2^53) and
throws when it exceeds the ceiling -- it MUST NOT use `| 0`, which would wrap a large product to
a small or negative int32 and PASS (fail OPEN), handing back a degenerate zero-cell tree. The
adversarial witness is `rows+1 = cols+1 = 65536`: the true product is 2^32, which is
`> 2^31-1` (throws, correct), but `(2**32) | 0 === 0`, which is NOT `> 2^31-1` (would pass). The
boundary suite pins exactly this case so a future refactor to `| 0` fails the gate.

**D-F2-3 surface + the O(rows*cols) two-pass LINEAR build + the rectSum base case.** Surface:
`new Fenwick2D(rows, cols)` (dims frozen at ctor), `rows` / `cols` getters, `update(r, c, delta)`,
`prefix(r, c)` (rectangle [0..r, 0..c] INCLUSIVE), `rectSum(r1, c1, r2, c2)` (all four edges
INCLUSIVE), `at(r, c)`, `set(r, c, value)` (ABSOLUTE, via `update(r, c, value - at(r, c))`
inlined), `clear()`, `forEach(fn)` (row-major (value, r, c, self)), and the static
`Fenwick2D.build(matrix)`.
  - **`build` is O(rows*cols) LINEAR, in TWO SEPARATE passes.** Seed every cell with its own
    value, then propagate FIRST along the columns within each row (each row a 1D linear Fenwick
    build), THEN along the rows -- each pass a 1D linear build lifted to its dimension. The two
    passes MUST stay separate: fusing them into one nested loop DOUBLE-COUNTS (a cell reached by
    both a row-parent and a col-parent hop gets its contribution added twice). The behavioral
    suite proves `build(matrix)` equals the same cells inserted by repeated `update` -- the
    non-double-count witness.
  - **rectSum = 2D inclusion-exclusion `P(r2,c2) - P(r1-1,c2) - P(r2,c1-1) + P(r1-1,c1-1)`.** The
    four nested descents are INLINED (no `_pfx` call, no intermediate object). The base case is
    the clean part: when `r1 == 0` the `P(r1-1, .)` terms are 0 by a `k = 0` loop-skip (the descent
    loop starts at `i = r1 = 0` and never enters), and likewise `c1 == 0` -- never a `prefix(-1)`
    call, never a `_t[-1]` read. `prefix` itself admits `r == -1` / `c == -1` as the empty-prefix
    base case (0 by the same loop-skip), the valid domain being [-1, rows) x [-1, cols).

**D-F2-4 witness = the family's FIRST SQUARED-log axis; SUM-ONLY worst-case member (no
max-single-op line).** Fenwick2D's ops are O(log^2 n), not O(log n), so its witness lane fits
`nsPerOp = intercept + slope * (log2 n)^2` via a per-lane `xOf` hook added to BOTH the
`test/witness.mjs` fit site AND `benchmark/Dimensions.mjs` (default `xOf = Math.log2` keeps every
prior lane's fit BYTE-IDENTICAL). Two ops are gated, both on the squared-log axis over EXACT
power-of-two SQUARE SIDES 2^5..2^11:
  - `update`: slope band `[2.13, 4.96]` ns per (log2 n)^2 unit (median-of-`F2D_FIT_RUNS`
    sweep-fits, median 3.542 x `[0.6, 1.4]`).
  - `rectSum`: slope band `[2.90, 6.77]` (median 4.832 x `[0.6, 1.4]`).
  Both inherit the FROZEN family R^2 floor 0.958 (`BINARYHEAP_R2_FLOOR`, UNCHANGED). The `update`
  lane gates on the MEDIAN of `F2D_FIT_RUNS` independent sweep-fits (the same robust-estimator
  discipline as Pairing/Fibonacci -- measurement-quality only; the frozen floor + bands untouched).
  Each op has an O(n^2)-per-op FOIL (a dense rectangle rescan) that leaves the squared-log line.
  Fenwick2D is a WORST-CASE member (every op is worst-case O(log^2 n), deterministic, no RNG), so
  there is NO max-single-op disclosure line -- the same posture as the 1D Fenwick, SegmentTree,
  MinMaxHeap, and BinomialHeap.

  **SUM-ONLY, the NOT-FOR boundary.** Like the 1D Fenwick, rectSum works ONLY because subtraction
  inverts addition; there is deliberately NO 2D min / max / gcd, and NO `changeKey` / `rank` /
  `select` (it is index-addressed, not keyed). 2D min / max / gcd range queries need a future 2D
  SegmentTree, not a BIT.

## Alternatives rejected

- **`| 0` on the cell-product guard** -- wraps a >2^31 product to a small / negative int32 and
  passes (fail OPEN, a degenerate tree); rejected for the exact float multiply (D-F2-2).
- **A fused single-pass build** -- reads clean but DOUBLE-COUNTS every cell reachable by both a
  row-hop and a col-hop parent; rejected for the two SEPARATE 1D-build passes (D-F2-3).
- **Admitting 2D min / max / gcd on Fenwick2D** -- a BIT has no inverse for min / max, so a
  rectangle min cannot be answered by prefix subtraction; rejected as dishonest, routed to a
  future 2D SegmentTree (D-F2-4).
- **A shared `xOf = log2` witness axis for this lane** -- would fit an O(log^2 n) op against a
  linear-log axis and either fail R^2 or mis-calibrate the slope; rejected for the per-lane
  squared-log `xOf` hook (D-F2-4), which leaves every prior lane's fit byte-identical.

## Consequences

- `LogN.js` gains `F2D_MAX_CELLS` + the `Fenwick2D` class, appended after FibonacciHeap; the prior
  ELEVEN classes stay BYTE-IDENTICAL (only the `VERSION` const changes above the append point).
  The witness / benchmark fit harness gains a per-lane `xOf` hook (default `Math.log2`, so no prior
  lane moves), and Fenwick2D registers `xOf = (x) => Math.log2(x) ** 2` -- the family's FIRST
  squared-log axis. Zero-GC proven by `node --expose-gc test/torture.mjs` (0 B/op on the update /
  prefix / rectSum / at / set lanes, gc major = 0, the control lane still has teeth,
  conservation / leak clean); `npm run test:perf` clean (`grows === 0` on the F2D lanes);
  `npm run witness` shows update + rectSum ON the squared-log line while both O(n^2) foils leave it,
  and the prior eleven members stay ON-LINE / unchanged.
