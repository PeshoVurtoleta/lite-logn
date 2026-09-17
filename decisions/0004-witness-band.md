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
