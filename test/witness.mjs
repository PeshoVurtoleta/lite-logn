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

import { BinaryHeap } from '../LogN.js';

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

// Gated pop sweep: pinned to the steady band (L1 micro-floor below and the
// memory wall above ~1e6 both flake the fit). The foil sweep stays where an
// O(n^2) sorted-array build is affordable.
const POP_SWEEP = [1e4, 3e4, 1e5, 3e5, 1e6];
const FOIL_SWEEP = [1e3, 2e3, 4e3, 8e3, 1.6e4, 3.2e4];

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
];

function main() {
    process.stdout.write('lite-logn O(log n) Witness -- v0.1.0\n');
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
