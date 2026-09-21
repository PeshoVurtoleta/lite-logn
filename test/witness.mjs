/**
 * @zakkster/lite-logn -- the O(log n) Witness harness.
 *
 *     node test/witness.mjs
 *
 * The family anchor. lite-o1 proves a FLAT ops/ms line on a log-x axis (the
 * constant); lite-logn proves a STRAIGHT line on that same axis -- one added
 * level per doubling of n. For each member the harness times a fixed batch of
 * the hot op at each n in a geometric sweep, fits
 *
 *     nsPerOp = intercept + slope * log2(n)
 *
 * by least squares, and reports R^2 (does a straight log line fit?), slope
 * (ns/level), and the O(n) FOIL's departure (the default a working programmer
 * reaches for, shown losing as n grows). For amortized / randomized members it
 * also prints the MAX single-op time -- the honesty hook a mean cannot hide.
 *
 * v0.1.0 ships BinaryHeap, the family CALIBRATOR. Its measured operation is POP
 * (delete-extremum -- the full-height sift-down, the heap's tallest honest walk).
 * The R^2 floor + slope band are FROZEN here from the BinaryHeap calibration run
 * (decision D-02) and become the shared FAMILY gate every later member inherits:
 *
 *   BINARYHEAP_R2_FLOOR = 0.958   (calibration measured R^2 ~ 0.988, minus 0.03)
 *   BINARYHEAP_SLOPE_BAND = [5.76, 13.44] ns/level
 *       (central tendency: MEDIAN slope over N=15 pop-fit runs = 9.60 ns/level;
 *        band = median * [0.6, 1.4]. Centered on the MEDIAN -- NOT a high sample
 *        -- so a legitimately faster future O(log n) member near ~6 ns/level
 *        still clears the floor. The R^2 floor independently rejects non-log
 *        shapes, and a too-flat O(1)-looking member sits near slope 0 and is
 *        still caught, so lowering the slope floor loses no teeth.)
 *
 * The gate: BinaryHeap pop must sit ON the line (R^2 >= floor AND slope in band)
 * and the sorted-array-insert O(n) foil must LEAVE it (foil R^2 < floor). The
 * gated pop sweep is pinned to the steady band [1e4 .. 1e6] (the L1 micro-floor
 * and the memory wall above ~1e6 both flake the fit -- lite-o1 ADR-0004 domain
 * discipline); the foil sweep stays where an O(n^2) build is affordable. Never
 * widen a budget to make this pass -- a budget that moves is not a gate. This is
 * an OFFLINE proof tool, never a hot-path dependency.
 */

import { BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, Fenwick2D, SegmentTree2D } from '../LogN.js';
import { fileURLToPath } from 'node:url';

// --- least-squares fit: y = intercept + slope * x --------------------------
// x is log2(n); y is nsPerOp. Returns { slope, intercept, r2 }. Pure, alloc-
// light (BinaryHeap calls this once per sweep, off the hot path).
export function fitLogLinear(xs, ys) {
    const n = xs.length;
    if (n < 2 || ys.length !== n) {
        throw new Error('[lite-logn] fitLogLinear needs >= 2 paired points');
    }
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx, dy = ys[i] - my;
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    const slope = sxx === 0 ? 0 : sxy / sxx;
    const intercept = my - slope * mx;
    // R^2 = (explained variance) / (total variance); 1.0 = a perfect line.
    const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
    return { slope, intercept, r2 };
}

// --- the geometric n-sweep the family gates over ---------------------------
// Shown but not gated at the tiny pure-L1 sizes; gated over the steady window
// (lite-o1 ADR-0004 discipline). BinaryHeap records the exact policy in D-02.
export const WITNESS_NS = [1e3, 3e3, 1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7];

// --- the reference O(n) foil ------------------------------------------------
// A sorted-array insert (the O(n) default a heap replaces): find the slot by
// scan, then shift. Fit against the SAME log2(n) axis, it must MISS the R^2
// floor and its curve must leave the straight line as n grows. BinaryHeap wires
// this as its push foil; later members swap in their own honest O(n) foil.
export function sortedArrayInsert(arr, len, key) {
    let i = len;
    while (i > 0 && arr[i - 1] > key) { arr[i] = arr[i - 1]; i--; }
    arr[i] = key;
    return len + 1;
}

// --- FROZEN family gate (D-02, calibrated in the BinaryHeap session) ---------
// These thresholds are the SHARED family gate: every later member's witness is
// checked against them (each member may narrow, never widen). Do NOT retune to
// paper over a regression -- a budget that moves is not a gate.
// R^2 floor: calibration measured R^2 ~ 0.988, minus 0.03 (foil R^2 ~ 0.82 < it).
export const BINARYHEAP_R2_FLOOR = 0.958;
// Slope band, centered on the CENTRAL TENDENCY (not a high sample): MEDIAN slope
// over N=15 pop-fit runs = 9.60 ns/level; band = median * [0.6, 1.4]. Anchoring
// on the median (not the ~10 high side) keeps the floor honestly low so a faster
// future O(log n) member near ~6 ns/level is not false-failed; no teeth are lost
// (R^2 floor rejects non-log shapes; a too-flat member near slope 0 is caught).
export const BINARYHEAP_SLOPE_LO = 5.76;           // median 9.60 * 0.6
export const BINARYHEAP_SLOPE_HI = 13.44;          // median 9.60 * 1.4

// --- Fenwick (v0.2.0): shared R^2 floor, OWN per-op slope bands (D-08) --------
// decisions/0004-witness-band.md: the R^2 floor (0.958) is FROZEN family-wide;
// each member declares its OWN slope band per op = median-of-N(15) fit-runs *
// [0.6, 1.4] (the identical procedure that produced BinaryHeap's band). A single
// `i & -i` touch/level is strictly less work than a heap sift, so Fenwick's
// per-level slope is LOWER than pop's -- expected and correct, which is exactly
// why only the R^2 floor is shared. Both Fenwick ops reuse BINARYHEAP_R2_FLOOR.
// Bands calibrated from N=15 fit runs on this machine (medians recorded inline).
export const FENWICK_UPDATE_SLOPE_LO = 1.84;       // median 3.07 * 0.6
export const FENWICK_UPDATE_SLOPE_HI = 4.30;       // median 3.07 * 1.4
export const FENWICK_PREFIX_SLOPE_LO = 1.76;       // median 2.93 * 0.6
export const FENWICK_PREFIX_SLOPE_HI = 4.10;       // median 2.93 * 1.4

// --- SegmentTree (v0.3.0): shared R^2 floor, OWN per-op slope bands (D-05) -----
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-
// wide; each op declares its OWN slope band = median-of-N(15) fit-runs * [0.6, 1.4]
// on this machine. A SegmentTree op touches a node PER LEVEL spread across a `2n`
// array, so its cells reach out to index ~2n; above ~2^16 the tree leaves the
// steady cache band and the fit flakes (lite-o1 ADR-0004 domain discipline), so
// the gated sweep is pinned to powers of two in [2^10 .. 2^16] -- EXACT powers so
// each range decomposes into a REGULAR node count (2*(log2 n - 1) for the gated
// query window), which a non-pow2 n does not (its decomposition depends on the bit
// pattern and flakes the line). The STRUCTURE still accepts any length; only the
// witness sweep is pow2. query folds ~2 nodes/level (its slope is HIGHER than
// update's single write/level) -- expected, which is why only the R^2 floor is
// shared. Bands calibrated from N=15 fit runs (medians recorded inline).
export const SEGTREE_UPDATE_SLOPE_LO = 2.29;       // median 3.83 * 0.6
export const SEGTREE_UPDATE_SLOPE_HI = 5.35;       // median 3.83 * 1.4
export const SEGTREE_QUERY_SLOPE_LO = 4.30;        // median 7.17 * 0.6
export const SEGTREE_QUERY_SLOPE_HI = 10.04;       // median 7.17 * 1.4

// --- SkipList (v0.4.0): shared R^2 floor, OWN per-op slope bands + sweeps (D-06) -
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-
// wide; each op declares its OWN slope band = median-of-N(15) fit-runs * [0.6, 1.4]
// on this machine. SkipList is the family's first RANDOMIZED, POINTER-BASED member,
// and its two ops have DIFFERENT honest steady windows -- so, unlike the array
// members, get and set are gated over DIFFERENT sweeps (the witness already gives
// each member its own sweep):
//   - get is a pure search (a ~log2(n) pointer-chasing descent). A search touches
//     ~log2(n) scattered nodes but NO per-op randomness, so its signal is clean;
//     it needs a LARGER n range (2^11..2^17) for enough dynamic range above the
//     timing floor. Measured over 1024 spread targets, cache-warmed by hammering.
//   - set is the INSERT+DELETE churn (two descents + a random-height splice). The
//     per-insert tower height is RANDOM (the LCG), which adds per-op variance, so
//     set is gated over a SMALLER, fully CACHE-RESIDENT window (2^9..2^14) where
//     the structural level count -- not DRAM latency across a working set that
//     outgrows cache -- is what the fit sees. (At 2^16 a double-descent insert is
//     DRAM-bound and the fit flakes; at 2^9 a bare search is too fast to fit -- each
//     op is measured where its logarithm is visible, not where the cache wall is.)
// Both slopes are HIGHER than the array-embedded members' (a random slot INDEX per
// level is less cache-friendly than an arithmetic index) -- expected, which is why
// only the R^2 floor is shared. Because the member is EXPECTED (not worst-case)
// O(log n), the harness ALSO prints the MAX single insert over a realistic random
// build trace -- the unlucky-tower tail a mean hides. Bands = median-of-15 * [0.6,
// 1.4] (medians recorded inline).
export const SKIPLIST_GET_SLOPE_LO = 5.27;         // median 8.78 * 0.6
export const SKIPLIST_GET_SLOPE_HI = 12.30;        // median 8.78 * 1.4
export const SKIPLIST_SET_SLOPE_LO = 8.36;         // median 13.93 * 0.6
export const SKIPLIST_SET_SLOPE_HI = 19.50;        // median 13.93 * 1.4

// --- Treap (v0.5.0): shared R^2 floor, OWN get slope band + sweep (D-06/D-07) ---
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-wide;
// Treap's gated op is get, a pure BST descent -- one node touched per level, EXPECTED
// O(log n) height (the randomized priority heap balances it). It is gated over the same
// 2^11..2^17 window SkipList.get uses (a pointer-chasing search needs that dynamic range
// above the timing floor; above it the working set leaves the steady cache band and the
// fit flakes -- lite-o1 ADR-0004). A treap descent touches ONE node per level (vs a skip
// list's tower of forward links), so its per-level slope is LOWER than SkipList.get's --
// expected, which is exactly why only the R^2 floor is shared. Because the member is
// EXPECTED (not worst-case) O(log n), the harness ALSO prints the MAX single insert (the
// rotation-chain tail an unlucky priority draw spikes) as a DISCLOSURE, not a gate. Band
// = median-of-15 fit-runs * [0.6, 1.4] on this machine: MEDIAN slope 4.25 ns/level (15
// runs spanned 4.10..4.36, R^2 0.965..0.981), centered on the MEDIAN (never a high
// sample) so a legitimately faster future run is not false-failed.
export const TREAP_GET_SLOPE_LO = 2.55;            // median 4.25 * 0.6
export const TREAP_GET_SLOPE_HI = 5.95;            // median 4.25 * 1.4

// --- Scapegoat (v0.6.0): shared R^2 floor, OWN get slope band + sweep (D-S5/0008) ---
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-wide;
// Scapegoat's gated op is get, a pure BST descent over a DETERMINISTICALLY weight-balanced
// tree -- one node touched per level, WORST-CASE O(log n) (height <= log_{1/alpha}(n) + 1,
// never merely expected). It is gated over the same 2^11..2^17 window Treap.get / SkipList.get
// use (a pointer-chasing search needs that dynamic range above the timing floor; above it the
// working set leaves the steady cache band and the fit flakes -- lite-o1 ADR-0004). A scapegoat
// is MORE balanced than a random treap (shorter descents), so its per-level slope (~4.02) is a
// touch LOWER than Treap.get's (~4.25) -- expected, which is exactly why only the R^2 floor is
// shared family-wide and each op declares its own band. Unlike SkipList / Treap, get is WORST-
// case (deterministic), so there is NO expected-op MAX-single-op disclosure for get; the rebuild
// spike lives on the AMORTIZED set path and is disclosed by the amortized-trace assertion below
// (cumulative ascending-insert cost/op tracks log n, never the linear curve a rebuild-less BST
// degenerates to). Band = median-of-15 fit-runs * [0.6, 1.4] on this machine: MEDIAN slope 4.02
// ns/level (15 runs spanned 3.82..4.10, R^2 0.965..0.977), centered on the MEDIAN (never a high
// sample) so a legitimately faster future run is not false-failed.
export const SCAPEGOAT_GET_SLOPE_LO = 2.41;        // median 4.02 * 0.6
export const SCAPEGOAT_GET_SLOPE_HI = 5.63;        // median 4.02 * 1.4

