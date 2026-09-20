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

import { BinaryHeap, Fenwick, SegmentTree, SkipList, Treap, Scapegoat } from '../LogN.js';
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
];

async function main() {
    process.stdout.write('lite-logn O(log n) Witness -- v0.6.0\n');
    process.stdout.write('fit: nsPerOp = intercept + slope * log2(n)\n');
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
        const xs = [], ys = [];
        for (const n of m.sweep) { xs.push(Math.log2(n)); ys.push(m.run(n)); }
        const fit = fitLogLinear(xs, ys);
        const fxs = [], fys = [];
        for (const n of m.foilSweep) { fxs.push(Math.log2(n)); fys.push(m.foil(n)); }
        const ffit = fitLogLinear(fxs, fys);

        const onLine = fit.r2 >= m.r2Floor && fit.slope >= m.slopeLo && fit.slope <= m.slopeHi;
        const foilOff = ffit.r2 < m.r2Floor;
        const memberOk = onLine && foilOff;
        ok = ok && memberOk;

        process.stdout.write(
            m.name + '.' + m.op + ' R^2=' + fit.r2.toFixed(4) +
            ' slope=' + fit.slope.toFixed(3) + ' ns/level' +
            '  (floor R^2 >= ' + m.r2Floor.toFixed(3) +
            ', slope in [' + m.slopeLo.toFixed(2) + ', ' + m.slopeHi.toFixed(2) + '])' +
            '  ' + (onLine ? 'ON-LINE' : 'OFF-LINE') + '\n');
        process.stdout.write(
            '  foil ' + m.foilName + ' R^2=' + ffit.r2.toFixed(4) +
            ' slope=' + ffit.slope.toFixed(1) + ' ns/level' +
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
