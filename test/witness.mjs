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

import { BinaryHeap, Fenwick } from '../LogN.js';

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
const FEN_ITERS = 400000;  // hammered ops per timed batch
const FEN_BATCH = 8;       // min-over-batches: the MIN filters interference (only
                           // ambient noise ADDS time, so the min is the cleanest
                           // per-op signal -- the same asymmetry measureAllocs uses)

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

// --- the member registry ----------------------------------------------------
// Each member session appends { name, op, sweep, foilSweep, r2Floor, slopeLo,
// slopeHi, run(n), foil(n) } here.
const MEMBERS = [
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
];

function main() {
    process.stdout.write('lite-logn O(log n) Witness -- v0.2.0\n');
    process.stdout.write('fit: nsPerOp = intercept + slope * log2(n)\n');
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
    process.stdout.write('WITNESS ' + (ok ? 'ok' : 'FAIL') + '\n');
    if (!ok) process.exitCode = 1;
}

main();