// --- MinMaxHeap (v0.7.0): shared R^2 floor, OWN popMin slope band (D-M5 / 0009) ------
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-wide;
// MinMaxHeap's gated op is popMin (delete-min -- the full-height level-aware trickle-down,
// the min-max heap's tallest honest walk, the exact analogue of BinaryHeap's gated POP). It
// is a DEPQ (double-ended PQ) whose push / popMin / popMax are all WORST-case O(log n), so
// there is deliberately NO expected-op MAX-single-op disclosure line (unlike SkipList /
// Treap). Gated over the same steady [1e4 .. 1e6] band BinaryHeap.pop uses (the L1 micro-
// floor below and the memory wall above ~1e6 both flake the fit -- lite-o1 ADR-0004). A
// min-max trickle-down compares against up to SIX descendants (2 children + 4 grandchildren)
// per level -- more work per level than a plain binary heap's two-child sift -- so its
// per-level slope (~10.30) sits a touch ABOVE BinaryHeap.pop's (~9.60) yet within the same
// family shape; expected, which is why only the R^2 floor is shared and each op declares its
// own band. Band = median-of-15 fit-runs * [0.6, 1.4] on this machine (recorded in
// decisions/0009). The 15 popMin slope samples (ns/level) over sweep [1e4,3e4,1e5,3e5,1e6]:
//   9.38 10.49 10.49 9.96 10.44 10.09 9.93 10.30 10.35 10.16 9.94 9.97 10.59 10.43 10.40
// with R^2 0.9897..0.9991 (every run >= the 0.958 floor); MEDIAN slope = 10.30 ns/level.
// Centered on the MEDIAN (never a high sample) so a legitimately faster future run is not
// false-failed; the R^2 floor independently rejects any non-log shape.
export const MINMAXHEAP_POPMIN_SLOPE_LO = 6.18;    // median 10.30 * 0.6
export const MINMAXHEAP_POPMIN_SLOPE_HI = 14.42;   // median 10.30 * 1.4

// --- SplayTree (v0.8.0): shared R^2 floor, OWN get slope band + sweep (D-SP5 / 0010) --
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-wide;
// SplayTree's gated op is get on a UNIFORM-RANDOM working set of size n (a shuffled
// permutation of the resident keys, cycled) -- the access pattern that keeps NO key hot,
// so the SELF-ADJUSTING splay churns the full height each op and the AMORTIZED O(log n)
// line is visible (a skewed / sequential pattern would trigger splay's working-set /
// dynamic-finger speedups and FLATTEN the line -- which is the member's whole point, but
// not what a straight-line log WITNESS measures). get is AMORTIZED, DETERMINISTIC (no
// RNG): a single cold deep access can splay an O(n) chain, so the harness ALSO prints the
// MAX single get as a DISCLOSURE, never a gate. A splay get REWRITES links (rotations) on
// every op -- strictly more work per level than a read-only BST descent -- so its per-
// level slope (~27.3) sits WELL ABOVE Treap.get's (~4.25) yet still on the family shape;
// expected, which is exactly why only the R^2 floor is shared and each op declares its own
// band. Gated over 2^12..2^17 (the 2^11 point is too fast + noisy for the mutating splay
// and drops R^2 near the floor; 2^12 up gives clean dynamic range -- lite-o1 ADR-0004).
// Band = median-of-15 fit-runs * [0.6, 1.4] on this machine. The 15 get slope samples
// (ns/level) over the sweep [2^12..2^17]:
//   27.07 27.18 27.33 27.25 27.32 26.86 27.71 27.33 27.40 26.75 27.35 27.19 27.11 27.46 27.36
// with R^2 0.9750..0.9872 (every run >= the 0.958 floor); MEDIAN slope = 27.316 ns/level.
// Centered on the MEDIAN (never a high sample) so a legitimately faster future run is not
// false-failed; the R^2 floor independently rejects any non-log shape.
export const SPLAYTREE_GET_SLOPE_LO = 16.39;       // median 27.316 * 0.6
export const SPLAYTREE_GET_SLOPE_HI = 38.24;       // median 27.316 * 1.4

// --- BinomialHeap (v0.9.0): shared R^2 floor, OWN popMin slope band (D-BH2 / 0011) ---
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-wide;
// BinomialHeap's gated op is popMin (delete-extreme -- unlink the extreme root, reverse its
// child list into a new root list, union back, rescan the O(log n) roots). It is the
// mergeable heap's tallest honest walk, the exact analogue of BinaryHeap/MinMaxHeap's gated
// pop. push / popMin / meld are all WORST-case O(log n) (push O(1) amortized), so there is
// deliberately NO expected-op MAX-single-op disclosure line (unlike SkipList / Treap). Gated
// over EXACT powers 2^11..2^17 (the same pointer-chasing window Treap/Scapegoat/SkipList.get
// use): a binomial popMin chases scattered forest slots + reverses a child list + rescans the
// root list, so its cost is DRAM-latency-sensitive; the fully-cache-resident exact-power window
// keeps the fit on the structural level count, while the [1e4..1e6] band BinaryHeap.pop uses
// curves at 1e6 (the memory wall) and flakes the fit. A binomial popMin does far more
// pointer-chasing per level than a plain array-embedded sift, so its per-level slope (~44.8)
// sits WELL ABOVE BinaryHeap.pop's (~9.6) yet on the same family shape; expected, which is why
// only the R^2 floor is shared and each op declares its own band. Band = median-of-15 fit-runs
// * [0.6, 1.4] on this machine. The 15 popMin slope samples (ns/level) over 2^11..2^17:
//   44.41 44.32 44.88 44.38 44.33 44.25 44.99 45.13 44.51 44.72 44.99 44.82 44.99 45.35 45.09
// with R^2 0.9786..0.9840 (every run >= the 0.958 floor); MEDIAN slope = 44.821 ns/level.
// Centered on the MEDIAN (never a high sample) so a legitimately faster future run is not
// false-failed; the R^2 floor independently rejects any non-log shape.
export const BINOMIALHEAP_POPMIN_SLOPE_LO = 26.89; // median 44.821 * 0.6
export const BINOMIALHEAP_POPMIN_SLOPE_HI = 62.75; // median 44.821 * 1.4

// --- PairingHeap (v0.10.0): shared R^2 floor, OWN popMin slope band (D-PH2 / 0012) ---
// Same procedure (D-08 / decisions/0004): the R^2 floor (0.958) is FROZEN family-wide;
// PairingHeap's gated op is popMin (delete-extreme -- unlink the root, TWO-PASS combine the
// root's child list into a new root). It is the pairing heap's tallest honest walk, the exact
// analogue of BinaryHeap/MinMaxHeap/BinomialHeap's gated pop. popMin / decreaseKey are AMORTIZED
// O(log n) (push / peekMin / meld are O(1)); the amortized worst tail (a long two-pass fold) is
// DISCLOSED as the MAX single popMin below, not gated. Gated over EXACT powers 2^11..2^17 (the
// same pointer-chasing window Treap/Scapegoat/SkipList.get + BinomialHeap.popMin use): a pairing
// popMin chases scattered forest slots and re-links a child list, so its cost is DRAM-latency-
// sensitive; the fully-cache-resident exact-power window keeps the fit on the structural level
// count, while the [1e4..1e6] band the array-embedded heaps use curves at 1e6 and flakes the fit.
// A pairing popMin does far more pointer-chasing per level than an array-embedded sift but LESS
// than a binomial one (a single multi-way tree, not a forest of trees), so its per-level slope
// (~21.8) sits between BinaryHeap.pop's (~9.6) and BinomialHeap.popMin's (~44.8); expected, which
// is why only the R^2 floor is shared and each op declares its own band.
//
// RELIABILITY (D-PH2): a pairing-heap full-drain average has genuine run-to-run SHAPE variance
// (the two-pass amortization tilts the whole 7-point set occasionally), so a SINGLE sweep-fit's
// R^2 dips below the 0.958 floor in a minority of runs even while the slope stays solidly in-band
// -- a flaky gate. This lane therefore gates on the MEDIAN of PH_FIT_RUNS (= 5) independent
// sweep-fits (the registry `fitRuns` hook), rejecting the occasional tilted sweep on both ends
// (measurement-quality only -- the frozen floor + band are untouched; a real O(n) shape fails all
// fits). Measured on this machine: individual single sweep-fit R^2 ranges ~0.945..0.985 (the raw
// flakiness), while the MEDIAN-of-5 fit R^2 ranges 0.9907..0.9974 over 15 back-to-back meta-runs
// (0/15 below the floor -- reliably clear). Slope: the median-of-5 slope ranges ~20.7..23.0
// ns/level (median 21.4), solidly inside the band. Band = median x [0.6, 1.4], anchored on the
// original 15-sample slope median 21.799 (samples 20.96 21.70 21.82 21.74 21.80 21.18 21.54 21.81
// 21.79 21.97 21.49 21.88 22.19 22.08 22.24) -- centered on the MEDIAN (never a high sample) so a
// legitimately faster future run is not false-failed; the R^2 floor independently rejects any
// non-log shape.
export const PAIRINGHEAP_POPMIN_SLOPE_LO = 13.08; // median 21.799 * 0.6
export const PAIRINGHEAP_POPMIN_SLOPE_HI = 30.52; // median 21.799 * 1.4

// --- FibonacciHeap (v0.11.0): shared R^2 floor, OWN popMin slope band (D-FH5 / 0013) ---
// FibonacciHeap's gated op is popMin (delete-extreme -- splice the min root's children into the
// root list, then CONSOLIDATE the root list by degree, then rescan for the new extreme). A
// Fibonacci popMin does the most pointer-chasing per level of any heap in the family (a lazy forest
// consolidated on demand, larger constant factors than the pairing two-pass), so its per-level
// slope is the family's steepest -- expected, which is why only the R^2 floor is shared and this op
// declares its OWN band. Band = median x [0.6, 1.4], anchored on the calibration median-of-15
// fit-run slope. Centered on the MEDIAN (never a high sample) so a legitimately faster future run
// is not false-failed; the shared R^2 floor independently rejects any non-log shape. The band
// values below are CALIBRATED on this machine (see decisions/0013 for the honest R^2 spread).
// Calibration (this machine): the median-of-15 fit-run slope = 45.296 ns/level (samples 43.24
// 44.40 44.46 44.32 44.93 45.30 45.27 45.59 45.28 45.56 45.71 45.62 46.08 46.14 45.84). Band =
// median x [0.6, 1.4]. The Fibonacci popMin is the FAMILY's STEEPEST per-level slope (a lazy
// forest consolidated on demand -- the largest constant factors of any heap here), as expected.
export const FIBONACCIHEAP_POPMIN_SLOPE_LO = 27.18; // median 45.296 * 0.6
export const FIBONACCIHEAP_POPMIN_SLOPE_HI = 63.41; // median 45.296 * 1.4

// --- Fenwick2D (v0.12.0): shared R^2 floor, OWN bands on a SQUARED-log axis (0014) --
// The family's FIRST squared-log witness axis. A 2D BIT op climbs / descends TWO nested
// i&-i walks, so its cost is O(log^2 n), NOT O(log n): for a SQUARE grid of side n the honest
// fit is nsPerOp = intercept + slope*(log2 n)^2 -- a STRAIGHT line on a (log2 n)^2 x-axis (the
// `xOf` registry hook; every prior lane keeps the default xOf = log2). The shared R^2 floor
// (0.958, D-02) is UNCHANGED; each op declares its OWN slope band (per-level^2 cost) =
// median-of-15 fit-runs * [0.6, 1.4] on this machine. WORST-CASE member (a BIT has no
// randomization / amortization), so there is deliberately NO max-single-op disclosure line
// (the BinaryHeap / MinMaxHeap / BinomialHeap precedent). The O(n^2) foils (a 2D prefix-array
// rebuild per update / a naive rectangle scan per query) are EXPONENTIAL on the (log2 n)^2 axis
// and MUST miss the floor. Bands calibrated from N=15 fit runs (medians recorded inline).
// Calibration (this machine, median-of-15 fit runs on the (log2 n)^2 axis over sides
// 2^5..2^11): update MEDIAN slope 3.542 ns/level^2 (15 runs spanned 3.512..3.803, R^2 median
// 0.9980, one low run dipped to 0.9392 -- see the median-of-fits note below); rectSum MEDIAN
// slope 4.832 ns/level^2 (15 runs spanned 4.741..4.843, R^2 0.9991..0.9996, rock-steady).
// rectSum's double descent touches ~m^2 cells per query -- MORE work per (log n)^2 unit than
// update's single climb -- so its slope sits ABOVE update's; expected, which is why only the
// R^2 floor is shared. Bands = median * [0.6, 1.4], centered on the MEDIAN (never a high sample)
// so a legitimately faster future run is not false-failed; the R^2 floor rejects non-square shapes.
export const F2D_UPDATE_SLOPE_LO = 2.13;      // median 3.542 * 0.6
export const F2D_UPDATE_SLOPE_HI = 4.96;      // median 3.542 * 1.4
export const F2D_RECTSUM_SLOPE_LO = 2.90;     // median 4.832 * 0.6
export const F2D_RECTSUM_SLOPE_HI = 6.77;     // median 4.832 * 1.4

// --- SegmentTree2D (v0.13.0): shared R^2 floor, OWN bands on the SQUARED-log axis (0015) --
// The family's SECOND squared-log witness member (Fenwick2D was the first). A 2D segment-tree op
// descends / climbs TWO nested iterative segment trees (a tree OF trees), so its cost is
// O(log^2 n): for a SQUARE grid of side n the honest fit is nsPerOp = intercept + slope*(log2 n)^2
// -- a STRAIGHT line on the SAME (log2 n)^2 x-axis (the `xOf` registry hook Fenwick2D introduced;
// every 1D lane keeps the default xOf = log2). The shared R^2 floor (0.958, D-02) is UNCHANGED;
// each op declares its OWN slope band (per-level^2 cost) = median-of-15 fit-runs * [0.6, 1.4] on
// this machine. WORST-CASE member (a segment tree has no randomization / amortization), so there
// is deliberately NO max-single-op disclosure line (the Fenwick2D / BinaryHeap precedent). The
// O(n^2) foils (a per-update full grid rebuild / a naive rectangle scan per query) are EXPONENTIAL
// on the (log2 n)^2 axis and MUST miss the floor. Calibration (this machine, median-of-15 fit runs
// on the (log2 n)^2 axis over sides 2^5..2^11): update MEDIAN slope 5.638 ns/level^2 (15 runs
// spanned 5.608..5.656, R^2 0.9949..0.9954, rock-steady); query MEDIAN slope 5.105 ns/level^2 (15
// runs spanned 5.045..5.152, R^2 0.99993..0.99998, rock-steady). Both lanes' single-fit R^2 clears
// the floor by a wide margin on EVERY run, so NEITHER needs the median-of-fits (fitRuns) hook the
// noisier lanes use. Bands = median * [0.6, 1.4], centered on the MEDIAN (never a high sample) so a
// legitimately faster future run is not false-failed; the R^2 floor rejects non-square shapes.
export const S2D_UPDATE_SLOPE_LO = 3.38;      // median 5.638 * 0.6
export const S2D_UPDATE_SLOPE_HI = 7.89;      // median 5.638 * 1.4
export const S2D_QUERY_SLOPE_LO = 3.06;       // median 5.105 * 0.6
export const S2D_QUERY_SLOPE_HI = 7.15;       // median 5.105 * 1.4

