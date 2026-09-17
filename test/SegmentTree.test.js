/**
 * @zakkster/lite-logn -- SegmentTree boundary + differential suite.
 *
 * The third member's contract, proven at the doors and against a plain-array
 * oracle, once per fold:
 *   - surface + kinds (every op exists; kind getter reports the frozen fold);
 *   - construction validation (bad length: 0, negative, non-integer, > max; bad
 *     kind: not one of min/max/sum/gcd);
 *   - boundaries (length 1, lo == hi one-element range, fresh tree -> identity);
 *   - lo > hi throws (matching Fenwick.rangeSum);
 *   - fail-closed value doors (Symbol / BigInt / NaN / +-Infinity / 2**31 typeof-
 *     first; gcd rejects negatives + non-integers);
 *   - build(values, kind) === the same values applied incrementally;
 *   - a >= 40000 mixed update / query fuzz on n=1024 vs an INDEPENDENT plain-array
 *     model, per fold in {min, max, sum, gcd}, 0 divergences + a final full sweep.
 * Every test BITES: a broken impl (missing fold branch, wrong identity, dropped
 * guard, off-by-one boundary) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SegmentTree } from '../LogN.js';

// --- helpers ----------------------------------------------------------------

// mulberry32 -- deterministic PRNG so every fuzz run is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// An INDEPENDENT plain-array reference model: every fold computed the naive O(n)
// way over a flat array, with the correct identity.
function gcdInt(a, b) { while (b !== 0) { const r = a % b; a = b; b = r; } return a; }
const FOLD = {
    min: (a, b) => (b < a ? b : a),
    max: (a, b) => (b > a ? b : a),
    sum: (a, b) => a + b,
    gcd: (a, b) => gcdInt(a, b),
};
const IDENTITY = { min: Infinity, max: -Infinity, sum: 0, gcd: 0 };

function makeOracle(n, kind) {
    const a = new Float64Array(n);
    a.fill(IDENTITY[kind]); // fresh leaves hold the fold identity (matches the tree)
    return {
        set: (i, v) => { a[i] = v; },
        at: (i) => a[i],
        query: (lo, hi) => { let r = IDENTITY[kind]; for (let k = lo; k <= hi; k++) r = FOLD[kind](r, a[k]); return r; },
    };
}

const KINDS = ['min', 'max', 'sum', 'gcd'];

// --- surface ----------------------------------------------------------------

test('surface: every SegmentTree op exists with the right kind', () => {
    const st = new SegmentTree(8, 'sum');
    for (const m of ['query', 'update', 'at', 'clear', 'forEach']) {
        assert.equal(typeof st[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof st.length, 'number');
    assert.equal(typeof st.kind, 'string');
    assert.equal(typeof SegmentTree.build, 'function');
});

test('kind getter reports the frozen fold for every kind', () => {
    for (const kind of KINDS) {
        assert.equal(new SegmentTree(4, kind).kind, kind);
    }
});

// --- construction validation ------------------------------------------------

test('constructor rejects a bad length', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, 2 ** 30, Symbol('x')]) {
        assert.throws(() => new SegmentTree(bad, 'sum'), /\[lite-logn\]/, 'length ' + String(bad) + ' must throw');
    }
    // 2^30 - 1 is the max; 2^30 is one past
    assert.throws(() => new SegmentTree(0x40000000, 'sum'), /\[lite-logn\]/);
});

test('constructor rejects a bad kind', () => {
    for (const bad of ['product', 'MIN', '', 'xor', null, undefined, 0, Symbol('k'), {}]) {
        assert.throws(() => new SegmentTree(8, bad), /\[lite-logn\]/, 'kind ' + String(bad) + ' must throw');
    }
});

test('a fresh tree reports the fold identity for every kind', () => {
    for (const kind of KINDS) {
        const st = new SegmentTree(8, kind);
        assert.equal(st.query(0, 7), IDENTITY[kind], 'fresh ' + kind + ' identity');
        for (let i = 0; i < 8; i++) assert.equal(st.at(i), IDENTITY[kind]);
    }
});

// --- fluent return (this) ---------------------------------------------------

test('update / clear return the same instance (fluent)', () => {
    const st = new SegmentTree(4, 'sum');
    assert.equal(st.update(0, 1), st);
    assert.equal(st.clear(), st);
});

// --- boundaries -------------------------------------------------------------

test('length 1: the degenerate tree behaves for every kind', () => {
    for (const kind of KINDS) {
        const st = new SegmentTree(1, kind);
        assert.equal(st.query(0, 0), IDENTITY[kind]);
        st.update(0, 6);
        assert.equal(st.at(0), 6);
        assert.equal(st.query(0, 0), 6);
    }
});

test('lo == hi returns exactly the single leaf value', () => {
    const st = SegmentTree.build([5, 9, 2, 7, 4, 8], 'min');
    for (let i = 0; i < 6; i++) assert.equal(st.query(i, i), st.at(i), 'query(' + i + ',' + i + ')');
});

test('first and last index and full-range query are correct', () => {
    const st = SegmentTree.build([3, 1, 4, 1, 5, 9, 2, 6], 'sum');
    assert.equal(st.at(0), 3);
    assert.equal(st.at(7), 6);
    assert.equal(st.query(0, 7), 31);
    assert.equal(st.query(0, 0), 3);
    assert.equal(st.query(7, 7), 6);
    assert.equal(st.query(2, 5), 4 + 1 + 5 + 9);
});

test('negative values are honored for min / max / sum', () => {
    const st = SegmentTree.build([-5, 3, -2, 8, -9, 1], 'min');
    assert.equal(st.query(0, 5), -9);
    const mx = SegmentTree.build([-5, 3, -2, 8, -9, 1], 'max');
    assert.equal(mx.query(0, 5), 8);
    const sm = SegmentTree.build([-5, 3, -2, 8, -9, 1], 'sum');
    assert.equal(sm.query(0, 5), -4);
});

// --- lo > hi throws ---------------------------------------------------------

test('query with lo > hi throws (no silent swap, matching Fenwick.rangeSum)', () => {
    const st = SegmentTree.build([1, 2, 3, 4, 5, 6, 7, 8], 'sum');
    assert.throws(() => st.query(5, 2), /\[lite-logn\]/);
    assert.equal(st.query(2, 5), 3 + 4 + 5 + 6); // the honest window still works
});

// --- fail-closed value doors ------------------------------------------------

test('out-of-range index throws on query / update / at', () => {
    const st = new SegmentTree(8, 'sum');
    for (const bad of [-1, 8, 100, 1.5, NaN, Infinity, '0', null, undefined, Symbol('i'), 2 ** 31]) {
        assert.throws(() => st.update(bad, 1), /\[lite-logn\]/, 'update i ' + String(bad));
        assert.throws(() => st.at(bad), /\[lite-logn\]/, 'at ' + String(bad));
        assert.throws(() => st.query(bad, 7), /\[lite-logn\]/, 'query lo ' + String(bad));
        assert.throws(() => st.query(0, bad), /\[lite-logn\]/, 'query hi ' + String(bad));
    }
});

test('non-finite value fails closed, typeof-first (no coercion of Symbol/BigInt)', () => {
    const st = new SegmentTree(8, 'sum');
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => st.update(0, bad), /\[lite-logn\]/, 'update value ' + String(bad));
    }
    // 2**31 is a finite legal value for a sum tree (index ceiling, not value ceiling)
    st.update(0, 2 ** 31);
    assert.equal(st.at(0), 2 ** 31);
});

test('gcd kind rejects negative and non-integer values, accepts nonnegative integers', () => {
    const st = new SegmentTree(8, 'gcd');
    for (const bad of [-1, -3, 1.5, 2.0001, NaN, Infinity, '4', null, Symbol('g'), 5n]) {
        assert.throws(() => st.update(0, bad), /\[lite-logn\]/, 'gcd value ' + String(bad));
    }
    st.update(0, 12); st.update(1, 18);
    assert.equal(st.query(0, 1), 6);
    assert.equal(st.at(0), 12);
    // build honors the same gcd domain
    assert.throws(() => SegmentTree.build([4, -2], 'gcd'), /\[lite-logn\]/);
    assert.throws(() => SegmentTree.build([4, 1.5], 'gcd'), /\[lite-logn\]/);
});

test('a rejected update leaves an already-populated tree exactly untouched', () => {
    const st = SegmentTree.build([11, 22, 33, 44, 55, 66, 77, 88], 'sum');
    const before = [];
    for (let i = 0; i < 8; i++) before.push(st.at(i));
    const total = st.query(0, 7);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => st.update(3, bad), /\[lite-logn\]/, 'update value ' + String(bad));
    }
    for (const bad of [-1, 8, 100, 1.5, NaN]) {
        assert.throws(() => st.update(bad, 5), /\[lite-logn\]/, 'update i ' + String(bad));
    }
    const after = [];
    for (let i = 0; i < 8; i++) after.push(st.at(i));
    assert.deepEqual(after, before, 'a rejected op must not mutate any cell');
    assert.equal(st.query(0, 7), total, 'internal folds untouched');
});

// --- identity-vs-door: reject-at-index-0 must not hide a partial write -------
//
// The Fenwick lesson: a public index near a structurally special internal slot
// (there, index 0 maps to _t[1], immediately beside the unused _t[0] sentinel)
// can hide a partial write from a WEAK post-condition check. SegmentTree's own
// structurally special aliasing is different but real: leaf 0 lives at
// `_t[n + 0] = _t[n]`, and on a DEGENERATE length-1 tree that cell IS `_t[1]`
// -- the exact slot the class docs call "the fold of the whole array" for
// n > 1. A rejected update at index 0 must not corrupt it either way.
//
// This test also closes a WEAKER-THAN-IT-LOOKS gap in the test above: checking
// only leaves (`at(i)`) plus a FULL-RANGE `query(0, n-1)` is not a complete
// untouched-proof, because a full-range query on a power-of-two `n` collapses
// to a single read of the ROOT cell `_t[1]` (the boundary walk needs only one
// fold at the top) -- a corrupted NON-root internal node would not surface
// there. Sub-range queries that each resolve through a DIFFERENT internal node
// close that hole.
test('reject-at-index-0 leaves every leaf AND every internal fold untouched (no hierarchy-hidden corruption)', () => {
    for (const kind of KINDS) {
        const st = SegmentTree.build(
            kind === 'gcd' ? [12, 18, 24, 30, 36, 42, 48, 54] : [11, 22, 33, 44, 55, 66, 77, 88],
            kind);
        const before = [];
        for (let i = 0; i < 8; i++) before.push(st.at(i));
        // Sub-range probes that each resolve through a DIFFERENT internal node
        // (not just the root), so a corrupted non-root fold cannot hide.
        const probes = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 3], [4, 7], [1, 6], [0, 7]];
        const beforeProbes = probes.map(([lo, hi]) => st.query(lo, hi));

        const badValues = kind === 'gcd'
            ? [-1, -3, 1.5, 2.0001, NaN, Infinity, -Infinity, '4', null, undefined, {}, Symbol('g'), 5n]
            : [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n];
        for (const bad of badValues) {
            assert.throws(() => st.update(0, bad), /\[lite-logn\]/, kind + ' update(0, ' + String(bad) + ')');
        }

        const after = [];
        for (let i = 0; i < 8; i++) after.push(st.at(i));
        assert.deepEqual(after, before, kind + ': every leaf must be untouched after reject-at-index-0');
        const afterProbes = probes.map(([lo, hi]) => st.query(lo, hi));
        assert.deepEqual(afterProbes, beforeProbes,
            kind + ': every internal fold (not just the root) must be untouched after reject-at-index-0');
    }

    // The degenerate n=1 tree: leaf 0 lives at _t[1], the SAME slot that is the
    // aggregate root for n > 1. A rejected update here must not corrupt it.
    for (const kind of KINDS) {
        const st = new SegmentTree(1, kind);
        st.update(0, kind === 'gcd' ? 6 : 42);
        const before = st.at(0);
        const badValues = kind === 'gcd'
            ? [-1, 1.5, NaN, Infinity, Symbol('g'), 3n]
            : [NaN, Infinity, -Infinity, Symbol('k'), 3n];
        for (const bad of badValues) {
            assert.throws(() => st.update(0, bad), /\[lite-logn\]/, kind + ' n=1 update(0, ' + String(bad) + ')');
        }
        assert.equal(st.at(0), before, kind + ' n=1: reject-at-index-0 must not corrupt the sole leaf/root-alias slot');
        assert.equal(st.query(0, 0), before, kind + ' n=1: query must agree after the rejected write');
    }
});

// --- build differential -----------------------------------------------------

test('build(values, kind) === the same values applied incrementally, per fold', () => {
    const rng = mulberry32(0xBADC0DE);
    for (const kind of KINDS) {
        for (const n of [1, 2, 7, 8, 15, 16, 100, 257, 1024]) {
            const values = new Array(n);
            for (let i = 0; i < n; i++) {
                values[i] = kind === 'gcd'
                    ? Math.floor(rng() * 60)
                    : Math.floor(rng() * 2000) - 1000;
            }
            const built = SegmentTree.build(values, kind);
            const incr = new SegmentTree(n, kind);
            for (let i = 0; i < n; i++) incr.update(i, values[i]);
            assert.equal(built.length, n);
            for (let i = 0; i < n; i++) {
                assert.equal(built.at(i), incr.at(i), 'build at ' + i + ' (' + kind + ' n=' + n + ')');
            }
            // spot-check a spread of ranges
            for (let t = 0; t < 20; t++) {
                const lo = Math.floor(rng() * n);
                const hi = lo + Math.floor(rng() * (n - lo));
                assert.equal(built.query(lo, hi), incr.query(lo, hi),
                    'build query [' + lo + ',' + hi + '] (' + kind + ' n=' + n + ')');
            }
        }
    }
});

test('build fails closed on bad input', () => {
    assert.throws(() => SegmentTree.build(null, 'sum'), /\[lite-logn\]/);
    assert.throws(() => SegmentTree.build({}, 'sum'), /\[lite-logn\]/);          // no length
    assert.throws(() => SegmentTree.build([1, NaN, 3], 'sum'), /\[lite-logn\]/); // non-finite
    assert.throws(() => SegmentTree.build([1, '2'], 'sum'), /\[lite-logn\]/);    // non-number
    assert.throws(() => SegmentTree.build([], 'sum'), /\[lite-logn\]/);          // length 0 -> ctor
    assert.throws(() => SegmentTree.build([1, 2], 'bad'), /\[lite-logn\]/);      // bad kind
});

// --- clear ------------------------------------------------------------------

test('clear resets every element to the fold identity and keeps capacity', () => {
    for (const kind of KINDS) {
        const st = new SegmentTree(8, kind);
        for (let i = 0; i < 8; i++) st.update(i, kind === 'gcd' ? (i + 1) * 2 : i + 1);
        st.clear();
        for (let i = 0; i < 8; i++) assert.equal(st.at(i), IDENTITY[kind]);
        assert.equal(st.query(0, 7), IDENTITY[kind]);
        st.update(4, 9); // reusable after clear
        assert.equal(st.at(4), 9);
    }
});

// --- forEach ----------------------------------------------------------------

test('forEach visits (value, index) in ascending order, matching at(i)', () => {
    const st = new SegmentTree(10, 'sum');
    const rng = mulberry32(0x9999);
    const vals = [];
    for (let i = 0; i < 10; i++) { const v = Math.floor(rng() * 100); st.update(i, v); vals.push(v); }
    let expected = 0;
    st.forEach((value, index, self) => {
        assert.equal(index, expected, 'forEach index order');
        assert.equal(value, vals[index], 'forEach value at ' + index);
        assert.equal(self, st);
        expected++;
    });
    assert.equal(expected, 10);
});

// --- the big differential fuzz (>= 40k mixed ops per fold vs a plain-array oracle)

test('differential fuzz: >= 40k mixed ops on n=1024 match the array oracle per fold', () => {
    const n = 1024;
    for (const kind of KINDS) {
        const st = new SegmentTree(n, kind);
        const oracle = makeOracle(n, kind);
        const rng = mulberry32(0xCAFEBABE ^ (kind.length << 8) ^ kind.charCodeAt(0));
        let divergences = 0;
        const STEPS = 40000;
        for (let step = 0; step < STEPS; step++) {
            const r = rng();
            const i = Math.floor(rng() * n);
            if (r < 0.45) {                              // update (absolute set)
                const v = kind === 'gcd'
                    ? Math.floor(rng() * 100)
                    : Math.floor(rng() * 2000) - 1000;
                st.update(i, v); oracle.set(i, v);
            } else if (r < 0.70) {                       // at
                if (st.at(i) !== oracle.at(i)) divergences++;
            } else {                                     // query
                const lo = Math.min(i, Math.floor(rng() * n));
                const hi = Math.max(i, lo);
                const got = st.query(lo, hi);
                const exp = oracle.query(lo, hi);
                if (got !== exp) divergences++;
            }
            if ((step & 4095) === 0) {
                // periodic sweep to catch a drift the sampled reads missed
                for (let k = 0; k < n; k += 97) {
                    if (st.query(0, k) !== oracle.query(0, k)) { divergences++; break; }
                }
            }
        }
        // final full sweep: every leaf + a spread of ranges
        for (let k = 0; k < n; k++) {
            if (st.at(k) !== oracle.at(k)) divergences++;
        }
        for (let lo = 0; lo < n; lo += 37) {
            for (let hi = lo; hi < n; hi += 53) {
                if (st.query(lo, hi) !== oracle.query(lo, hi)) { divergences++; break; }
            }
        }
        assert.equal(divergences, 0, kind + ' fuzz produced ' + divergences + ' divergences');
    }
});
