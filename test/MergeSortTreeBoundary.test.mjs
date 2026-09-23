/**
 * @zakkster/lite-logn -- MergeSortTree QA boundary suite (node:test).
 *
 * Extends test/MergeSortTree.test.mjs with the fail-closed doors + white-box gaps a final gate
 * must independently prove: build / ctor reject a non-array-like, an out-of-range length, and any
 * non-finite entry (typeof-FIRST -- Symbol / BigInt / NaN / +-Infinity coercion-safe; null is not
 * zero); the (H+1)*n cell product is guarded by a FLOAT multiply (never `| 0`, which would wrap a
 * huge product to a small int and under-allocate -> fail OPEN); countLE / rangeCount reject
 * non-integer or out-of-range indices, NaN thresholds, and an inverted value-window; the backing
 * table is exactly (H+1)*n long; n = 1 is legal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MergeSortTree } from '../LogN.js';

// --- build / ctor doors -----------------------------------------------------

test('build fails closed on a non-array-like source (typeof-first)', () => {
    for (const bad of [null, undefined, 42, 'abc', true, Symbol('x'), 5n, {}]) {
        assert.throws(() => MergeSortTree.build(bad), /\[lite-logn\]/, 'build ' + String(bad));
        assert.throws(() => new MergeSortTree(bad), /\[lite-logn\]/, 'ctor ' + String(bad));
    }
});

test('build fails closed on an out-of-range length', () => {
    assert.throws(() => MergeSortTree.build([]), /\[lite-logn\]/, 'empty (length 0)');
    // A fake array-like with a non-integer / out-of-range length.
    assert.throws(() => MergeSortTree.build({ length: 1.5 }), /\[lite-logn\]/, 'length 1.5');
    assert.throws(() => MergeSortTree.build({ length: -1 }), /\[lite-logn\]/, 'length -1');
    assert.throws(() => MergeSortTree.build({ length: 0x80000000, 0: 1 }), /\[lite-logn\]/, 'length 2^31');
});

test('build fails closed on a non-finite entry (typeof-first: Symbol / BigInt / NaN / +-Infinity)', () => {
    for (const bad of [NaN, Infinity, -Infinity, '3', null, undefined, Symbol('x'), 3n, {}, true]) {
        assert.throws(() => MergeSortTree.build([1, 2, bad, 4]), /\[lite-logn\]/, 'entry ' + String(bad));
    }
});

test('the (H+1)*n cell product is FLOAT-guarded (never | 0) so a huge product fails CLOSED', () => {
    // A fake array-like whose length is large enough that (H+1)*n overflows MST_MAX_CELLS (2^31-1)
    // but that a `(H+1)*n | 0` would WRAP to a small / negative int and pass the door. The guard
    // must reject it BEFORE trying to allocate (we never index the fake, the length check fires).
    // n = 2^28: H = 28, (H+1)*n = 29 * 268435456 = 7.78e9 > 2^31-1; as int32 (| 0) it wraps.
    const n = 1 << 28;
    assert.throws(() => MergeSortTree.build({ length: n }), /\[lite-logn\]/, 'cell overflow must fail closed');
    // Sanity: 29 * 2^28 indeed wraps to a small value under | 0 (proves the guard is non-vacuous).
    assert.ok(((29 * n) | 0) < n, 'the | 0 wrap would under-allocate (guard must use float multiply)');
});

// --- countLE doors ----------------------------------------------------------

test('countLE fails closed on non-integer / non-number indices (typeof-first)', () => {
    const t = MergeSortTree.build([1, 2, 3, 4, 5]);
    for (const bad of [1.5, NaN, '2', null, undefined, Symbol('x'), 3n, {}, Infinity]) {
        assert.throws(() => t.countLE(bad, 4, 3), /\[lite-logn\]/, 'lo ' + String(bad));
        assert.throws(() => t.countLE(0, bad, 3), /\[lite-logn\]/, 'hi ' + String(bad));
    }
});

test('countLE fails closed on an out-of-range or inverted index range', () => {
    const t = MergeSortTree.build([1, 2, 3, 4, 5]);
    assert.throws(() => t.countLE(-1, 4, 3), /\[lite-logn\]/, 'lo < 0');
    assert.throws(() => t.countLE(0, 5, 3), /\[lite-logn\]/, 'hi >= length');
    assert.throws(() => t.countLE(3, 2, 3), /\[lite-logn\]/, 'lo > hi');
});

test('countLE index boundary matrix: 0, 1, N-1, N, N+1 on both lo and hi (n=5)', () => {
    const n = 5;
    const t = MergeSortTree.build([10, 20, 30, 40, 50]);
    // 0 and N-1 are the legal extremes -- must succeed.
    assert.equal(t.countLE(0, 0, 100), 1, 'lo=hi=0 legal');
    assert.equal(t.countLE(n - 1, n - 1, 100), 1, 'lo=hi=N-1 legal');
    assert.equal(t.countLE(0, n - 1, 100), n, 'full range [0, N-1] legal');
    // 1 is a legal interior index.
    assert.equal(t.countLE(1, 1, 100), 1, 'lo=hi=1 legal');
    // N and N+1 are OOB on both lo and hi -- must fail closed, never wrap or clamp.
    assert.throws(() => t.countLE(n, n, 100), /\[lite-logn\]/, 'lo=hi=N (one past the end)');
    assert.throws(() => t.countLE(n + 1, n + 1, 100), /\[lite-logn\]/, 'lo=hi=N+1');
    assert.throws(() => t.countLE(0, n, 100), /\[lite-logn\]/, 'hi=N');
    assert.throws(() => t.countLE(0, n + 1, 100), /\[lite-logn\]/, 'hi=N+1');
    assert.throws(() => t.countLE(n, n - 1, 100), /\[lite-logn\]/, 'lo=N > hi=N-1 (also inverted)');
});

test('countLE fails closed on a NaN threshold but accepts +-Infinity', () => {
    const t = MergeSortTree.build([1, 2, 3, 4, 5]);
    assert.throws(() => t.countLE(0, 4, NaN), /\[lite-logn\]/, 'x NaN');
    assert.throws(() => t.countLE(0, 4, Symbol('x')), /\[lite-logn\]/, 'x Symbol');
    assert.throws(() => t.countLE(0, 4, 3n), /\[lite-logn\]/, 'x BigInt');
    assert.equal(t.countLE(0, 4, Infinity), 5);
    assert.equal(t.countLE(0, 4, -Infinity), 0);
});

// --- rangeCount doors -------------------------------------------------------

test('rangeCount fails closed on bad indices / NaN bounds / inverted value-window', () => {
    const t = MergeSortTree.build([1, 2, 3, 4, 5]);
    assert.throws(() => t.rangeCount(1.5, 4, 1, 5), /\[lite-logn\]/, 'lo non-integer');
    assert.throws(() => t.rangeCount(0, 5, 1, 5), /\[lite-logn\]/, 'hi >= length');
    assert.throws(() => t.rangeCount(0, 4, NaN, 5), /\[lite-logn\]/, 'vlo NaN');
    assert.throws(() => t.rangeCount(0, 4, 1, NaN), /\[lite-logn\]/, 'vhi NaN');
    assert.throws(() => t.rangeCount(0, 4, Symbol('x'), 5), /\[lite-logn\]/, 'vlo Symbol');
    assert.throws(() => t.rangeCount(0, 4, 1, 5n), /\[lite-logn\]/, 'vhi BigInt');
    assert.throws(() => t.rangeCount(0, 4, 5, 1), /\[lite-logn\]/, 'vlo > vhi');
});

// --- structure --------------------------------------------------------------

test('n = 1 is legal (a single element, one level, cells = 1)', () => {
    const t = MergeSortTree.build([42]);
    assert.equal(t.length, 1);
    assert.equal(t.cells, 1);
    assert.equal(t._t.length, 1);
    assert.equal(t.countLE(0, 0, 42), 1);
    assert.equal(t.countLE(0, 0, 41), 0);
    assert.equal(t.rangeCount(0, 0, 42, 42), 1);
});

test('the backing table is exactly (H+1)*n long and not reallocated by queries', () => {
    const n = 500;
    const vals = new Array(n).fill(0).map((_, i) => (i * 2654435761) & 0xffff);
    const t = MergeSortTree.build(vals);
    let H = 0; while (2 ** H < n) H++;
    const expected = (H + 1) * n;
    assert.equal(t._t.length, expected);
    assert.equal(t.cells, expected);
    const buf = t._t.buffer;
    for (let i = 0; i < 1000; i++) { t.countLE(i % n, n - 1, i & 0xffff); t.rangeCount(0, i % n, 0, i & 0xffff); }
    assert.equal(t._t.buffer, buf, 'the backing store must not be reallocated by read-only queries');
});