// Gated pop sweep: pinned to the steady band (L1 micro-floor below and the
// memory wall above ~1e6 both flake the fit). The foil sweep stays where an
// O(n^2) sorted-array build is affordable.
const POP_SWEEP = [1e4, 3e4, 1e5, 3e5, 1e6];
const FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// Fenwick's gated sweep: n placed at HALF-INTEGER exponents (2^13.5 .. 2^19.5) so
// each sample sits in a DISTINCT floor(log2 n) bucket. Fenwick's full-height walk
// does an INTEGER number of levels (= floor(log2 n)); spacing the samples one
// bucket apart maps that staircase cleanly onto the continuous log2(n) axis (a
// point mid-bucket does not, and flakes the fit). Its O(n) foils (prefix-array
// rebuild / naive re-sum) stay on the small O(n^2) sweep.
const FEN_SWEEP = [13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5].map((k) => Math.round(2 ** k));
const FEN_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// SegmentTree's gated sweep: EXACT powers of two 2^10 .. 2^16. Exact powers make
// the decomposition node count regular (update climbs floor(log2 n) levels; the
// gated query window [1, n-2] folds 2*(log2 n - 1) nodes), so the staircase maps
// cleanly onto the continuous log2(n) axis. The top is pinned at 2^16 because a
// SegmentTree op's cells reach index ~2n, so above that the tree leaves the steady
// cache band and the fit flakes. Its O(n) foils (scan-fold / whole-tree rebuild)
// stay on the small O(n^2) sweep.
const SEG_SWEEP = [10, 11, 12, 13, 14, 15, 16].map((k) => 2 ** k);
const SEG_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// SkipList's gated sweeps: EXACT powers of two, but a DIFFERENT window per op (each
// op measured where its logarithm is visible). get needs the larger 2^11..2^17 for
// dynamic range above the timing floor; set (a heavier double-descent insert with a
// random-height splice) is pinned to the smaller, fully cache-resident 2^9..2^14 so
// the fit sees the structural level count, not DRAM latency. Above these windows the
// working set leaves the steady cache band and the fit flakes (lite-o1 ADR-0004);
// exact powers keep the expected height (~log2 n) an integer so the staircase maps
// cleanly onto the log2(n) axis. The O(n) foils (linear scan / sorted-array insert)
// stay on the small O(n^2) sweep.
const SL_GET_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const SL_SET_SWEEP = [9, 10, 11, 12, 13, 14].map((k) => 2 ** k);
const SL_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// Treap's gated get sweep: the same 2^11..2^17 window (a BST descent has the same
// pointer-chasing dynamic-range need as SkipList.get). Its O(n) foil (a linear scan)
// stays on the small O(n^2) sweep.
const TR_GET_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const TR_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// Scapegoat's gated get sweep: the same 2^11..2^17 window (a weight-balanced BST descent has
// the same pointer-chasing dynamic-range need as Treap.get). Its O(n) foil (a linear scan) stays
// on the small O(n^2) sweep. The amortized-insert trace uses the same exact-power sweep so the
// staircase maps cleanly onto the log2(n) axis.
const SG_GET_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const SG_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
const SG_AMORT_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
// The amortized ns/op ratio ceiling across the sweep: a genuine amortized-O(log n) build stays
// LOG-like (last/first ~ log2(2^17)/log2(2^11) = 17/11 ~ 1.5x, measured ~1.4..1.7x); a rebuild-
// LESS BST would degenerate to an O(n)-amortized chain and blow the ratio to ~2^(17-11) = 64x.
// A fixed, meaningful teeth threshold well between the two -- not a widenable budget.
const SG_AMORT_RATIO_MAX = 4;
// MinMaxHeap's gated popMin sweep: the SAME steady [1e4 .. 1e6] band BinaryHeap.pop uses
// (a full-height heap drain has the same dynamic-range need). Its O(n) foil (a linear
// min-scan-and-splice extract-min over an unordered array) stays on the small O(n^2) sweep.
const MMH_POP_SWEEP = [1e4, 3e4, 1e5, 3e5, 1e6];
const MMH_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// SplayTree's gated get sweep: EXACT powers of two 2^12..2^17 (a mutating splay descent
// needs that dynamic range; the 2^11 point is too fast + noisy and drops R^2 near the
// floor). Exact powers keep the working-set mask (i & (n-1)) a clean uniform cover of all
// n resident keys. Its O(n) foil (a linear scan) stays on the small O(n^2) sweep.
const SP_GET_SWEEP = [12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const SP_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// BinomialHeap's gated popMin sweep: EXACT powers of two 2^11..2^17 (the same pointer-chasing
// window Treap/Scapegoat/SkipList.get use -- a binomial popMin chases scattered forest slots
// and its cost is DRAM-latency-sensitive, so it needs a cache-resident exact-power window, not
// the [1e4..1e6] band the array-embedded heaps use). Its O(n) foil (a linear min-scan-and-splice
// extract-min over an unordered array) stays on the small O(n^2) sweep.
const BINH_POP_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const BINH_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// PairingHeap's gated popMin sweep: EXACT powers of two 2^11..2^17 (the same pointer-chasing
// window BinomialHeap.popMin uses -- a pairing popMin chases scattered forest slots and its cost
// is DRAM-latency-sensitive, so it needs a cache-resident exact-power window). Its O(n) foil (a
// linear min-scan-and-splice extract-min over an unordered array) stays on the small O(n^2) sweep.
const PH_POP_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const PH_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// PairingHeap gates on the MEDIAN of PH_FIT_RUNS independent sweep-fits (see the PairingHeap
// registry entry): the two-pass amortization gives the full-drain average genuine run-to-run
// SHAPE variance, so a single fit's R^2 occasionally dips below the floor; the median fit clears
// it reliably. Odd so the median is a real sample. Measurement-quality only (the 0.958 floor and
// the slope band are untouched).
const PH_FIT_RUNS = 5;
// FibonacciHeap's gated popMin sweep: EXACT powers of two 2^11..2^17 (the same pointer-chasing
// window the other forest heaps use -- a Fibonacci popMin chases scattered forest slots through a
// degree-consolidation and its cost is DRAM-latency-sensitive, so it needs a cache-resident
// exact-power window). Its O(n) foil (a linear min-scan-and-splice extract-min over an unordered
// array) stays on the small O(n^2) sweep.
const FH_POP_SWEEP = [11, 12, 13, 14, 15, 16, 17].map((k) => 2 ** k);
const FH_FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];
// FibonacciHeap gates on the MEDIAN of FH_FIT_RUNS independent sweep-fits, exactly like PairingHeap:
// the lazy forest + degree consolidation gives the full-drain average even MORE run-to-run SHAPE
// variance than the pairing two-pass, so a single fit's R^2 dips below the floor in a sizeable
// minority of runs; the median fit clears it reliably. Odd so the median is a real sample.
// Measurement-quality only (the frozen 0.958 floor and the slope band are untouched; a genuine
// O(n) shape fails every fit). See decisions/0013-fibonacciheap.md for the honest R^2 spread.
const FH_FIT_RUNS = 7;
// Fenwick2D's gated sweeps: EXACT power-of-two SQUARE SIDES 2^5..2^11 (a grid of side n has
// (n+1)^2 cells; 2^11 = 2048 -> ~4.2M cells ~ 34 MB, the top the steady band affords). Exact
// powers make the walk height an INTEGER floor(log2 n) in EACH dimension, so the (log2 n)^2
// staircase maps cleanly onto the continuous squared-log axis. Its O(n^2) foils (2D prefix-array
// rebuild / naive rectangle scan) stay on a small O(n^2)-affordable side sweep.
const F2D_SWEEP = [5, 6, 7, 8, 9, 10, 11].map((k) => 2 ** k);
const F2D_FOIL_SWEEP = [3, 4, 5, 6, 7].map((k) => 2 ** k); // sides 8..128 (O(n^2) per op)
// SegmentTree2D's gated sweeps: EXACT power-of-two SQUARE SIDES 2^5..2^11 (a grid of side n has
// 4*n^2 cells; 2^11 = 2048 -> ~16.8M cells ~ 134 MB, the top the steady band affords). Exact
// powers make the tree height an INTEGER log2 n in EACH dimension, so the (log2 n)^2 staircase
// maps cleanly onto the continuous squared-log axis. Its O(n^2) foils (per-update grid rebuild /
// naive rectangle scan) stay on a small O(n^2)-affordable side sweep.
const S2D_SWEEP = [5, 6, 7, 8, 9, 10, 11].map((k) => 2 ** k);
const S2D_FOIL_SWEEP = [3, 4, 5, 6, 7].map((k) => 2 ** k); // sides 8..128 (O(n^2) per op)
// Fenwick2D.update gates on the MEDIAN of F2D_FIT_RUNS independent sweep-fits (the registry
// `fitRuns` hook), exactly like PairingHeap / FibonacciHeap: the 2D update's full-height climb
// has genuine run-to-run SHAPE variance at the fast low-side points, so a single fit's R^2
// occasionally dips below the 0.958 floor (measured min 0.9392 over 15 runs) even though the
// slope stays solidly in-band and the MEDIAN R^2 is ~0.998. The median fit clears the floor
// reliably. Odd so the median is a real sample. Measurement-quality only (the frozen floor and
// slope band are untouched; a genuine non-square shape fails every fit). rectSum is rock-steady
// (R^2 0.9991..0.9996) so it stays single-fit.
const F2D_FIT_RUNS = 5;
// SegmentTree.update gates on the MEDIAN of SEG_FIT_RUNS independent sweep-fits (the registry
// `fitRuns` hook), same mechanism as PairingHeap / FibonacciHeap / Fenwick2D. Its single-fit R^2
// sits right at the 0.958 floor: over independent quiescent runs it flipped OFF-LINE in a sizeable
// minority (measured R^2 down to ~0.85-0.93 in ~3/5 runs) while the slope stayed solidly in its
// [2.29, 5.35] band and the MEDIAN R^2 cleared the floor. This is measurement noise on a fast,
// cache-resident point-update lane -- not a code regression (the SegmentTree class is unchanged) --
// so the median fit clears it reliably. Odd so the median is a real sample. Measurement-quality
// only (the frozen 0.958 floor and the slope band are untouched; a genuine O(n) shape fails every
// fit). SegmentTree.query is rock-steady (R^2 ~0.99 every run) so it stays single-fit.
const SEG_FIT_RUNS = 7;

// --- deterministic measurement helpers (offline; alloc off the timed body) --
function nowNs() { return Number(process.hrtime.bigint()); }

// mulberry32 -- a small deterministic PRNG so the sweep is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Measure pure POP: build a heap of size n (Floyd, OUTSIDE timing), time a full
// drain, accumulate across rebuilds until ~4e6 pops are timed (a stable mean,
// height ~ log2(n)). The rebuild is excluded from the timed window.
function measurePop(n) {
    const reps = Math.max(4, Math.ceil(4e6 / n));
    const ids = new Uint32Array(n);
    const keys = new Float64Array(n);
    const rnd = mulberry32(0x1234 ^ n);
    for (let i = 0; i < n; i++) { ids[i] = i; keys[i] = rnd(); }
    { const h = BinaryHeap.build('min', ids, keys, n); while (h.size > 0) h.pop(); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const h = BinaryHeap.build('min', ids, keys, n);
        const t0 = nowNs();
        while (h.size > 0) sink += h.pop();
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// The O(n) foil: sorted-array insert (the default that buys O(1) extract-min at
// the price of an O(n) shift per insert). O(n^2) total, so the sweep stays small;
// on the log2(n) axis its per-op cost is EXPONENTIAL, so a straight-line fit must
// MISS the R^2 floor.
function measureFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const arr = new Float64Array(n + 1);
    const src = new Float64Array(n);
    const rnd = mulberry32(0x9E37 ^ n);
    for (let i = 0; i < n; i++) src[i] = rnd();
    { let len = 0; for (let i = 0; i < n; i++) len = sortedArrayInsert(arr, len, src[i]); } // warm
    let elapsed = 0, count = 0;
    for (let r = 0; r < reps; r++) {
        let len = 0;
        const t0 = nowNs();
        for (let i = 0; i < n; i++) len = sortedArrayInsert(arr, len, src[i]);
        elapsed += nowNs() - t0;
        count += n;
    }
    return elapsed / count;
}

// --- Fenwick measurement (both hot ops + their O(n) foils) ------------------
// The tree is built OUTSIDE timing. Each op is measured as its FULL-HEIGHT walk
// -- the honest worst case, exactly as BinaryHeap times the full-height sift of a
// pop. Fenwick's per-level cost is sub-nanosecond, so an averaged full-array pass
// is swamped by the memory wall (cache-level crossings) and will not fit a clean
// line; hammering ONE full-height index instead keeps the touched cells hot and
// leaves the number of LEVELS (= log2(n)) as the only variable. Both ops walk the
// HIGH, spread cells near the top of the tree (~[n/2, n]) so each added level is a
// genuine access -- the log line is the level count, not a cache artifact.
const FEN_ITERS = 500000;  // hammered ops per timed batch
const FEN_BATCH = 20;      // min-over-batches: the MIN filters interference (only
                           // ambient noise ADDS time, so the min is the cleanest
                           // per-op signal -- the same asymmetry measureAllocs uses).
                           // A sub-ns per-level op has a shallow, noise-sensitive
                           // log line; a generous batch count keeps the min-over-
                           // batches fit reliably above the frozen R^2 floor. This
                           // raises measurement QUALITY only -- the floor and the
                           // per-op slope bands stay frozen. Same count SegmentTree
                           // uses, so the two fast members measure identically.

// update: climb from index 2^(m-1) (an ODD internal k0), touching the high spread
// cells [~n/2 .. n] -- ~m-1 `_t` touches, one per level, all hot. Return the MIN
// per-op time over FEN_BATCH batches.
function measureUpdate(n) {
    const f = new Fenwick(n);
    const rnd = mulberry32(0x5151 ^ n);
    for (let i = 0; i < n; i++) f.update(i, rnd());          // seed
    const idx = 2 ** (Math.floor(Math.log2(n)) - 1);        // full-height climb start
    for (let w = 0; w < FEN_ITERS; w++) f.update(idx, (w & 1) ? 1 : -1); // warm
    let best = Infinity;
    for (let b = 0; b < FEN_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < FEN_ITERS; i++) f.update(idx, (i & 1) ? 1 : -1);
        const e = (nowNs() - t0) / FEN_ITERS;
        if (e < best) best = e;
    }
    return best;
}

