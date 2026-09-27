# 0004 -- Per-member witness slope band (D-08)

- Status: ACCEPTED
- Severity: S2 (governs every member's witness gate, family-wide)
- Date: 2026-09-17
- Session: Fenwick (v0.2.0)

## Context

D-02 (calibrated in the BinaryHeap session, recorded in `test/witness.mjs`) froze
two things from the family CALIBRATOR:

- `BINARYHEAP_R2_FLOOR = 0.958` -- the SHAPE test: does `nsPerOp = intercept +
  slope * log2(n)` fit a straight line? A non-log shape (an O(n) foil, a flat
  O(1) member near slope 0) misses this floor.
- `BINARYHEAP_SLOPE_BAND = [5.76, 13.44]` ns/level -- the per-level cost of
  BinaryHeap POP, centered on the MEDIAN slope over N=15 fit runs (9.60) times
  `[0.6, 1.4]`.

The second member, Fenwick, ships TWO hot ops (`update`, `prefix`), each a single
`i & -i` walk that touches ONE cell per level. A single `_t[k] += delta` per level
is strictly less work than a heap sift's compare-plus-two-writes per level, so
Fenwick's honest per-level cost (its slope) is LOWER than pop's. If Fenwick were
gated against BinaryHeap's `[5.76, 13.44]` band it would FALSE-FAIL for being
faster than the calibrator -- which is exactly backwards. The question: is the
D-02 slope band a family constant, or a per-member declaration?

## Decision

**The `R^2` floor is FROZEN family-wide; the slope band is PER-MEMBER, calibrated
per op by the same procedure BinaryHeap used.**

- `BINARYHEAP_R2_FLOOR = 0.958` stays the SHARED floor. Every member's every
  gated op is checked `fit.r2 >= 0.958` and every foil `ffit.r2 < 0.958`. This is
  the shape test and it does not move.
- Each member declares its OWN slope band per op: run the fit N=15 times, take
  the MEDIAN slope, band = `median * [0.6, 1.4]` -- the identical procedure that
  produced BinaryHeap's `[5.76, 13.44]`. Fenwick adds
  `FENWICK_UPDATE_SLOPE_LO/HI` and `FENWICK_PREFIX_SLOPE_LO/HI` next to the frozen
  BinaryHeap constants.

This is NOT widening the family gate. Widening would be RAISING BinaryHeap's own
band, or LOWERING the shared R^2 floor, to paper over a regression -- neither
happens. A per-member band is each member declaring its honest per-level cost; a
member cannot pass by being arbitrarily slow (its band is centered on its OWN
median, so a regression that doubles the slope leaves the band) nor by being
suspiciously flat (a too-flat O(1)-looking member sits near slope 0, below any
honest log member's `median * 0.6`, and the R^2 floor independently rejects the
non-log shape). The floor keeps the teeth; the band stays honest per member.

## Consequences

- `test/witness.mjs` keeps `BINARYHEAP_R2_FLOOR = 0.958` as the one shared floor
  and gains per-member slope constants. Every MEMBERS entry carries
  `r2Floor: 0.958` (shared) and its OWN `slopeLo` / `slopeHi`.
- Fenwick's two entries (`update`, `prefix`) each use the shared floor and a band
  calibrated from this machine's measured runs (recorded inline with the median).
- Every later member (SegmentTree, SkipList, ...) follows this same rule: inherit
  the R^2 floor, calibrate its own slope band, record the median it centered on.
- The witness stays a proof tool, never a hot-path dependency; the bands are
  measured offline and pinned, never retuned to rescue a failing run -- a budget
  that moves is not a gate.

## Alternatives rejected

- **One family-wide slope band (BinaryHeap's).** Rejected: it false-fails any
  member whose honest per-level cost differs from pop's -- Fenwick's single-cell
  touch is legitimately faster and would be rejected for being too fast.
- **Drop the slope band, gate on R^2 alone.** Rejected: the R^2 floor accepts any
  straight line regardless of steepness; the slope band is the per-level-cost
  honesty hook (a member that regressed to 3x its per-level cost still fits a
  straight line and would pass on R^2 alone). Keep both, per member.

## Amendment 2026-09-27 (v1.4.0 H1 -- four bands re-centered by their fix, median-of-7)

The 8.1 witness-band risk materialized as predicted: F4 (remove the tagged `segGcd`
phi), the iterative `PersistentSegTree._query`, and the S1 magnitude-budget round-trip
in Fenwick2D.update each changed a hot body, so four per-level SLOPES moved off their
1.3.0 bands. Re-centered per the rule above -- **median-of-7 warm SOLO runs x [0.6, 1.4]**,
each run alone with no other gate load; every run's slope is recorded below. Each move is
EXPLAINED by a fix (an expected band move, not a regression):

- **SegmentTree.update** (F4 per-kind store; pure double add, no ternary phi):
  3.83 -> median 0.715 ns/level; runs 0.522 / 0.725 / 0.718 / 0.737 / 0.539 / 0.715 / 0.636.
  Band [0.43, 1.00].
- **SegmentTree2D.update** (F4 store-per-branch on the leaf-col and row-tree climbs):
  5.638 -> median 2.548 ns/level^2; runs 2.446 / 2.539 / 2.565 / 2.548 / 2.557 / 2.485 / 2.578.
  Band [1.53, 3.57].
- **PersistentSegTree.query** (F4 per-kind accumulator + iterative `_query`, no recursive
  double return): 39.25 -> median 15.879 ns/level; runs 14.806 / 15.468 / 15.879 / 16.487 /
  15.825 / 16.177 / 15.963. Band [9.53, 22.23].
- **Fenwick2D.update** (S1: the delta is round-tripped through a `_mag` scratch slot to
  unbox it): 3.542 -> median 3.297 ns/level^2; runs 1.925 / 3.275 / 3.297 / 3.316 / 2.027 /
  3.363 / 3.366. Band [1.98, 4.62]. NOTE: this lane is BIMODAL -- 5/7 runs cluster at ~3.3
  and 2/7 at ~1.9-2.0 (a JIT-tier artifact of the added memory op), so a single run can land
  near the 0.6 floor. Median-of-7 centers on the dominant mode; a median-of-15 (or wiring the
  lane into the internal median-of-fits) is recommended at release to damp the residual flake.

Lanes checked and left UNCHANGED (median-of-7 stays inside the 1.3.0 band):
- **Fenwick.update** (S1 round-trip): median 2.818 ns/level; runs 2.744 / 2.816 / 2.753 /
  2.901 / 2.934 / 2.818 / 2.829 -- all inside [1.84, 4.30]. Confirmed, not re-centered.
- **BinaryHeap.pop** (F15 slot sift + S5 version stamp): median 9.748 ns/level; runs
  9.237 / 9.809 / 9.243 / 10.102 / 10.446 / 9.467 / 9.748 -- all inside [5.76, 13.44].
  Confirmed, not re-centered.

The R^2 floor (0.958) is untouched.

**Amendment, 2026-09-28 (1.4.0 final witness, solo runs).** Two more changes landed:
- `prefix()` now sums its cells HIGH -> LOW, so that `Fenwick.search` is an exact lower_bound over
  `prefix()`.
- All runs below use `npm run witness` with its default flags (`node test/witness.mjs`, no
  `--no-concurrent-recompilation`). A round-3 note said that flag had been added to the script. It
  had not, and these bands are calibrated without it.

Seven solo runs:
- **Fenwick.prefix** got about 3x cheaper per level: 2.93 -> median 0.875 ns/level; runs 0.875 /
  0.876 / 0.831 / 0.814 / 0.877 / 0.896 / 0.834. R^2 IMPROVED to 0.983-0.993 (it had been
  borderline at 0.955-0.967). Re-centered by the rule to band [0.53, 1.23].
- **SegmentTree.update** (more work per sample: 1e6 iterations, sweep 2^10..2^18, 9 fits): ON in
  7/7 runs, R^2 0.967-0.983, slope 0.647-0.731, inside [0.43, 1.00].
- **CartesianTree.rangeMinIndex** is untouched by 1.4.0, but went OFF once in 7 runs, at R^2 0.9577
  (0.0003 under the floor; the other 6 runs were 0.9717-0.9854). This is a known near-floor lane.
  The floor is not loosened. The planned fix is more work per sample, as SegmentTree.update got;
  it is tracked for 1.4.1.
- Every other lane was ON in all 7 runs.
- **Fenwick2D.update is BIMODAL, and one median cannot describe it.** Over 15 solo runs (7 in the
  median-of-7 set above plus 8 here: 3.395 / 3.289 / 3.491 / 2.046 / 3.277 / 3.434 / 3.286 /
  1.978) it shows two stable modes, both clean O(log^2 n) fits with R^2 > 0.99: a HIGH mode at
  ~3.3 (about 3/4 of runs) and a LOW mode at ~1.99 (about 1/4). They are a V8 compile-mode split
  on the added S1 compare, not a correctness issue. They persist under the witness's default flags
  (whether `--no-concurrent-recompilation` would remove them is untested).
  A single-median band puts its floor (1.98) inside the low mode, so `verify` would fail about 1
  run in 8.
  DECISION (maintainer-delegated): for this documented bimodal lane ONLY, the band is
  [0.6 x low-mode median, 1.4 x high-mode median] = [1.19, 4.62]. The rule's [0.6, 1.4] factors
  are kept and applied to each mode's median. The R^2 floor and the O(n^2) foil check are
  untouched, so an O(n) or O(n^2) regression (foil slopes in the thousands) is still caught.
  Revisit if the S1 compare is restructured.
