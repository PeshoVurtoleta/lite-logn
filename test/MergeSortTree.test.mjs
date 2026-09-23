/**
 * @zakkster/lite-logn -- MergeSortTree behavioral + differential suite (node:test).
 *
 * The sixteenth member's contract -- the family's SECOND static / immutable member (a build-once
 * merge sort tree for offline range-rank): countLE(lo, hi, x) counts stored values <= x in the
 * INDEX range [lo, hi] in O(log^2 n), and rangeCount(lo, hi, vlo, vhi) counts a VALUE-window --
 * proven against a brute-force scan oracle and by white-box structural checks:
 *   - surface (build factory + ctor; length / size / cells getters);
 *   - countLE vs a brute [lo,hi] scan over 5000 random queries per n in {1,2,3,257,512}, incl
 *     all-equal / heavy-dupe / x-outside-the-value-range edges = 0 divergences;
 *   - rangeCount vs a brute value-window scan (inclusive, exact for floats + negatives + -0);
 *   - every node run is SORTED at all ceil(log2 n)+1 levels (the packed table invariant);
 *   - cells = (ceil(log2 n)+1)*n exactly; length / size agree;
 *   - STATIC immutability: mutating the caller's source array after build does NOT change results.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MergeSortTree } from '../LogN.js';

// mulberry32 -- deterministic PRNG so the differential sweep is reproducible.
function mul(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- surface ----------------------------------------------------------------

test('surface: build factory + ctor produce an instance with length / size / cells getters', () => {
    const a = MergeSortTree.build([5, 3, 9, 1, 7]);
    const b = new MergeSortTree([5, 3, 9, 1, 7]);
    assert.equal(a.length, 5);
    assert.equal(a.size, 5);
    assert.equal(b.length, 5);
    assert.equal(typeof a.countLE, 'function');
    assert.equal(typeof a.rangeCount, 'function');
    // cells = (ceil(log2 5)+1)*5 = (3+1)*5 = 20
    assert.equal(a.cells, 20);
    assert.equal(b.cells, 20);
});

test('cells = (ceil(log2 n)+1)*n exactly across sizes', () => {
    const H = (n) => { let h = 0; while (2 ** h < n) h++; return h; };
    for (const n of [1, 2, 3, 4, 5, 8, 9, 16, 17, 257, 512, 1000, 1024]) {
        const vals = new Array(n).fill(0).map((_, i) => i);
        const t = MergeSortTree.build(vals);
        assert.equal(t.cells, (H(n) + 1) * n, 'cells n=' + n);
        assert.equal(t.length, n);
    }
});

// --- differential: countLE vs a brute [lo,hi] scan --------------------------

test('countLE matches a brute [lo,hi] scan over 5000 random queries per n (incl edges)', () => {
    for (const n of [1, 2, 3, 5, 257, 512, 1000]) {
        const rnd = mul(0xC0FFEE ^ n);
        // A value distribution with heavy duplicates (mod 50) so ties and x-outside-the-range are hit.
        const vals = new Array(n);
        for (let i = 0; i < n; i++) vals[i] = ((rnd() * 50) | 0) - 10; // range ~[-10, 39], includes negatives
        const t = MergeSortTree.build(vals);
        const q = mul(0xBEEF ^ n);
        for (let it = 0; it < 5000; it++) {
            let lo = (q() * n) | 0, hi = (q() * n) | 0;
            if (lo > hi) { const tmp = lo; lo = hi; hi = tmp; }
            if (hi >= n) hi = n - 1;
            if (lo > hi) lo = hi;
            // x sweeps below, inside, and above the value range.
            const x = ((q() * 70) | 0) - 25;
            let brute = 0;
            for (let i = lo; i <= hi; i++) if (vals[i] <= x) brute++;
            assert.equal(t.countLE(lo, hi, x), brute,
                'countLE n=' + n + ' lo=' + lo + ' hi=' + hi + ' x=' + x);
        }
    }
});

test('countLE edge: all-equal values, x exactly equal / just below / just above', () => {
    const n = 300;
    const vals = new Array(n).fill(7);
    const t = MergeSortTree.build(vals);
    assert.equal(t.countLE(0, n - 1, 7), n);      // <= equal counts all
    assert.equal(t.countLE(0, n - 1, 6.999), 0);  // just below -> none
    assert.equal(t.countLE(0, n - 1, 7.001), n);  // just above -> all
    assert.equal(t.countLE(10, 20, 7), 11);       // a sub-range, inclusive
    assert.equal(t.countLE(0, n - 1, Infinity), n);   // +Inf threshold -> all
    assert.equal(t.countLE(0, n - 1, -Infinity), 0);  // -Inf threshold -> none
});

test('countLE point query [i,i] returns 0 or 1 exactly', () => {
    const vals = [5, 3, 9, 1, 7, 2, 8];
    const t = MergeSortTree.build(vals);
    for (let i = 0; i < vals.length; i++) {
        assert.equal(t.countLE(i, i, vals[i]), 1, 'i<=self');
        assert.equal(t.countLE(i, i, vals[i] - 0.5), 0, 'i strictly less');
    }
});

// --- differential: rangeCount vs a brute value-window scan ------------------

test('rangeCount matches a brute value-window scan over 5000 random queries per n', () => {
    for (const n of [1, 2, 3, 5, 257, 512, 1000]) {
        const rnd = mul(0xF00D ^ n);
        const vals = new Array(n);
        for (let i = 0; i < n; i++) vals[i] = ((rnd() * 50) | 0) - 10;
        const t = MergeSortTree.build(vals);
        const q = mul(0x1DEA ^ n);
        for (let it = 0; it < 5000; it++) {
            let lo = (q() * n) | 0, hi = (q() * n) | 0;
            if (lo > hi) { const tmp = lo; lo = hi; hi = tmp; }
            if (hi >= n) hi = n - 1;
            if (lo > hi) lo = hi;
            let vlo = ((q() * 70) | 0) - 25, vhi = ((q() * 70) | 0) - 25;
            if (vlo > vhi) { const tmp = vlo; vlo = vhi; vhi = tmp; }
            let brute = 0;
            for (let i = lo; i <= hi; i++) if (vals[i] >= vlo && vals[i] <= vhi) brute++;
            assert.equal(t.rangeCount(lo, hi, vlo, vhi), brute,
                'rangeCount n=' + n + ' lo=' + lo + ' hi=' + hi + ' vlo=' + vlo + ' vhi=' + vhi);
        }
    }
});

test('rangeCount with float bounds is exact (inclusive window, no off-by-one on ties)', () => {
    const vals = [1, 2, 2, 2, 3, 5, 5, 8];
    const t = MergeSortTree.build(vals);
    assert.equal(t.rangeCount(0, 7, 2, 2), 3);       // exactly the three 2s
    assert.equal(t.rangeCount(0, 7, 2, 5), 6);       // 2,2,2,3,5,5
    assert.equal(t.rangeCount(0, 7, 1.5, 2.5), 3);   // float window around the 2s
    assert.equal(t.rangeCount(0, 7, 5, 5), 2);       // the two 5s
    assert.equal(t.rangeCount(0, 7, -100, 100), 8);  // everything
    assert.equal(t.rangeCount(0, 7, 9, 100), 0);     // above the max
});

test('-0 and 0 are the same legal value (null is not zero)', () => {
    const t = MergeSortTree.build([-0, 0, 1, -1]);
    assert.equal(t.countLE(0, 3, 0), 3);       // -0, 0, -1 are all <= 0
    assert.equal(t.rangeCount(0, 3, 0, 0), 2); // both zeros in [0,0]
});

// --- white-box: every node run is SORTED at all ceil(log2 n)+1 levels --------

test('every node run is sorted ascending at all ceil(log2 n)+1 levels (packed table invariant)', () => {
    for (const n of [1, 2, 3, 5, 8, 13, 257, 512]) {
        const rnd = mul(0xABCD ^ n);
        const vals = new Array(n);
        for (let i = 0; i < n; i++) vals[i] = (rnd() * 1000) | 0;
        const t = MergeSortTree.build(vals);
        let H = 0; while (2 ** H < n) H++;
        const T = t._t, m = t._m;
        let levelsChecked = 0;
        for (let d = 0; d <= H; d++) {
            const base = d * n;
            const w = 2 ** (H - d);
            // Each node covers real range [lo, hi); its run at [base+lo, base+hi) must be ascending,
            // AND must be a permutation of the source values in that index range.
            for (let lo = 0; lo < n; lo += w) {
                const hi = Math.min(lo + w, n);
                for (let i = base + lo + 1; i < base + hi; i++) {
                    assert.ok(T[i - 1] <= T[i], 'run not sorted at level ' + d + ' n=' + n);
                }
                // multiset match against the source slice
                const runSorted = Array.from(T.slice(base + lo, base + hi)).sort((a, b) => a - b);
                const srcSorted = vals.slice(lo, hi).sort((a, b) => a - b);
                assert.deepEqual(runSorted, srcSorted, 'run != source slice at level ' + d + ' n=' + n);
            }
            levelsChecked++;
        }
        assert.equal(levelsChecked, H + 1, 'must have checked all ceil(log2 n)+1 levels for n=' + n);
    }
});

// --- STATIC immutability -----------------------------------------------------

test('mutating the caller source after build does NOT change results (independent copy)', () => {
    const src = [5, 3, 9, 1, 7, 2];
    const t = MergeSortTree.build(src);
    const beforeLE = t.countLE(0, 5, 4);
    const beforeRC = t.rangeCount(0, 5, 2, 7);
    // Scramble the caller's array in every way.
    src[0] = 999; src[1] = -999; src.length = 3; src.push(NaN);
    assert.equal(t.countLE(0, 5, 4), beforeLE, 'countLE unchanged after source mutation');
    assert.equal(t.rangeCount(0, 5, 2, 7), beforeRC, 'rangeCount unchanged after source mutation');
    assert.equal(t.length, 6, 'length unchanged after source mutation');
});

test('accepts a typed-array source (array-like of finite numbers)', () => {
    const t = MergeSortTree.build(Float64Array.of(4, 2, 6, 1, 8, 3));
    assert.equal(t.countLE(0, 5, 4), 4); // 4,2,1,3
    assert.equal(t.rangeCount(1, 4, 2, 6), 2); // indices 1..4: 2,6,1,8 -> 2,6 in [2,6]
});

// --- adversarial: in-place mutation of a Float64Array source (no zero-copy alias) -----------

test('adversarial: mutating a Float64Array source IN-PLACE after build (no .length trick, same' +
    ' buffer bytes rewritten) does NOT change results -- proves the leaf table is a genuine byte' +
    ' copy, not an aliased view onto the caller-owned buffer', () => {
    const src = Float64Array.of(4, 2, 6, 1, 8, 3, 7, 5);
    const t = MergeSortTree.build(src);
    const before = [];
    for (let lo = 0; lo < 8; lo++) before.push(t.countLE(lo, 7, 4.5));
    // Rewrite every element of the SAME typed array in place (a plain-array .length= truncation
    // cannot touch a Float64Array; this is the adversarial vector a naive zero-copy fast path for
    // "the input is already the right typed array" would leak through).
    for (let i = 0; i < src.length; i++) src[i] = 999 - i;
    assert.notDeepEqual(Array.from(src), [4, 2, 6, 1, 8, 3, 7, 5], 'sanity: source really mutated');
    for (let lo = 0; lo < 8; lo++) {
        assert.equal(t.countLE(lo, 7, 4.5), before[lo], 'countLE lo=' + lo + ' must be unaffected');
    }
    assert.equal(t.rangeCount(0, 7, 1, 6), 6, 'rangeCount over the ORIGINAL values, unaffected');
    // The backing table's buffer must never be identity-equal to the source's buffer.
    assert.notEqual(t._t.buffer, src.buffer, 'internal table must not alias the source ArrayBuffer');
});