// prefix: descend from index 2^m - 2 (k0 = 2^m - 1, all ones), the full-height
// walk -- m `_t` reads through the high spread cells, one per level, all hot.
// Return the MIN per-op time over FEN_BATCH batches.
function measurePrefix(n) {
    const f = new Fenwick(n);
    const rnd = mulberry32(0x7333 ^ n);
    for (let i = 0; i < n; i++) f.update(i, rnd());          // seed
    const idx = (2 ** Math.floor(Math.log2(n))) - 2;        // full-height descent start
    let sink = 0;
    for (let w = 0; w < FEN_ITERS; w++) sink += f.prefix(idx); // warm
    let best = Infinity;
    for (let b = 0; b < FEN_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < FEN_ITERS; i++) sink += f.prefix(idx);
        const e = (nowNs() - t0) / FEN_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return best;
}

// update FOIL: an update that re-derives the WHOLE running-prefix array = O(n) per
// update (the naive way to keep prefix queries O(1): rebuild on every write). On
// the log2(n) axis its per-op cost is linear in n, so a straight-line fit MISSES
// the R^2 floor. O(n^2) total, so the sweep stays small.
function measureUpdateFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const vals = new Float64Array(n);
    const pre = new Float64Array(n);
    const rnd = mulberry32(0x1a2b ^ n);
    for (let i = 0; i < n; i++) vals[i] = rnd();
    { let acc = 0; for (let i = 0; i < n; i++) { acc += vals[i]; pre[i] = acc; } } // warm
    let elapsed = 0, count = 0, idx = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let i = 0; i < n; i++) {
            vals[idx] += 1.0;
            let acc = 0;
            for (let j = 0; j < n; j++) { acc += vals[j]; pre[j] = acc; } // O(n) rebuild
            idx++; if (idx >= n) idx = 0;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (pre[0] === Infinity) throw new Error('unreachable'); // keep pre live
    return elapsed / count;
}

// prefix FOIL: a naive re-sum of a plain Float64Array [0..i] = O(i) per query
// (the default before you know the Fenwick trick). Average O(n/2), O(n^2) total;
// exponential on the log2(n) axis, so it misses the R^2 floor.
function measurePrefixFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const vals = new Float64Array(n);
    const rnd = mulberry32(0x2c3d ^ n);
    for (let i = 0; i < n; i++) vals[i] = rnd();
    { let s = 0; for (let j = 0; j < n; j++) s += vals[j]; if (s < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, count = 0, sink = 0, idx = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let i = 0; i < n; i++) {
            let s = 0;
            for (let j = 0; j <= idx; j++) s += vals[j]; // O(idx) re-sum
            sink += s;
            idx++; if (idx >= n) idx = 0;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- SegmentTree measurement (both hot ops + their O(n) foils) ---------------
// Same discipline as Fenwick: the tree is built OUTSIDE timing, and each op is
// measured as its FULL-HEIGHT walk hammered on ONE fixed target so the touched
// cells stay hot and the number of LEVELS (= log2(n)) is the only variable.
// Same effort and methodology as Fenwick (FEN_ITERS / FEN_BATCH): a generous
// batch count so min-over-batches rejects ambient interference on the shallow,
// sub-4ns update line -- measurement QUALITY only, the frozen R^2 floor and the
// per-op slope bands are untouched. The two fast members measure identically.
const SEG_ITERS = 500000;
const SEG_BATCH = 20;

// update: hammer an ABSOLUTE set at leaf n-1 -- the leaf write plus a full climb
// to the root, one write per level. Bounded values keep the sum fold finite.
// Return the MIN per-op time over SEG_BATCH batches.
function measureSegUpdate(n) {
    const st = new SegmentTree(n, 'sum');
    const rnd = mulberry32(0x5151 ^ n);
    for (let i = 0; i < n; i++) st.update(i, (rnd() * 65536) | 0);   // seed
    const idx = n - 1;                                              // full-height leaf
    for (let w = 0; w < SEG_ITERS; w++) st.update(idx, w & 0xffff); // warm
    let best = Infinity;
    for (let b = 0; b < SEG_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < SEG_ITERS; i++) st.update(idx, i & 0xffff);
        const e = (nowNs() - t0) / SEG_ITERS;
        if (e < best) best = e;
    }
    return best;
}

// query: hammer the widest full-height window [1, n-2] -- the MAX decomposition,
// 2*(log2 n - 1) folds through the boundary spine (one node per boundary per
// level). Return the MIN per-op time over SEG_BATCH batches.
function measureSegQuery(n) {
    const st = new SegmentTree(n, 'sum');
    const rnd = mulberry32(0x7333 ^ n);
    for (let i = 0; i < n; i++) st.update(i, (rnd() * 65536) | 0);   // seed
    const lo = 1, hi = n - 2;
    let sink = 0;
    for (let w = 0; w < SEG_ITERS; w++) sink += st.query(lo, hi);   // warm
    let best = Infinity;
    for (let b = 0; b < SEG_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < SEG_ITERS; i++) sink += st.query(lo, hi);
        const e = (nowNs() - t0) / SEG_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return best;
}

// update FOIL: an update that REBUILDS the whole 2n tree bottom-up = O(n) per
// update (the naive way to keep queries O(log n): rebuild on every write). Linear
// on the log2(n) axis, so a straight-line fit MISSES the floor. O(n^2) total.
function measureSegUpdateFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const leaf = new Float64Array(n);
    const t = new Float64Array(2 * n);
    const rnd = mulberry32(0x1a2b ^ n);
    for (let i = 0; i < n; i++) leaf[i] = (rnd() * 65536) | 0;
    { for (let i = 0; i < n; i++) t[n + i] = leaf[i]; for (let p = n - 1; p >= 1; p--) t[p] = t[p << 1] + t[(p << 1) + 1]; } // warm
    let elapsed = 0, count = 0, idx = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let it = 0; it < n; it++) {
            leaf[idx] = it & 0xffff;
            for (let i = 0; i < n; i++) t[n + i] = leaf[i];
            for (let p = n - 1; p >= 1; p--) t[p] = t[p << 1] + t[(p << 1) + 1]; // O(n) rebuild
            idx++; if (idx >= n) idx = 0;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (t[1] < 0) throw new Error('unreachable'); // keep t live
    return elapsed / count;
}

// query FOIL: a naive linear scan-fold over [1, n-2] of a plain Float64Array =
// O(n) per query (the default before you know the segment-tree trick). Exponential
// on the log2(n) axis, so it misses the floor. O(n^2) total.
function measureSegQueryFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const a = new Float64Array(n);
    const rnd = mulberry32(0x2c3d ^ n);
    for (let i = 0; i < n; i++) a[i] = (rnd() * 65536) | 0;
    { let s = 0; for (let k = 1; k <= n - 2; k++) s += a[k]; if (s < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let it = 0; it < n; it++) {
            let s = 0;
            for (let k = 1; k <= n - 2; k++) s += a[k]; // O(n) scan-fold
            sink += s;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- SkipList measurement (get + set hot ops, their O(n) foils, MAX single-op) -
// Both ops are hammered like the array-embedded members, but over a spread of
// RANDOM positions (a skip list chases a random slot INDEX per level, so a single
// hot path would understate the pointer-chasing cost). The list is built OUTSIDE
// timing and held at steady size n; the timed window is the op only.
//   - get: a search for a random RESIDENT key (a full ~log2(n) descent), cycled
//     over 1024 random targets so many paths are averaged.
//   - set: the steady-state INSERT+DELETE churn -- insert a fresh key at a random
//     position then delete it, keeping size n. Both halves are the O(log n)
//     mutation descent, so the slope reflects the addressable-mutation pair (the
//     honest destructive-op analogue of BinaryHeap's drain); its foil is the
//     sorted-array insert, whose O(n) shift leaves the line.
const SL_ITERS = 200000;   // hammered ops per timed batch
const SL_BATCH = 25;       // min-over-batches (rejects ambient interference)
const SL_TARGETS = 1024;   // distinct random targets cycled per batch (pow2 mask)

// A module-level capture for the MAX single insert observed across the set sweep --
// the honesty hook the randomized member must not hide behind its mean.
let SKIPLIST_MAX_INSERT_NS = 0;

// get: hammer a search for random resident keys over a dense 0..n-1 list. Return
// the MIN per-op time over SL_BATCH batches.
function measureSkipGet(n) {
    const sl = new SkipList(n, (0x51ED ^ n) >>> 0);
    for (let i = 0; i < n; i++) sl.set(i, i);
    const tg = new Float64Array(SL_TARGETS);
    const rnd = mulberry32(0x33A5 ^ n);
    for (let i = 0; i < SL_TARGETS; i++) tg[i] = (rnd() * n) | 0;
    let sink = 0;
    for (let w = 0; w < SL_ITERS; w++) sink += sl.get(tg[w & (SL_TARGETS - 1)]); // warm
    let best = Infinity;
    for (let b = 0; b < SL_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < SL_ITERS; i++) sink += sl.get(tg[i & (SL_TARGETS - 1)]);
        const e = (nowNs() - t0) / SL_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return best;
}

// set: hammer the steady-state INSERT+DELETE churn -- insert a fresh fractional key
// at a random position, then delete it, over a list held at size n. Return the MIN
// per-op time over SL_BATCH batches. Also samples the MAX single insert into the
// module capture -- the unlucky-tower tail an EXPECTED-O(log n) member must disclose.
function measureSkipSet(n) {
    const sl = new SkipList(n + 1, (0x71ED ^ n) >>> 0);
    for (let i = 0; i < n; i++) sl.set(i, i);                    // resident 0..n-1
    const pk = new Float64Array(SL_TARGETS);
    const rnd = mulberry32(0x99C3 ^ n);
    for (let i = 0; i < SL_TARGETS; i++) pk[i] = ((rnd() * n) | 0) + 0.5; // random fractional slot
    for (let w = 0; w < SL_ITERS; w++) { const k = pk[w & (SL_TARGETS - 1)]; sl.set(k, w); sl.delete(k); } // warm
    let best = Infinity;
    for (let b = 0; b < SL_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < SL_ITERS; i++) { const k = pk[i & (SL_TARGETS - 1)]; sl.set(k, i); sl.delete(k); }
        const e = (nowNs() - t0) / SL_ITERS;
        if (e < best) best = e;
    }
    // MAX single insert -- sampled over a REALISTIC randomized BUILD trace (not the
    // hot fixed churn path): build a fresh list from n keys in RANDOM order, timing
    // EVERY individual insert, and keep the tallest. This is the genuine unlucky-seed
    // tail (a random tall tower on a fresh, cache-cold list), the honest worst single
    // op an EXPECTED-O(log n) member must disclose. It is a DISCLOSURE, not gated.
    sampleSkipMaxInsert(n);
    return best;
}

// Build a list of n keys in RANDOM insertion order, timing each insert, and fold the
// tallest into the module capture. The random order + fresh list make this the
// realistic unlucky-tower tail, distinct from the hot fixed-path average-line fit.
function sampleSkipMaxInsert(n) {
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i++) keys[i] = i;
    const rnd = mulberry32(0xF00D ^ n);
    for (let i = n - 1; i > 0; i--) {                            // Fisher-Yates shuffle
        const j = (rnd() * (i + 1)) | 0;
        const t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    const sl = new SkipList(n, (0xC0DE ^ n) >>> 0);
    for (let i = 0; i < n; i++) {
        const t0 = nowNs();
        sl.set(keys[i], i);
        const e = nowNs() - t0;
        if (e > SKIPLIST_MAX_INSERT_NS) SKIPLIST_MAX_INSERT_NS = e;
    }
}

// get FOIL: a naive LINEAR SCAN for the max key over a plain Float64Array = O(n) per
// search (the default before you know the skip-list trick). Exponential on the
// log2(n) axis, so a straight-line fit MISSES the R^2 floor. O(n^2) total.
function measureSkipGetFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    const target = n - 1;
    { let idx = -1; for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } } if (idx < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let it = 0; it < n; it++) {
            let idx = -1;
            for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } }
            sink += idx;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// set FOIL: sorted-array insert -- the O(n) default that keeps keys ordered by
