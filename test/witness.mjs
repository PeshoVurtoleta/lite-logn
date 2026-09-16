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
 * v0.1.0 is the SCAFFOLD release: the fit machinery (least-squares log-linear
 * R^2 + slope) and a reference O(n) foil are in place, but there is NO member to
 * fit, so the harness runs GREEN and EMPTY and gates NOTHING. The R^2 floor +
 * slope band are DELIBERATELY not set here: they are calibrated empirically in
 * the BinaryHeap session (decision D-02) and become the shared FAMILY gate every
 * later member inherits. This is an OFFLINE proof tool, never a hot-path
 * dependency.
 */

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

// --- the member registry ----------------------------------------------------
// Each member session appends { name, band, run(n) -> { nsPerOp, maxNs },
// foil(n) -> nsPerOp } here. Empty at v0.1.0 -- nothing to fit.
const MEMBERS = [];

function main() {
    process.stdout.write('lite-logn O(log n) Witness -- v0.1.0 (scaffold)\n');
    process.stdout.write('fit: nsPerOp = intercept + slope * log2(n)\n');
    if (MEMBERS.length === 0) {
        process.stdout.write(
            'WITNESS members=0 -- no member to fit yet (scaffold); ' +
            'R^2 floor + slope band are calibrated in BinaryHeap (D-02). ok\n');
        return;
    }
    // BinaryHeap fills this loop: sweep, fit, gate R^2 >= floor && slope in band,
    // assert the foil misses the floor, print MAX single-op for amortized members.
    let ok = true;
    for (const m of MEMBERS) {
        const xs = [], ys = [];
        for (const n of WITNESS_NS) { xs.push(Math.log2(n)); ys.push(m.run(n).nsPerOp); }
        const fit = fitLogLinear(xs, ys);
        process.stdout.write(
            m.name + ' R^2=' + fit.r2.toFixed(4) + ' slope=' + fit.slope.toFixed(3) + ' ns/level\n');
        // gate wiring lands with D-02; scaffold does not gate
        void fit; void ok;
    }
    process.stdout.write('WITNESS ok\n');
}

main();
