/**
 * @zakkster/lite-logn -- WaveletTree (v1.1.0) behavioral suite.
 *
 * The family's 17th member and FIRST post-1.0 exotic: a STATIC, IMMUTABLE wavelet matrix answering
 * access / rank / select / quantile (range k-th-smallest) / rangeCount (value-window count) over a
 * fixed, coordinate-compressed sequence, all zero-allocation. Every op is proven against a brute-force
 * recompute over a plain array (the ground truth), plus every fail-closed door. select's UPWARD inverse
 * navigation gets its own dedicated oracle (the one non-symmetric descent the plan flagged).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WaveletTree } from '../LogN.js';

// mulberry32 -- a small deterministic PRNG so the fuzz corpus is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- construction + getters -------------------------------------------------

test('WaveletTree build: length / size / levels / bits / distinct reflect the source + compression', () => {
    const wt = new WaveletTree([5, 1, 5, 3, 1, 9, 3, 3]);
    assert.equal(wt.length, 8);
    assert.equal(wt.size, 8);
    assert.equal(wt.distinct, 4);            // {1, 3, 5, 9}
    assert.equal(wt.levels, 2);              // ceil(log2 4)
    assert.equal(wt.bits, 16);               // n * levels = 8 * 2
    // both the ctor and the static factory build an equivalent structure
    const wb = WaveletTree.build([5, 1, 5, 3, 1, 9, 3, 3]);
    assert.equal(wb.access(0), 5);
    assert.equal(wb.access(5), 9);
});

test('WaveletTree build: copies a SNAPSHOT (mutating the source array afterward never changes a result)', () => {
    const src = [4, 2, 7, 1];
    const wt = new WaveletTree(src);
    src[0] = 99; src[3] = -1;
    assert.equal(wt.access(0), 4);
    assert.equal(wt.access(3), 1);
    assert.equal(wt.quantile(0, 3, 0), 1);   // smallest is still 1
});

test('WaveletTree build: accepts a typed array and preserves negatives / non-integers / duplicates', () => {
    const wt = new WaveletTree(Float64Array.from([-2.5, -2.5, 0, 3.25, -2.5]));
    assert.equal(wt.distinct, 3);            // {-2.5, 0, 3.25}
    assert.equal(wt.access(0), -2.5);
    assert.equal(wt.access(3), 3.25);
    assert.equal(wt.rank(-2.5, 5), 3);
    assert.equal(wt.quantile(0, 4, 4), 3.25);
});

// --- degenerate shapes ------------------------------------------------------

test('WaveletTree: single element', () => {
    const wt = new WaveletTree([42]);
    assert.equal(wt.length, 1);
    assert.equal(wt.distinct, 1);
    assert.equal(wt.levels, 1);              // forced to at least one level
    assert.equal(wt.access(0), 42);
    assert.equal(wt.rank(42, 1), 1);
    assert.equal(wt.rank(42, 0), 0);
    assert.equal(wt.select(42, 0), 0);
    assert.equal(wt.select(42, 1), undefined);
    assert.equal(wt.quantile(0, 0, 0), 42);
    assert.equal(wt.rangeCount(0, 0, 0, 100), 1);
    assert.equal(wt.rangeCount(0, 0, 100, 200), 0);
});

test('WaveletTree: all identical values (sigma = 1)', () => {
    const wt = new WaveletTree([7, 7, 7, 7, 7]);
    assert.equal(wt.distinct, 1);
    assert.equal(wt.levels, 1);
    for (let i = 0; i < 5; i++) assert.equal(wt.access(i), 7);
    assert.equal(wt.rank(7, 5), 5);
    assert.equal(wt.rank(8, 5), 0);
    assert.equal(wt.select(7, 3), 3);
    assert.equal(wt.select(7, 5), undefined);
    assert.equal(wt.quantile(1, 3, 2), 7);
    assert.equal(wt.rangeCount(0, 4, 7, 7), 5);
    assert.equal(wt.rangeCount(0, 4, 8, 9), 0);
});

test('WaveletTree: exact power-of-two sigma boundary (sigma = 4, levels = 2) and sigma just over (sigma = 5, levels = 3)', () => {
    const a = new WaveletTree([0, 1, 2, 3, 3, 2, 1, 0]);
    assert.equal(a.distinct, 4);
    assert.equal(a.levels, 2);
    const b = new WaveletTree([0, 1, 2, 3, 4]);
    assert.equal(b.distinct, 5);
    assert.equal(b.levels, 3);               // ceil(log2 5)
    assert.equal(b.quantile(0, 4, 0), 0);
    assert.equal(b.quantile(0, 4, 4), 4);
    assert.equal(b.access(4), 4);
    assert.equal(b.select(4, 0), 4);
});

// --- brute-force oracle over the whole surface ------------------------------

test('WaveletTree: all five ops match a brute-force array recompute over a fuzz corpus', () => {
    for (let trial = 0; trial < 200; trial++) {
        const r = mulberry32(trial * 7 + 1);
        const n = 1 + ((r() * 60) | 0);
        const dom = 1 + ((r() * 10) | 0);    // distinct-domain size drives sigma / level count
        const vals = [];
        for (let i = 0; i < n; i++) vals.push(((r() * dom) | 0) * 3 - 7); // negatives + gaps
        const wt = new WaveletTree(vals);
        const distinct = [...new Set(vals)];

        // access
        for (let i = 0; i < n; i++) assert.equal(wt.access(i), vals[i], 'access trial ' + trial + ' i ' + i);

        // rank (present + absent)
        for (let t = 0; t < 12; t++) {
            const v = distinct[(r() * distinct.length) | 0];
            const i = (r() * (n + 1)) | 0;
            let c = 0; for (let j = 0; j < i; j++) if (vals[j] === v) c++;
            assert.equal(wt.rank(v, i), c, 'rank trial ' + trial);
        }
        assert.equal(wt.rank(1e9, n), 0, 'rank absent');
        assert.equal(wt.rank(-1e9, n), 0, 'rank absent');

        // quantile (k-th smallest in an index window)
        for (let t = 0; t < 12; t++) {
            let lo = (r() * n) | 0, hi = (r() * n) | 0;
            if (lo > hi) { const x = lo; lo = hi; hi = x; }
            const sub = vals.slice(lo, hi + 1).slice().sort((p, q) => p - q);
            const k = (r() * sub.length) | 0;
            assert.equal(wt.quantile(lo, hi, k), sub[k], 'quantile trial ' + trial);
        }

        // rangeCount (value window in an index window)
        for (let t = 0; t < 12; t++) {
            let lo = (r() * n) | 0, hi = (r() * n) | 0;
            if (lo > hi) { const x = lo; lo = hi; hi = x; }
            let vlo = ((r() * dom) | 0) * 3 - 7, vhi = ((r() * dom) | 0) * 3 - 7;
            if (vlo > vhi) { const x = vlo; vlo = vhi; vhi = x; }
            let c = 0; for (let j = lo; j <= hi; j++) if (vals[j] >= vlo && vals[j] <= vhi) c++;
            assert.equal(wt.rangeCount(lo, hi, vlo, vhi), c, 'rangeCount trial ' + trial);
        }
    }
});

// --- select's upward inverse navigation: its own dedicated oracle -----------

test('WaveletTree select: every (value, k) round-trips against the brute-force occurrence list', () => {
    for (let trial = 0; trial < 200; trial++) {
        const r = mulberry32(trial * 13 + 3);
        const n = 1 + ((r() * 80) | 0);
        const dom = 1 + ((r() * 12) | 0);
        const vals = [];
        for (let i = 0; i < n; i++) vals.push((r() * dom) | 0);
        const wt = new WaveletTree(vals);
        const distinct = [...new Set(vals)];
        for (const v of distinct) {
            const occ = [];
            for (let j = 0; j < n; j++) if (vals[j] === v) occ.push(j);
            for (let k = 0; k < occ.length; k++) {
                assert.equal(wt.select(v, k), occ[k], 'select trial ' + trial + ' v ' + v + ' k ' + k);
                // select is the inverse of rank: rank(v, select(v,k)) === k, and access at that index is v
                assert.equal(wt.rank(v, occ[k]), k, 'rank/select inverse');
                assert.equal(wt.access(occ[k]), v, 'access at select');
            }
            assert.equal(wt.select(v, occ.length), undefined, 'select past last occurrence');
        }
        assert.equal(wt.select(dom + 1000, 0), undefined, 'select of an absent value');
    }
});

// --- fail-closed doors (every method, typeof-first) -------------------------

test('WaveletTree build: fails closed on non-array-like / bad length / non-finite entries', () => {
    for (const bad of [null, undefined, 5, {}, Symbol('x'), true]) {
        assert.throws(() => new WaveletTree(bad), /\[lite-logn\]/, 'ctor ' + String(bad));
    }
    assert.throws(() => new WaveletTree([]), /\[lite-logn\]/, 'empty array');
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => new WaveletTree([1, 2, bad]), /\[lite-logn\]/, 'value ' + String(bad));
    }
    assert.throws(() => WaveletTree.build(null), /\[lite-logn\]/);
    assert.throws(() => WaveletTree.build([1, NaN]), /\[lite-logn\]/);
});

test('WaveletTree access: out-of-range / non-integer / non-number index fails closed', () => {
    const wt = new WaveletTree([3, 1, 2]);
    for (const bad of [-1, 3, 100, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => wt.access(bad), /\[lite-logn\]/, 'access ' + String(bad));
    }
    assert.equal(wt.access(0), 3);
    assert.equal(wt.access(2), 2);
});

test('WaveletTree rank: bad value / bad i fail closed; i in [0, length] is legal', () => {
    const wt = new WaveletTree([3, 1, 2, 1]);
    for (const bad of [NaN, '2', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => wt.rank(bad, 2), /\[lite-logn\]/, 'rank value ' + String(bad));
    }
    for (const bad of [-1, 5, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => wt.rank(1, bad), /\[lite-logn\]/, 'rank i ' + String(bad));
    }
    assert.equal(wt.rank(1, 0), 0);          // empty prefix
    assert.equal(wt.rank(1, 4), 2);          // whole array
    assert.equal(wt.rank(1, wt.length), 2);  // i === length is legal
    // +-Infinity are legal (absent) value queries -> 0
    assert.equal(wt.rank(Infinity, 4), 0);
    assert.equal(wt.rank(-Infinity, 4), 0);
});

test('WaveletTree select: bad value / bad k fail closed; absent / OOB-k return undefined (a consistent read)', () => {
    const wt = new WaveletTree([3, 1, 2, 1]);
    for (const bad of [NaN, '2', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => wt.select(bad, 0), /\[lite-logn\]/, 'select value ' + String(bad));
    }
    for (const bad of [-1, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => wt.select(1, bad), /\[lite-logn\]/, 'select k ' + String(bad));
    }
    assert.equal(wt.select(1, 0), 1);
    assert.equal(wt.select(1, 1), 3);
    assert.equal(wt.select(1, 2), undefined);   // only two 1s
    assert.equal(wt.select(999, 0), undefined); // absent value -> undefined, not a throw
});

test('WaveletTree quantile: bad indices / bad k fail closed', () => {
    const wt = new WaveletTree([3, 1, 2, 1, 5]);
    for (const bad of [-1, 5, 100, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => wt.quantile(bad, 4, 0), /\[lite-logn\]/, 'quantile lo ' + String(bad));
        assert.throws(() => wt.quantile(0, bad, 0), /\[lite-logn\]/, 'quantile hi ' + String(bad));
    }
    for (const bad of [-1, 1.5, NaN, '0', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => wt.quantile(0, 4, bad), /\[lite-logn\]/, 'quantile k ' + String(bad));
    }
    assert.throws(() => wt.quantile(3, 1, 0), /\[lite-logn\]/); // lo > hi
    assert.throws(() => wt.quantile(0, 4, 5), /\[lite-logn\]/); // k > hi - lo
    assert.equal(wt.quantile(0, 4, 0), 1);
    assert.equal(wt.quantile(0, 4, 4), 5);
});

test('WaveletTree rangeCount: bad indices / bad bounds fail closed; vlo > vhi fails closed; +-Infinity legal', () => {
    const wt = new WaveletTree([3, 1, 2, 1, 5]);
    for (const bad of [-1, 5, 100, 1.5, NaN, Infinity, '0', null, undefined, {}, Symbol('i'), 3n]) {
        assert.throws(() => wt.rangeCount(bad, 4, 0, 9), /\[lite-logn\]/, 'rc lo ' + String(bad));
        assert.throws(() => wt.rangeCount(0, bad, 0, 9), /\[lite-logn\]/, 'rc hi ' + String(bad));
    }
    for (const bad of [NaN, '0', null, undefined, {}, Symbol('v'), 3n]) {
        assert.throws(() => wt.rangeCount(0, 4, bad, 9), /\[lite-logn\]/, 'rc vlo ' + String(bad));
        assert.throws(() => wt.rangeCount(0, 4, 0, bad), /\[lite-logn\]/, 'rc vhi ' + String(bad));
    }
    assert.throws(() => wt.rangeCount(3, 1, 0, 9), /\[lite-logn\]/); // lo > hi
    assert.throws(() => wt.rangeCount(0, 4, 9, 0), /\[lite-logn\]/); // vlo > vhi
    assert.equal(wt.rangeCount(0, 4, 1, 3), 4);       // {3,1,2,1}
    assert.equal(wt.rangeCount(0, 4, -Infinity, Infinity), 5);
    assert.equal(wt.rangeCount(1, 3, 2, 2), 1);       // just the single 2
    assert.equal(wt.rangeCount(0, 4, 6, 100), 0);     // window above every value
});

test('WaveletTree: no mutators exist (STATIC / IMMUTABLE contract)', () => {
    const wt = new WaveletTree([1, 2, 3]);
    for (const m of ['set', 'update', 'insert', 'delete', 'push', 'clear']) {
        assert.equal(typeof wt[m], 'undefined', 'WaveletTree must have no ' + m + ' (immutable)');
    }
});