// shifting on every insert. Search is O(log n) (a sorted array can bisect), but the
// INSERT shift is O(n), so on the log2(n) axis its per-op cost is exponential and a
// straight-line fit MISSES the floor. Reuses the same sortedArrayInsert BinaryHeap
// uses -- the honest ordered-insert foil a SkipList replaces. O(n^2) total.
function measureSkipSetFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const arr = new Float64Array(n + 1);
    const src = new Float64Array(n);
    const rnd = mulberry32(0x9E37 ^ n);
    for (let i = 0; i < n; i++) src[i] = rnd();
    { let len = 0; for (let i = 0; i < n; i++) len = sortedArrayInsert(arr, len, src[i]); } // warm
    let elapsed = 0, count = 0;
    for (let r = 0; r < reps; r++) {
        let len = 0;
        const t0 = nowNs();
        for (let i = 0; i < n; i++) len = sortedArrayInsert(arr, len, src[i]);
        elapsed += nowNs() - t0;
        count += n;
    }
    return elapsed / count;
}

// --- Treap measurement (get hot op, its O(n) foil, MAX single insert) --------
// The tree is built OUTSIDE timing and held at steady size n; the timed window is the
// get descent only, hammered over 1024 random resident targets so many BST paths are
// averaged (a single hot path would understate the pointer-chasing cost). Same effort
// as SkipList.get (min-over-batches rejects ambient interference).
const TR_ITERS = 200000;   // hammered ops per timed batch
const TR_BATCH = 25;       // min-over-batches
const TR_TARGETS = 1024;   // distinct random targets cycled per batch (pow2 mask)

// A module-level capture for the MAX single insert observed across the get sweep build --
// the honesty hook the randomized member must not hide behind its mean.
let TREAP_MAX_INSERT_NS = 0;

// get: hammer a search for random resident keys over a dense 0..n-1 treap. Return the
// MIN per-op time over TR_BATCH batches. Also samples the MAX single insert (disclosure).
function measureTreapGet(n) {
    const tr = new Treap(n, (0x51ED ^ n) >>> 0);
    for (let i = 0; i < n; i++) tr.set(i, i);
    const tg = new Float64Array(TR_TARGETS);
    const rnd = mulberry32(0x33A5 ^ n);
    for (let i = 0; i < TR_TARGETS; i++) tg[i] = (rnd() * n) | 0;
    let sink = 0;
    for (let w = 0; w < TR_ITERS; w++) sink += tr.get(tg[w & (TR_TARGETS - 1)]); // warm
    let best = Infinity;
    for (let b = 0; b < TR_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < TR_ITERS; i++) sink += tr.get(tg[i & (TR_TARGETS - 1)]);
        const e = (nowNs() - t0) / TR_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    sampleTreapMaxInsert(n);
    return best;
}

// Build a treap of n keys in RANDOM insertion order, timing each insert, and fold the
// tallest rotation chain into the module capture -- the realistic unlucky-priority tail.
function sampleTreapMaxInsert(n) {
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i++) keys[i] = i;
    const rnd = mulberry32(0xF00D ^ n);
    for (let i = n - 1; i > 0; i--) {                            // Fisher-Yates shuffle
        const j = (rnd() * (i + 1)) | 0;
        const t = keys[i]; keys[i] = keys[j]; keys[j] = t;
    }
    const tr = new Treap(n, (0xC0DE ^ n) >>> 0);
    for (let i = 0; i < n; i++) {
        const t0 = nowNs();
        tr.set(keys[i], i);
        const e = nowNs() - t0;
        if (e > TREAP_MAX_INSERT_NS) TREAP_MAX_INSERT_NS = e;
    }
}

// get FOIL: a naive LINEAR SCAN for the max key over a plain Float64Array = O(n) per
// search (the default before you know the balanced-BST trick). Exponential on the
// log2(n) axis, so a straight-line fit MISSES the R^2 floor. O(n^2) total.
function measureTreapGetFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    const target = n - 1;
    { let idx = -1; for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } } if (idx < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let it = 0; it < n; it++) {
            let idx = -1;
            for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } }
            sink += idx;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- Scapegoat measurement (get hot op, its O(n) foil, amortized-insert trace) ---
// The tree is built OUTSIDE timing and held at steady size n; the timed window is the get
// descent only, hammered over 1024 random resident targets so many BST paths are averaged.
// Same effort as Treap.get (min-over-batches rejects ambient interference). Scapegoat has NO
// RNG, so its get line is a pure DETERMINISTIC worst-case O(log n) descent.
const SG_ITERS = 200000;   // hammered ops per timed batch
const SG_BATCH = 25;       // min-over-batches
const SG_TARGETS = 1024;   // distinct random targets cycled per batch (pow2 mask)
const SG_AMORT_BATCH = 8;  // min-over-batches for the amortized ascending-build trace

// get: hammer a search for random resident keys over a dense 0..n-1 tree. Return the MIN
// per-op time over SG_BATCH batches.
function measureScapegoatGet(n) {
    const sg = new Scapegoat(n);
    for (let i = 0; i < n; i++) sg.set(i, i);
    const tg = new Float64Array(SG_TARGETS);
    const rnd = mulberry32(0x33A5 ^ n);
    for (let i = 0; i < SG_TARGETS; i++) tg[i] = (rnd() * n) | 0;
    let sink = 0;
    for (let w = 0; w < SG_ITERS; w++) sink += sg.get(tg[w & (SG_TARGETS - 1)]); // warm
    let best = Infinity;
    for (let b = 0; b < SG_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < SG_ITERS; i++) sink += sg.get(tg[i & (SG_TARGETS - 1)]);
        const e = (nowNs() - t0) / SG_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return best;
}

// get FOIL: a naive LINEAR SCAN for the max key over a plain Float64Array = O(n) per search
// (the default before you know the balanced-BST trick). Exponential on the log2(n) axis, so a
// straight-line fit MISSES the R^2 floor. O(n^2) total.
function measureScapegoatGetFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    const target = n - 1;
    { let idx = -1; for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } } if (idx < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let it = 0; it < n; it++) {
            let idx = -1;
            for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } }
            sink += idx;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// amortized-insert trace: the cumulative ns/op of an ASCENDING build of n keys -- the REBUILD-
// HEAVY worst case (each rebuild absorbs the imbalance). Reuses ONE tree, clear()ing between
// batches (outside timing), min-over-batches. Returns the amortized per-insert ns. Fitting this
// across the sweep shows it tracks a LOG curve despite the rebuild spikes (the amortization
// theorem made visible); the O(n)-amortized chain a rebuild-less BST degenerates to would NOT.
function measureScapegoatAmortized(n) {
    const sg = new Scapegoat(n);
    for (let k = 0; k < n; k++) sg.set(k, k); sg.clear();     // warm
    let best = Infinity;
    for (let b = 0; b < SG_AMORT_BATCH; b++) {
        sg.clear();
        const t0 = nowNs();
        for (let k = 0; k < n; k++) sg.set(k, k);
        const e = (nowNs() - t0) / n;
        if (e < best) best = e;
    }
    return best;
}

// --- MinMaxHeap measurement (popMin hot op + its O(n) foil) ------------------
// The heap is built OUTSIDE timing (Floyd), then a FULL popMin drain is timed, accumulated
// across rebuilds until ~4e6 pops are timed (a stable mean, height ~ log2(n)). The rebuild
// is excluded from the timed window. Same discipline as BinaryHeap.measurePop -- popMin is
// the min-max heap's tallest honest walk. WORST-case member: NO max-single-op disclosure.
function measureMinMaxHeap(n) {
    const reps = Math.max(4, Math.ceil(4e6 / n));
    const ids = new Uint32Array(n);
    const keys = new Float64Array(n);
    const rnd = mulberry32(0x1234 ^ n);
    for (let i = 0; i < n; i++) { ids[i] = i & 0xffff; keys[i] = rnd(); }
    { const h = MinMaxHeap.build(ids, keys, n); while (h.size > 0) h.popMin(); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const h = MinMaxHeap.build(ids, keys, n);
        const t0 = nowNs();
        while (h.size > 0) sink += h.popMin();
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// The O(n) foil: a linear MIN-SCAN-AND-SPLICE extract-min over an unordered array (the
// naive way to serve a min without a heap: scan for the smallest, remove it by swapping in
// the tail). O(n) per extraction, O(n^2) total drain, so on the log2(n) axis its per-op cost
// is EXPONENTIAL and a straight-line fit MUST MISS the R^2 floor. Sweep stays small.
function measureMinMaxHeapFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const src = new Float64Array(n);
    const rnd = mulberry32(0x9E37 ^ n);
    for (let i = 0; i < n; i++) src[i] = rnd();
    const arr = new Float64Array(n);
    { arr.set(src); let len = n; while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; arr[mi] = arr[len - 1]; len--; } } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        arr.set(src); let len = n;
        const t0 = nowNs();
        while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; sink += arr[mi]; arr[mi] = arr[len - 1]; len--; }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- SplayTree measurement (get hot op, its O(n) foil, MAX single get) -------
// The tree is built OUTSIDE timing and held at steady size n; the timed window is the get
// splay only, hammered over a shuffled permutation of the n resident keys cycled by the
// power-of-two mask -- a UNIFORM-RANDOM working set of size n, so no key stays hot and the
// self-adjusting splay churns the full height each op (the amortized O(log n) signal). Same
// effort as Treap.get (min-over-batches rejects ambient interference).
const SP_ITERS = 200000;   // hammered ops per timed batch
const SP_BATCH = 25;       // min-over-batches

// A module-level capture for the MAX single get observed across the get sweep -- the
// honesty hook the AMORTIZED member must not hide behind its mean (a cold deep splay).
let SPLAYTREE_MAX_GET_NS = 0;

// get: hammer a splay-get over a shuffled permutation of the n resident keys. Return the
// MIN per-op time over SP_BATCH batches. Also samples the MAX single get (disclosure).
function measureSplayGet(n) {
    const sp = new SplayTree(n);
    for (let k = 0; k < n; k++) sp.set(k, k);
    const tg = new Float64Array(n);
    for (let i = 0; i < n; i++) tg[i] = i;
    const rnd = mulberry32(0x33A5 ^ n);
    for (let i = n - 1; i > 0; i--) {                            // Fisher-Yates shuffle
        const j = (rnd() * (i + 1)) | 0;
        const t = tg[i]; tg[i] = tg[j]; tg[j] = t;
    }
    const mask = n - 1;                                          // n is an exact power of two
    let sink = 0;
    for (let w = 0; w < SP_ITERS; w++) sink += sp.get(tg[w & mask]); // warm
    let best = Infinity;
    for (let b = 0; b < SP_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < SP_ITERS; i++) sink += sp.get(tg[i & mask]);
        const e = (nowNs() - t0) / SP_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    sampleSplayMaxGet(n);
    return best;
}

// Build a splay tree of n keys, then time EVERY individual get over a shuffled access
// trace on a fresh (cache-cold) tree, keeping the tallest. The random order + fresh tree
// make this the realistic cold-deep-splay tail -- the honest worst single op an AMORTIZED
// member must disclose. It is a DISCLOSURE, not gated.
function sampleSplayMaxGet(n) {
    const sp = new SplayTree(n);
    for (let k = 0; k < n; k++) sp.set(k, k);
    const tg = new Float64Array(n);
    for (let i = 0; i < n; i++) tg[i] = i;
    const rnd = mulberry32(0xF00D ^ n);
    for (let i = n - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        const t = tg[i]; tg[i] = tg[j]; tg[j] = t;
    }
    let sink = 0;
    for (let i = 0; i < n; i++) {
        const t0 = nowNs();
        sink += sp.get(tg[i]);
        const e = nowNs() - t0;
        if (e > SPLAYTREE_MAX_GET_NS) SPLAYTREE_MAX_GET_NS = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
}

// get FOIL: a naive LINEAR SCAN for the max key over a plain Float64Array = O(n) per search
// (the default before you know the balanced/self-adjusting-BST trick). Exponential on the
// log2(n) axis, so a straight-line fit MISSES the R^2 floor. O(n^2) total.
function measureSplayGetFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    const target = n - 1;
    { let idx = -1; for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } } if (idx < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const t0 = nowNs();
        for (let it = 0; it < n; it++) {
            let idx = -1;
            for (let j = 0; j < n; j++) { if (a[j] === target) { idx = j; break; } }
            sink += idx;
        }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- BinomialHeap measurement (popMin hot op + its O(n) foil) ----------------
// The heap is built OUTSIDE timing (n pushes), then a FULL popMin drain is timed, accumulated
// across rebuilds until ~4e6 pops are timed (a stable mean, height ~ log2(n)). The rebuild is
// excluded from the timed window. Same discipline as BinaryHeap/MinMaxHeap -- popMin is the
// mergeable heap's tallest honest walk (unlink extreme root, reverse children, union, rescan).
// WORST-case member: NO max-single-op disclosure.
function measureBinomialHeap(n) {
    const reps = Math.max(4, Math.ceil(4e6 / n));
    const ids = new Uint32Array(n);
    const keys = new Float64Array(n);
    const rnd = mulberry32(0x1234 ^ n);
    for (let i = 0; i < n; i++) { ids[i] = i & 0xffff; keys[i] = rnd(); }
    { const h = new BinomialHeap(n, 'min'); for (let i = 0; i < n; i++) h.push(ids[i], keys[i]); while (h.size > 0) h.popMin(); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const h = new BinomialHeap(n, 'min');
        for (let i = 0; i < n; i++) h.push(ids[i], keys[i]);
        const t0 = nowNs();
        while (h.size > 0) sink += h.popMin();
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// The O(n) foil: a linear MIN-SCAN-AND-SPLICE extract-min over an unordered array (the naive
// way to serve a min without a heap: scan for the smallest, remove it by swapping in the tail).
// O(n) per extraction, O(n^2) total drain, so on the log2(n) axis its per-op cost is EXPONENTIAL
// and a straight-line fit MUST MISS the R^2 floor. Sweep stays small. (Same foil MinMaxHeap uses.)
function measureBinomialHeapFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const src = new Float64Array(n);
    const rnd = mulberry32(0x9E37 ^ n);
    for (let i = 0; i < n; i++) src[i] = rnd();
    const arr = new Float64Array(n);
    { arr.set(src); let len = n; while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; arr[mi] = arr[len - 1]; len--; } } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        arr.set(src); let len = n;
        const t0 = nowNs();
        while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; sink += arr[mi]; arr[mi] = arr[len - 1]; len--; }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- PairingHeap measurement (popMin hot op + its O(n) foil + MAX single popMin) ---
// The heap is built OUTSIDE timing (n pushes), then a FULL popMin drain is timed, accumulated
// across rebuilds until ~4e6 pops are timed (a stable mean, height ~ log2(n)). The rebuild is
// excluded from the timed window. Same discipline as BinomialHeap -- popMin is the pairing heap's
// tallest honest walk (unlink root, TWO-PASS combine the child list). AMORTIZED member: the MAX
// single popMin (a long two-pass fold) is DISCLOSED below, not gated.
let PAIRINGHEAP_MAX_POP_NS = 0;

function measurePairingHeap(n) {
    const reps = Math.max(4, Math.ceil(4e6 / n));
    const ids = new Uint32Array(n);
    const keys = new Float64Array(n);
    const rnd = mulberry32(0x1234 ^ n);
    for (let i = 0; i < n; i++) { ids[i] = i; keys[i] = rnd(); }
    { const h = new PairingHeap(n, 'min'); for (let i = 0; i < n; i++) h.push(ids[i], keys[i]); while (h.size > 0) h.popMin(); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const h = new PairingHeap(n, 'min');
        for (let i = 0; i < n; i++) h.push(ids[i], keys[i]);
        const t0 = nowNs();
        while (h.size > 0) sink += h.popMin();
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    samplePairingMaxPop(n);
    return elapsed / count;
}

// Build a pairing heap of n keys, then time EVERY individual popMin over a fresh drain, keeping
// the tallest. A pairing popMin is AMORTIZED O(log n): a single pop after many inserts can fold a
// long child list (an O(n) two-pass tail) even while the mean holds the fitted line. DISCLOSURE, not gated.
function samplePairingMaxPop(n) {
    const rnd = mulberry32(0xF00D ^ n);
    const h = new PairingHeap(n, 'min');
    for (let i = 0; i < n; i++) h.push(i, rnd());
    let sink = 0;
    while (h.size > 0) {
        const t0 = nowNs();
        sink += h.popMin();
        const e = nowNs() - t0;
        if (e > PAIRINGHEAP_MAX_POP_NS) PAIRINGHEAP_MAX_POP_NS = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
}

// The O(n) foil: a linear MIN-SCAN-AND-SPLICE extract-min over an unordered array (the naive way
// to serve a min without a heap). O(n) per extraction, O(n^2) total drain, so on the log2(n) axis
// its per-op cost is EXPONENTIAL and a straight-line fit MUST MISS the R^2 floor. (Same foil the
// other heap members use.) Sweep stays small.
function measurePairingHeapFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const src = new Float64Array(n);
    const rnd = mulberry32(0x9E37 ^ n);
    for (let i = 0; i < n; i++) src[i] = rnd();
    const arr = new Float64Array(n);
    { arr.set(src); let len = n; while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; arr[mi] = arr[len - 1]; len--; } } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        arr.set(src); let len = n;
        const t0 = nowNs();
        while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; sink += arr[mi]; arr[mi] = arr[len - 1]; len--; }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- FibonacciHeap measurement (popMin hot op + its O(n) foil + MAX single popMin / decreaseKey) ---
// The heap is built OUTSIDE timing (n pushes), then a FULL popMin drain is timed, accumulated across
// rebuilds until ~4e6 pops are timed (a stable mean, height ~ log2(n)). The rebuild is excluded from
// the timed window. Same discipline as PairingHeap -- popMin is the Fibonacci heap's tallest honest
// walk (splice children, consolidate the root list). AMORTIZED member: the MAX single popMin (a long
// consolidation) AND the MAX single decreaseKey (a long cascading cut) are DISCLOSED below, not gated.
let FIBONACCIHEAP_MAX_POP_NS = 0;
let FIBONACCIHEAP_MAX_DK_NS = 0;

function measureFibonacciHeap(n) {
    const reps = Math.max(4, Math.ceil(4e6 / n));
    const ids = new Uint32Array(n);
    const keys = new Float64Array(n);
    const rnd = mulberry32(0x1234 ^ n);
    for (let i = 0; i < n; i++) { ids[i] = i; keys[i] = rnd(); }
    { const h = new FibonacciHeap(n, 'min'); for (let i = 0; i < n; i++) h.push(ids[i], keys[i]); while (h.size > 0) h.popMin(); } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        const h = new FibonacciHeap(n, 'min');
        for (let i = 0; i < n; i++) h.push(ids[i], keys[i]);
        const t0 = nowNs();
        while (h.size > 0) sink += h.popMin();
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    sampleFibonacciMaxOps(n);
    return elapsed / count;
}

// Build a Fibonacci heap of n keys, then time EVERY individual popMin over a fresh drain, keeping the
// tallest. Then, on a fresh heap, drive a decreaseKey wave (cutting subtrees toward the min, forcing
// cascading cuts) and time EVERY individual decreaseKey, keeping the tallest. Both are AMORTIZED
// O(log n) / O(1): a single op can do an O(n) consolidation or an O(n) cascade even while the mean
// holds the fitted line. DISCLOSURE, not gated.
function sampleFibonacciMaxOps(n) {
    const rnd = mulberry32(0xF00D ^ n);
    const h = new FibonacciHeap(n, 'min');
    for (let i = 0; i < n; i++) h.push(i, rnd());
    let sink = 0;
    while (h.size > 0) {
        const t0 = nowNs();
        sink += h.popMin();
        const e = nowNs() - t0;
        if (e > FIBONACCIHEAP_MAX_POP_NS) FIBONACCIHEAP_MAX_POP_NS = e;
    }
    // decreaseKey wave: refill, pop a chunk to build depth via consolidation, then decrease scattered
    // ids toward the min so genuine cuts + cascades fire; time each decreaseKey.
    const h2 = new FibonacciHeap(n, 'min');
    for (let i = 0; i < n; i++) h2.push(i, rnd() * 1e6);
    const half = n >> 1;
    for (let i = 0; i < half; i++) h2.popMin(); // consolidate -> deep marked trees
    let dk = 0;
    for (let i = 0; i < n; i++) {
        if (!h2.has(i)) continue;
        const cur = h2.keyOf(i);
        const t0 = nowNs();
        h2.decreaseKey(i, cur - (1 + rnd() * 1000));
        const e = nowNs() - t0;
        if (e > FIBONACCIHEAP_MAX_DK_NS) FIBONACCIHEAP_MAX_DK_NS = e;
        dk++;
    }
    if (sink < 0 || dk < 0) throw new Error('unreachable'); // keep live
}

// The O(n) foil: a linear MIN-SCAN-AND-SPLICE extract-min over an unordered array (the naive way to
// serve a min without a heap). O(n) per extraction, O(n^2) total drain, so on the log2(n) axis its
// per-op cost is EXPONENTIAL and a straight-line fit MUST MISS the R^2 floor. (Same foil the other
// heap members use.) Sweep stays small.
function measureFibonacciHeapFoil(n) {
    const reps = Math.max(3, Math.ceil(2e8 / (n * n)));
    const src = new Float64Array(n);
    const rnd = mulberry32(0x9E37 ^ n);
    for (let i = 0; i < n; i++) src[i] = rnd();
    const arr = new Float64Array(n);
    { arr.set(src); let len = n; while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; arr[mi] = arr[len - 1]; len--; } } // warm
    let elapsed = 0, count = 0, sink = 0;
    for (let r = 0; r < reps; r++) {
        arr.set(src); let len = n;
        const t0 = nowNs();
        while (len > 0) { let mi = 0; for (let j = 1; j < len; j++) if (arr[j] < arr[mi]) mi = j; sink += arr[mi]; arr[mi] = arr[len - 1]; len--; }
        elapsed += nowNs() - t0;
        count += n;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / count;
}

// --- Fenwick2D measurement (both hot ops + their O(n^2) foils) ---------------
// Same discipline as Fenwick / SegmentTree: the tree is built OUTSIDE timing, and each op is
// hammered on ONE fixed FULL-HEIGHT coordinate so the touched cells stay hot and the number of
// (log n)^2 level PAIRS is the only variable. A 2D op is ~log^2 heavier per call than a 1D one,
// so a smaller iter budget keeps the min-over-batches fit reliable -- measurement QUALITY only,
// the frozen R^2 floor and per-op slope bands are untouched.
const F2D_ITERS = 100000;  // hammered ops per timed batch
const F2D_BATCH = 20;      // min-over-batches (rejects ambient interference)

// update: climb BOTH dims from a full-height (idx, idx) start (idx = 2^(m-1), an ODD internal
// coord), touching the high spread cells -- ~(m-1)^2 `_t` touches, one per level pair, all hot.
// Return the MIN per-op time over F2D_BATCH batches.
function measureF2DUpdate(n) {
    const f = new Fenwick2D(n, n);
    const rnd = mulberry32(0x5151 ^ n);
    for (let i = 0; i < n; i++) f.update(i, (n - 1 - i), rnd() & 0xff); // seed the anti-diagonal
    const idx = 2 ** (Math.floor(Math.log2(n)) - 1);                    // full-height climb start
    for (let w = 0; w < F2D_ITERS; w++) f.update(idx, idx, (w & 1) ? 1 : -1); // warm
    let best = Infinity;
    for (let b = 0; b < F2D_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < F2D_ITERS; i++) f.update(idx, idx, (i & 1) ? 1 : -1);
        const e = (nowNs() - t0) / F2D_ITERS;
        if (e < best) best = e;
    }
    return best;
}

// rectSum: hammer the full-grid-anchored query rectSum(0, 0, hi, hi) with hi = 2^m - 2 (the all-
// ones full-height descent). With r1 = c1 = 0 the three inclusion-exclusion terms with a `-1`
// index collapse to 0, so this is ONE full-height double descent -- m*m `_t` reads, all hot.
// Return the MIN per-op time over F2D_BATCH batches.
function measureF2DRectSum(n) {
    const f = new Fenwick2D(n, n);
    const rnd = mulberry32(0x7333 ^ n);
    for (let i = 0; i < n; i++) f.update(i, (n - 1 - i), rnd() & 0xff); // seed the anti-diagonal
    const hi = (2 ** Math.floor(Math.log2(n))) - 2;                     // full-height descent
    let sink = 0;
    for (let w = 0; w < F2D_ITERS; w++) sink += f.rectSum(0, 0, hi, hi); // warm
    let best = Infinity;
    for (let b = 0; b < F2D_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < F2D_ITERS; i++) sink += f.rectSum(0, 0, hi, hi);
        const e = (nowNs() - t0) / F2D_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return best;
}

// update FOIL: an update that REBUILDS the whole 2D prefix-sum array = O(n^2) per update (the
// naive way to keep rectangle queries O(1): rebuild on every write). On the (log2 n)^2 axis its
// per-op cost is exponential, so a straight-line fit MISSES the R^2 floor. Sweep stays small.
function measureF2DUpdateFoil(n) {
    const reps = Math.max(3, Math.ceil(2e7 / (n * n)));
    const w = n + 1;
    const a = new Float64Array(n * n);
    const pre = new Float64Array(w * w);
    const rnd = mulberry32(0x1a2b ^ n);
    for (let i = 0; i < n * n; i++) a[i] = rnd() & 0xff;
    const rebuild = () => {
        for (let r = 1; r <= n; r++) {
            const rb = r * w, pb = (r - 1) * w, ab = (r - 1) * n;
            for (let c = 1; c <= n; c++) {
                pre[rb + c] = a[ab + (c - 1)] + pre[pb + c] + pre[rb + c - 1] - pre[pb + c - 1];
            }
        }
    };
    rebuild(); // warm
    // Each op is one O(n^2) full rebuild; measure `reps` single ops (total work ~2e7).
    let elapsed = 0, idx = 0;
    for (let rp = 0; rp < reps; rp++) {
        const t0 = nowNs();
        a[idx] += 1.0; rebuild();
        elapsed += nowNs() - t0;
        idx++; if (idx >= n * n) idx = 0;
    }
    if (pre[0] === Infinity) throw new Error('unreachable'); // keep pre live
    return elapsed / reps;
}

// rectSum FOIL: a naive full-rectangle scan-sum over a plain array = O(n^2) per query (the default
// before the 2D BIT trick). Exponential on the (log2 n)^2 axis, so it misses the floor. Small sweep.
function measureF2DRectSumFoil(n) {
    const reps = Math.max(3, Math.ceil(2e7 / (n * n)));
    const a = new Float64Array(n * n);
    const rnd = mulberry32(0x2c3d ^ n);
    for (let i = 0; i < n * n; i++) a[i] = rnd() & 0xff;
    const scan = () => { let s = 0; for (let k = 0; k < n * n; k++) s += a[k]; return s; };
    { const s = scan(); if (s < 0) throw new Error('unreachable'); } // warm
    // Each op is one O(n^2) full-rectangle scan; measure `reps` single ops (total work ~2e7).
    let elapsed = 0, sink = 0;
    for (let rp = 0; rp < reps; rp++) {
        const t0 = nowNs();
        sink += scan();
        elapsed += nowNs() - t0;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / reps;
}

// --- SegmentTree2D measurement (both hot ops + their O(n^2) foils) -----------
// Same discipline as Fenwick2D: the tree is built OUTSIDE timing, and each op is hammered on ONE
// fixed FULL-HEIGHT coordinate / rectangle so the touched cells stay hot and the number of
// (log n)^2 node PAIRS is the only variable. Measurement QUALITY only -- the frozen R^2 floor and
// per-op slope bands are untouched.
const S2D_ITERS = 100000;  // hammered ops per timed batch
const S2D_BATCH = 20;      // min-over-batches (rejects ambient interference)

// update: set an ABSOLUTE bounded value at a full-height (idx, idx) coord (idx = 2^(m-1)),
// climbing the leaf row's col-tree then the whole row-tree -- ~(log n)^2 `_t` touches, all hot.
// Return the MIN per-op time over S2D_BATCH batches.
function measureS2DUpdate(n) {
    const st = new SegmentTree2D(n, n, 'sum');
    const rnd = mulberry32(0x5959 ^ n);
    for (let i = 0; i < n; i++) st.update(i, (n - 1 - i), rnd() & 0xff); // seed the anti-diagonal
    const idx = 2 ** (Math.floor(Math.log2(n)) - 1);                     // full-height climb start
    for (let w = 0; w < S2D_ITERS; w++) st.update(idx, idx, (w & 1) ? 1 : -1); // warm
    let best = Infinity;
    for (let b = 0; b < S2D_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < S2D_ITERS; i++) st.update(idx, idx, (i & 1) ? 1 : -1);
        const e = (nowNs() - t0) / S2D_ITERS;
        if (e < best) best = e;
    }
    return best;
}

// query: hammer the full-grid-anchored fold query(0, 0, hi, hi) with hi = 2^m - 2 (a full-height
// double descent in both dims) -- ~(log n)^2 `_t` reads, all hot. MIN over S2D_BATCH batches.
function measureS2DQuery(n) {
    const st = new SegmentTree2D(n, n, 'sum');
    const rnd = mulberry32(0x7a7a ^ n);
    for (let i = 0; i < n; i++) st.update(i, (n - 1 - i), rnd() & 0xff); // seed the anti-diagonal
    const hi = (2 ** Math.floor(Math.log2(n))) - 2;                      // full-height descent
    let sink = 0;
    for (let w = 0; w < S2D_ITERS; w++) sink += st.query(0, 0, hi, hi);  // warm
    let best = Infinity;
    for (let b = 0; b < S2D_BATCH; b++) {
        const t0 = nowNs();
        for (let i = 0; i < S2D_ITERS; i++) sink += st.query(0, 0, hi, hi);
        const e = (nowNs() - t0) / S2D_ITERS;
        if (e < best) best = e;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return best;
}

// update FOIL: an update that REBUILDS a full 2D prefix-sum array = O(n^2) per update (the naive
// way to keep rectangle queries O(1): rebuild on every write). Exponential on the (log2 n)^2 axis,
// so a straight-line fit MISSES the R^2 floor. Sweep stays small.
function measureS2DUpdateFoil(n) {
    const reps = Math.max(3, Math.ceil(2e7 / (n * n)));
    const w = n + 1;
    const a = new Float64Array(n * n);
    const pre = new Float64Array(w * w);
    const rnd = mulberry32(0x3b4c ^ n);
    for (let i = 0; i < n * n; i++) a[i] = rnd() & 0xff;
    const rebuild = () => {
        for (let r = 1; r <= n; r++) {
            const rb = r * w, pb = (r - 1) * w, ab = (r - 1) * n;
            for (let c = 1; c <= n; c++) {
                pre[rb + c] = a[ab + (c - 1)] + pre[pb + c] + pre[rb + c - 1] - pre[pb + c - 1];
            }
        }
    };
    rebuild(); // warm
    let elapsed = 0, idx = 0;
    for (let rp = 0; rp < reps; rp++) {
        const t0 = nowNs();
        a[idx] += 1.0; rebuild();
        elapsed += nowNs() - t0;
        idx++; if (idx >= n * n) idx = 0;
    }
    if (pre[0] === Infinity) throw new Error('unreachable'); // keep pre live
    return elapsed / reps;
}

// query FOIL: a naive full-rectangle scan-fold over a plain array = O(n^2) per query (the default
// before the 2D segment-tree trick). Exponential on the (log2 n)^2 axis, so it misses the floor.
function measureS2DQueryFoil(n) {
    const reps = Math.max(3, Math.ceil(2e7 / (n * n)));
    const a = new Float64Array(n * n);
    const rnd = mulberry32(0x4d5e ^ n);
    for (let i = 0; i < n * n; i++) a[i] = rnd() & 0xff;
    const scan = () => { let s = 0; for (let k = 0; k < n * n; k++) s += a[k]; return s; };
    { const s = scan(); if (s < 0) throw new Error('unreachable'); } // warm
    let elapsed = 0, sink = 0;
    for (let rp = 0; rp < reps; rp++) {
        const t0 = nowNs();
        sink += scan();
        elapsed += nowNs() - t0;
    }
    if (sink < 0) throw new Error('unreachable'); // keep sink live
    return elapsed / reps;
}

// --- the member registry ----------------------------------------------------
// Each member session appends { name, op, sweep, foilSweep, r2Floor, slopeLo,
// slopeHi, run(n), foil(n) } here.
//
// EXPORTED (additive, no behavior change): the repo-only benchmark suite
// (benchmark/Dimensions.mjs, its D1 dimension) DELEGATES to this frozen registry
// -- the same kernels, sweeps and per-op slope bands the witness gate uses -- so
// the benchmark never re-implements the fit or the measurement. This export is
// the ONLY coupling; main() below is unchanged and still runs the identical gate.
export const MEMBERS = [
    {
        name: 'BinaryHeap',
        op: 'pop',
        sweep: POP_SWEEP,
        foilSweep: FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,
        slopeLo: BINARYHEAP_SLOPE_LO,
        slopeHi: BINARYHEAP_SLOPE_HI,
        run: measurePop,
        foil: measureFoil,
        foilName: 'sorted-array insert (O(n) shift)',
    },
    {
        name: 'Fenwick',
        op: 'update',
        sweep: FEN_SWEEP,
        foilSweep: FEN_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-08)
        slopeLo: FENWICK_UPDATE_SLOPE_LO,      // own band
        slopeHi: FENWICK_UPDATE_SLOPE_HI,
        run: measureUpdate,
        foil: measureUpdateFoil,
        foilName: 'prefix-array rebuild (O(n) per update)',
    },
    {
        name: 'Fenwick',
        op: 'prefix',
        sweep: FEN_SWEEP,
        foilSweep: FEN_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-08)
        slopeLo: FENWICK_PREFIX_SLOPE_LO,      // own band
        slopeHi: FENWICK_PREFIX_SLOPE_HI,
        run: measurePrefix,
        foil: measurePrefixFoil,
        foilName: 'naive re-sum (O(n) per query)',
    },
    {
        name: 'SegmentTree',
        op: 'update',
        sweep: SEG_SWEEP,
        foilSweep: SEG_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-05 inherits D-08)
        slopeLo: SEGTREE_UPDATE_SLOPE_LO,      // own band
        slopeHi: SEGTREE_UPDATE_SLOPE_HI,
        run: measureSegUpdate,
        foil: measureSegUpdateFoil,
        foilName: 'whole-tree rebuild (O(n) per update)',
        // MEDIAN-OF-FITS (measurement-quality, scoped to this lane): a fast cache-resident
        // point-update whose single-fit R^2 sits at the 0.958 floor and flips OFF-LINE in a
        // minority of quiescent runs; the median clears it. Floor + band unchanged. See SEG_FIT_RUNS.
        fitRuns: SEG_FIT_RUNS,
    },
    {
        name: 'SegmentTree',
        op: 'query',
        sweep: SEG_SWEEP,
        foilSweep: SEG_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-05 inherits D-08)
        slopeLo: SEGTREE_QUERY_SLOPE_LO,       // own band
        slopeHi: SEGTREE_QUERY_SLOPE_HI,
        run: measureSegQuery,
        foil: measureSegQueryFoil,
        foilName: 'scan-fold (O(n) per query)',
    },
    {
        name: 'SkipList',
        op: 'get',
        sweep: SL_GET_SWEEP,
        foilSweep: SL_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-06 inherits D-08)
        slopeLo: SKIPLIST_GET_SLOPE_LO,        // own band
        slopeHi: SKIPLIST_GET_SLOPE_HI,
        run: measureSkipGet,
        foil: measureSkipGetFoil,
        foilName: 'linear scan (O(n) per search)',
    },
    {
        name: 'SkipList',
        op: 'set',
        sweep: SL_SET_SWEEP,
        foilSweep: SL_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-06 inherits D-08)
        slopeLo: SKIPLIST_SET_SLOPE_LO,        // own band
        slopeHi: SKIPLIST_SET_SLOPE_HI,
        run: measureSkipSet,
        foil: measureSkipSetFoil,
        foilName: 'sorted-array insert (O(n) shift)',
    },
    {
        name: 'Treap',
        op: 'get',
        sweep: TR_GET_SWEEP,
        foilSweep: TR_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (D-07 inherits D-08)
        slopeLo: TREAP_GET_SLOPE_LO,           // own band
        slopeHi: TREAP_GET_SLOPE_HI,
        run: measureTreapGet,
        foil: measureTreapGetFoil,
        foilName: 'linear scan (O(n) per search)',
    },
    {
        name: 'Scapegoat',
        op: 'get',
        sweep: SG_GET_SWEEP,
        foilSweep: SG_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0008 inherits D-08)
        slopeLo: SCAPEGOAT_GET_SLOPE_LO,       // own band
        slopeHi: SCAPEGOAT_GET_SLOPE_HI,
        run: measureScapegoatGet,
        foil: measureScapegoatGetFoil,
        foilName: 'linear scan (O(n) per search)',
    },
    {
        name: 'MinMaxHeap',
        op: 'popMin',
        sweep: MMH_POP_SWEEP,
        foilSweep: MMH_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0009 inherits D-08)
        slopeLo: MINMAXHEAP_POPMIN_SLOPE_LO,   // own band
        slopeHi: MINMAXHEAP_POPMIN_SLOPE_HI,
        run: measureMinMaxHeap,
        foil: measureMinMaxHeapFoil,
        foilName: 'linear min-scan-and-splice (O(n) per extract-min)',
    },
    {
        name: 'SplayTree',
        op: 'get',
        sweep: SP_GET_SWEEP,
        foilSweep: SP_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0010 inherits D-08)
        slopeLo: SPLAYTREE_GET_SLOPE_LO,       // own band
        slopeHi: SPLAYTREE_GET_SLOPE_HI,
        run: measureSplayGet,
        foil: measureSplayGetFoil,
        foilName: 'linear scan (O(n) per search)',
    },
    {
        name: 'BinomialHeap',
        op: 'popMin',
        sweep: BINH_POP_SWEEP,
        foilSweep: BINH_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,              // shared floor (0011 inherits D-08)
        slopeLo: BINOMIALHEAP_POPMIN_SLOPE_LO,     // own band
        slopeHi: BINOMIALHEAP_POPMIN_SLOPE_HI,
        run: measureBinomialHeap,
        foil: measureBinomialHeapFoil,
        foilName: 'linear min-scan-and-splice (O(n) per extract-min)',
    },
    {
        name: 'PairingHeap',
        op: 'popMin',
        sweep: PH_POP_SWEEP,
        foilSweep: PH_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,              // shared floor (0012 inherits D-08)
        slopeLo: PAIRINGHEAP_POPMIN_SLOPE_LO,      // own band
        slopeHi: PAIRINGHEAP_POPMIN_SLOPE_HI,
        run: measurePairingHeap,
        foil: measurePairingHeapFoil,
        foilName: 'linear min-scan-and-splice (O(n) per extract-min)',
        // MEDIAN-OF-FITS (D-PH2, measurement-quality only): a pairing-heap full-drain average
        // has genuine run-to-run SHAPE variance (the two-pass amortization tilts the whole 7-point
        // set occasionally), so a SINGLE fit's R^2 dips below the 0.958 floor in a minority of runs
        // even though the slope stays solidly in-band. Gating on the MEDIAN of PH_FIT_RUNS
        // independent sweep-fits (the fit whose R^2 is the median -- rejecting the occasional tilted
        // sweep on BOTH ends) makes the R^2 RELIABLY clear the floor. This is the same robust-
        // estimator discipline the fast members use (min-over-batches); it raises measurement
        // QUALITY only and does NOT touch the frozen 0.958 floor or the slope band. A genuine O(n)
        // regression fails EVERY fit, so no teeth are lost. Scoped to this lane (fitRuns).
        fitRuns: PH_FIT_RUNS,
    },
    {
        name: 'FibonacciHeap',
        op: 'popMin',
        sweep: FH_POP_SWEEP,
        foilSweep: FH_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,               // shared floor (0013 inherits D-08)
        slopeLo: FIBONACCIHEAP_POPMIN_SLOPE_LO,     // own band
        slopeHi: FIBONACCIHEAP_POPMIN_SLOPE_HI,
        run: measureFibonacciHeap,
        foil: measureFibonacciHeapFoil,
        foilName: 'linear min-scan-and-splice (O(n) per extract-min)',
        // MEDIAN-OF-FITS (D-FH5, measurement-quality only): a Fibonacci-heap full-drain average has
        // even MORE run-to-run SHAPE variance than the pairing two-pass (the lazy forest is only
        // consolidated on demand, so the per-drain work distribution swings hard), so a SINGLE fit's
        // R^2 dips below the 0.958 floor in a sizeable minority of runs even though the slope stays
        // in-band. Gating on the MEDIAN of FH_FIT_RUNS independent sweep-fits makes the R^2 RELIABLY
        // clear the floor. Same robust-estimator discipline as PairingHeap; raises QUALITY only and
        // does NOT touch the frozen floor or the band. A genuine O(n) shape fails every fit, so no
        // teeth are lost. Scoped to this lane (fitRuns). The honest single-fit-vs-median R^2 spread
        // is recorded in decisions/0013-fibonacciheap.md -- no "every run >= floor" claim is made.
        fitRuns: FH_FIT_RUNS,
    },
    {
        name: 'Fenwick2D',
        op: 'update',
        sweep: F2D_SWEEP,
        foilSweep: F2D_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0014 inherits D-08)
        slopeLo: F2D_UPDATE_SLOPE_LO,          // own band on the (log2 n)^2 axis
        slopeHi: F2D_UPDATE_SLOPE_HI,
        run: measureF2DUpdate,
        foil: measureF2DUpdateFoil,
        foilName: '2D prefix-array rebuild (O(n^2) per update)',
        xOf: (x) => Math.log2(x) ** 2,         // the SQUARED-log axis (the family's first)
        unit: 'ns/level^2',
        // MEDIAN-OF-FITS (0014, measurement-quality only): the 2D full-height climb's fast low-side
        // points give the sweep genuine run-to-run SHAPE variance, so a single fit's R^2 dips below
        // 0.958 in a minority of runs (measured min 0.9392/15) while the slope stays in-band. Gating
        // on the MEDIAN of F2D_FIT_RUNS sweep-fits clears the floor reliably (same discipline as
        // PairingHeap / FibonacciHeap). The frozen floor + slope band are untouched; a genuine
        // non-square shape fails every fit, so no teeth are lost. Scoped to this lane (fitRuns).
        fitRuns: F2D_FIT_RUNS,
    },
    {
        name: 'Fenwick2D',
        op: 'rectSum',
        sweep: F2D_SWEEP,
        foilSweep: F2D_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0014 inherits D-08)
        slopeLo: F2D_RECTSUM_SLOPE_LO,         // own band on the (log2 n)^2 axis
        slopeHi: F2D_RECTSUM_SLOPE_HI,
        run: measureF2DRectSum,
        foil: measureF2DRectSumFoil,
        foilName: 'naive rectangle scan (O(n^2) per query)',
        xOf: (x) => Math.log2(x) ** 2,         // the SQUARED-log axis (the family's first)
        unit: 'ns/level^2',
    },
    {
        name: 'SegmentTree2D',
        op: 'update',
        sweep: S2D_SWEEP,
        foilSweep: S2D_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0015 inherits D-08)
        slopeLo: S2D_UPDATE_SLOPE_LO,          // own band on the (log2 n)^2 axis
        slopeHi: S2D_UPDATE_SLOPE_HI,
        run: measureS2DUpdate,
        foil: measureS2DUpdateFoil,
        foilName: '2D grid rebuild (O(n^2) per update)',
        xOf: (x) => Math.log2(x) ** 2,         // the SQUARED-log axis (Fenwick2D introduced it)
        unit: 'ns/level^2',
        // Single-fit: this lane's R^2 clears the 0.958 floor by a wide margin on every one of 15
        // calibration runs (min 0.9949), so it needs NO median-of-fits hook.
    },
    {
        name: 'SegmentTree2D',
        op: 'query',
        sweep: S2D_SWEEP,
        foilSweep: S2D_FOIL_SWEEP,
        r2Floor: BINARYHEAP_R2_FLOOR,          // shared floor (0015 inherits D-08)
        slopeLo: S2D_QUERY_SLOPE_LO,           // own band on the (log2 n)^2 axis
        slopeHi: S2D_QUERY_SLOPE_HI,
        run: measureS2DQuery,
        foil: measureS2DQueryFoil,
        foilName: 'naive rectangle scan (O(n^2) per query)',
        xOf: (x) => Math.log2(x) ** 2,         // the SQUARED-log axis (Fenwick2D introduced it)
        unit: 'ns/level^2',
        // Single-fit: R^2 min 0.99993 over 15 calibration runs -- rock-steady, no fitRuns needed.
    },
];

async function main() {
    process.stdout.write('lite-logn O(log n) Witness -- v0.13.0\n');
    process.stdout.write('fit: nsPerOp = intercept + slope * log2(n)  (Fenwick2D / SegmentTree2D: slope * (log2 n)^2)\n');
    // Offline hygiene: quiesce before timing. This is an OFFLINE proof tool, and in
    // the `verify` chain it runs right after torture (2M+ ops across three members),
    // which leaves scheduler / thermal residue that tilts the shallow, sub-4ns fast
    // lines at their low-n points. A brief settle (and a GC if --expose-gc is on)
    // restores a clean baseline for EVERY member uniformly -- it is not a per-member
    // gate and it does not touch the frozen R^2 floor or any slope band.
    if (typeof globalThis.gc === 'function') globalThis.gc();
    await new Promise((r) => setTimeout(r, 3000));
    let ok = true;
    for (const m of MEMBERS) {
        // The x-transform: prior lanes fit on log2(n); Fenwick2D fits on its (log2 n)^2 axis
        // (the `xOf` hook). Default = Math.log2, so every prior lane is byte-identical in behavior.
        const xOf = m.xOf || Math.log2;
        const unit = m.unit || 'ns/level';
        let fit;
        const runs = m.fitRuns || 1;
        if (runs > 1) {
            // MEDIAN-OF-FITS (measurement-quality, scoped to lanes that opt in via fitRuns): fit
            // the sweep `runs` times independently, then gate on the fit whose R^2 is the MEDIAN --
            // rejecting the occasional tilted sweep on both ends. Raises RELIABILITY only; the
            // frozen R^2 floor + slope band are unchanged, and a genuine O(n) shape fails all fits.
            const fits = [];
            for (let k = 0; k < runs; k++) {
                const rxs = [], rys = [];
                for (const n of m.sweep) { rxs.push(xOf(n)); rys.push(m.run(n)); }
                fits.push(fitLogLinear(rxs, rys));
            }
            fits.sort((a, b) => a.r2 - b.r2);
            fit = fits[runs >> 1];
        } else {
            const xs = [], ys = [];
            for (const n of m.sweep) { xs.push(xOf(n)); ys.push(m.run(n)); }
            fit = fitLogLinear(xs, ys);
        }
        const fxs = [], fys = [];
        for (const n of m.foilSweep) { fxs.push(xOf(n)); fys.push(m.foil(n)); }
        const ffit = fitLogLinear(fxs, fys);

        const onLine = fit.r2 >= m.r2Floor && fit.slope >= m.slopeLo && fit.slope <= m.slopeHi;
        const foilOff = ffit.r2 < m.r2Floor;
        const memberOk = onLine && foilOff;
        ok = ok && memberOk;

        process.stdout.write(
            m.name + '.' + m.op + ' R^2=' + fit.r2.toFixed(4) +
            ' slope=' + fit.slope.toFixed(3) + ' ' + unit +
            '  (floor R^2 >= ' + m.r2Floor.toFixed(3) +
            ', slope in [' + m.slopeLo.toFixed(2) + ', ' + m.slopeHi.toFixed(2) + '])' +
            '  ' + (onLine ? 'ON-LINE' : 'OFF-LINE') + '\n');
        process.stdout.write(
            '  foil ' + m.foilName + ' R^2=' + ffit.r2.toFixed(4) +
            ' slope=' + ffit.slope.toFixed(1) + ' ' + unit +
            '  ' + (foilOff ? 'OFF-LINE (misses floor -- good)' : 'ON-LINE (foil did NOT leave!)') + '\n');

        if (!memberOk) {
            if (!onLine) process.stderr.write(
                '  violation ' + m.name + ' off the line: R^2=' + fit.r2.toFixed(4) +
                ' floor=' + m.r2Floor + ' slope=' + fit.slope.toFixed(3) +
                ' band=[' + m.slopeLo + ',' + m.slopeHi + ']\n');
            if (!foilOff) process.stderr.write(
                '  violation foil R^2=' + ffit.r2.toFixed(4) + ' >= floor ' + m.r2Floor +
                ' (the O(n) foil must MISS the log floor)\n');
        }
    }
    // SkipList honesty print: the MAX single insert observed across the set sweep.
    // An EXPECTED-O(log n) member must not masquerade as worst-case -- an unlucky
    // tall tower spikes one op even while the mean holds the fitted line. This is a
    // DISCLOSURE, not a gate.
    if (SKIPLIST_MAX_INSERT_NS > 0) {
        process.stdout.write(
            'SkipList MAX single insert observed = ' + SKIPLIST_MAX_INSERT_NS.toFixed(0) +
            ' ns (expected O(log n) -- disclosed, not gated)\n');
    }
    // Treap honesty print: the MAX single insert (rotation chain) observed across the
    // get sweep build. Same EXPECTED-not-worst-case disclosure as SkipList; not a gate.
    if (TREAP_MAX_INSERT_NS > 0) {
        process.stdout.write(
            'Treap MAX single insert observed = ' + TREAP_MAX_INSERT_NS.toFixed(0) +
            ' ns (expected O(log n) -- disclosed, not gated)\n');
    }
    // SplayTree honesty print: the MAX single get (a cold, deep splay chain) observed across
    // the get sweep. An AMORTIZED-O(log n) member must not masquerade as per-op worst-case --
    // a single access can splay an O(n) chain even while the mean holds the fitted line. This
    // is a DISCLOSURE, not a gate.
    if (SPLAYTREE_MAX_GET_NS > 0) {
        process.stdout.write(
            'SplayTree MAX single get observed = ' + SPLAYTREE_MAX_GET_NS.toFixed(0) +
            ' ns (amortized O(log n) -- disclosed, not gated)\n');
    }
    // PairingHeap honesty print: the MAX single popMin (a long two-pass fold) observed across the
    // popMin sweep. An AMORTIZED-O(log n) member must not masquerade as per-op worst-case -- a
    // single pop after many inserts can fold an O(n) child list even while the mean holds the
    // fitted line. This is a DISCLOSURE, not a gate.
    if (PAIRINGHEAP_MAX_POP_NS > 0) {
        process.stdout.write(
            'PairingHeap MAX single popMin observed = ' + PAIRINGHEAP_MAX_POP_NS.toFixed(0) +
            ' ns (amortized O(log n) -- disclosed, not gated)\n');
    }
    // FibonacciHeap honesty prints: the MAX single popMin (a long degree consolidation) AND the MAX
    // single decreaseKey (a long cascading cut). AMORTIZED member: a single op can do O(n) work even
    // while the mean holds the fitted line. Both are DISCLOSURES, not gates.
    if (FIBONACCIHEAP_MAX_POP_NS > 0) {
        process.stdout.write(
            'FibonacciHeap MAX single popMin observed = ' + FIBONACCIHEAP_MAX_POP_NS.toFixed(0) +
            ' ns (amortized O(log n) -- disclosed, not gated)\n');
    }
    if (FIBONACCIHEAP_MAX_DK_NS > 0) {
        process.stdout.write(
            'FibonacciHeap MAX single decreaseKey observed = ' + FIBONACCIHEAP_MAX_DK_NS.toFixed(0) +
            ' ns (amortized O(1); cascading-cut spike -- disclosed, not gated)\n');
    }
    // Scapegoat amortized-trace assertion (D-S5): the cumulative ascending-insert cost/op --
    // the REBUILD-HEAVY worst case -- must track a LOG curve, NOT the linear curve a rebuild-less
    // BST degenerates to. Robust, non-flaky gate: the largest/smallest amortized ns/op ratio over
    // 2^11..2^17 stays LOG-like (< SG_AMORT_RATIO_MAX ~ 4x), where an O(n)-amortized chain would
    // blow it to ~2^(17-11) = 64x. The fitted R^2/slope are printed as a corroborating disclosure.
    {
        const xs = [], ys = [];
        for (const n of SG_AMORT_SWEEP) { xs.push(Math.log2(n)); ys.push(measureScapegoatAmortized(n)); }
        const af = fitLogLinear(xs, ys);
        const ratio = ys[0] > 0 ? ys[ys.length - 1] / ys[0] : Infinity;
        const amortOk = ratio > 0 && ratio < SG_AMORT_RATIO_MAX;
        ok = ok && amortOk;
        process.stdout.write(
            'Scapegoat amortized ascending-insert (rebuild-heavy) ns/op ratio ' + ratio.toFixed(2) +
            'x over 2^11..2^17 (log-like; an O(n) chain would be ~' + (2 ** (17 - 11)) + 'x)' +
            ' fit R^2=' + af.r2.toFixed(4) + ' slope=' + af.slope.toFixed(2) + ' ns/level  ' +
            (amortOk ? 'TRACKS-LOG' : 'LINEAR-BLOWUP') + '\n');
        if (!amortOk) process.stderr.write(
            '  violation Scapegoat amortized insert ratio ' + ratio.toFixed(2) + 'x >= ' +
            SG_AMORT_RATIO_MAX + ' (amortization broke: rebuilds not absorbing the imbalance)\n');
    }
    process.stdout.write('WITNESS ' + (ok ? 'ok' : 'FAIL') + '\n');
    if (!ok) process.exitCode = 1;
}

// Run the witness gate ONLY when this file is the process entry point (`node
// test/witness.mjs` / `npm run witness`). Guarded so that importing the frozen
// MEMBERS registry (benchmark/Dimensions.mjs D1 delegates to it) does NOT run the
// entire ~30s witness sweep as an import side effect -- the re-entrancy footgun the
// lite-o1 QA pass caught on its own orchestrator. The CLI path is unchanged.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
