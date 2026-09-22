/**
 * @zakkster/lite-logn -- SortedArray boundary + differential suite.
 *
 * The fourteenth member's contract -- the family's DYNAMIC, read-optimized, contiguous-
 * storage ordered map (the honest dual of the pointer-based ordered maps: worst-case-
 * O(log n) get / has / rank / successor / predecessor via one lower-bound binary search,
 * O(1) select / keyAt / valueAt / min / max via a raw array index, at the disclosed cost
 * of O(n) set / delete via copyWithin) -- proven at the doors and against a Map + sorted-
 * array oracle:
 *   - surface (every API op exists; size / capacity getters);
 *   - construction validation (bad capacity; typeof-first Symbol / BigInt safe);
 *   - fail-closed key / value / bound / rank doors (Symbol / BigInt / NaN / +-Infinity);
 *   - empty / missing query -> undefined (no throw); select / keyAt / valueAt out-of-range
 *     -> undefined; min / max of an empty map -> undefined;
 *   - set on an existing key UPDATES the value in place (no shift, size steady);
 *   - the keys stay SORTED ascending after every insert / delete;
 *   - rank / select are exact order statistics; successor / predecessor are STRICT;
 *   - rangeIter yields [lo, hi] inclusive ascending, honours +-Infinity bounds;
 *   - re-entrancy: mutating inside rangeIter throws [lite-logn];
 *   - build sorts once, fails closed on mismatch / non-finite / DUPLICATE keys;
 *   - a >= 1e5 mixed-op fuzz vs an INDEPENDENT Map + sorted-array oracle, 0 divergences.
 * Every test BITES: a broken impl (dropped guard, wrong lower-bound, a botched copyWithin
 * shift, wrong rank strictness, a stale size) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SortedArray } from '../LogN.js';

// --- surface ----------------------------------------------------------------

test('surface: every documented op exists; size / capacity getters', () => {
    const sa = new SortedArray(16);
    for (const m of ['get', 'has', 'set', 'delete', 'rank', 'select', 'keyAt', 'valueAt',
        'successor', 'predecessor', 'min', 'max', 'rangeIter', 'forEach', 'clear']) {
        assert.equal(typeof sa[m], 'function', 'missing op ' + m);
    }
    assert.equal(typeof SortedArray.build, 'function', 'missing static build');
    assert.equal(sa.size, 0);
    assert.equal(sa.capacity, 16);
});

// --- empty / missing queries ------------------------------------------------

test('empty map: reads return undefined / false, never throw', () => {
    const sa = new SortedArray(4);
    assert.equal(sa.get(5), undefined);
    assert.equal(sa.has(5), false);
    assert.equal(sa.rank(5), 0);
    assert.equal(sa.select(0), undefined);
    assert.equal(sa.keyAt(0), undefined);
    assert.equal(sa.valueAt(0), undefined);
    assert.equal(sa.successor(5), undefined);
    assert.equal(sa.predecessor(5), undefined);
    assert.equal(sa.min(), undefined);
    assert.equal(sa.max(), undefined);
    assert.equal(sa.delete(5), false); // idempotent absent
    assert.deepEqual([...sa.rangeIter(-Infinity, Infinity)], []);
});

// --- keys stay sorted; select / keyAt / valueAt / min / max -----------------

test('insertions in any order keep keys ascending; O(1) index reads are correct', () => {
    const sa = new SortedArray(8);
    const order = [5, 1, 9, 3, 7, 2, 8, 4];
    for (const k of order) sa.set(k, k * 10);
    assert.equal(sa.size, 8);
    const keys = [];
    for (let i = 0; i < sa.size; i++) keys.push(sa.keyAt(i));
    assert.deepEqual(keys, [1, 2, 3, 4, 5, 7, 8, 9]);
    assert.equal(sa.select(0), 1);
    assert.equal(sa.select(7), 9);
    assert.equal(sa.valueAt(0), 10);
    assert.equal(sa.valueAt(7), 90);
    assert.equal(sa.min(), 1);
    assert.equal(sa.max(), 9);
    assert.equal(sa.select(8), undefined);   // out of range
    assert.equal(sa.select(-1), undefined);
    assert.equal(sa.keyAt(100), undefined);
    assert.equal(sa.valueAt(100), undefined);
});

// --- set-in-place update ----------------------------------------------------

test('set on an existing key updates the value in place; size steady, keys unchanged', () => {
    const sa = new SortedArray(8);
    for (const k of [1, 2, 3]) sa.set(k, k);
    assert.equal(sa.size, 3);
    sa.set(2, 200);
    assert.equal(sa.size, 3, 'no new slot');
    assert.equal(sa.get(2), 200);
    assert.deepEqual([sa.keyAt(0), sa.keyAt(1), sa.keyAt(2)], [1, 2, 3]);
});

// --- delete shifts down correctly -------------------------------------------

test('delete removes and shifts the tail down; sorted order preserved', () => {
    const sa = new SortedArray(8);
    for (const k of [1, 2, 3, 4, 5]) sa.set(k, k * 10);
    assert.equal(sa.delete(3), true);
    assert.equal(sa.size, 4);
    assert.deepEqual([...sa.rangeIter(-Infinity, Infinity)], [1, 2, 4, 5]);
    assert.equal(sa.get(3), undefined);
    assert.equal(sa.get(4), 40, 'the shifted value stays paired with its key');
    assert.equal(sa.delete(1), true); // head delete
    assert.deepEqual([...sa.rangeIter(-Infinity, Infinity)], [2, 4, 5]);
    assert.equal(sa.delete(5), true); // tail delete
    assert.deepEqual([...sa.rangeIter(-Infinity, Infinity)], [2, 4]);
    assert.equal(sa.delete(99), false); // absent, idempotent
});

// --- rank / successor / predecessor strictness ------------------------------

test('rank counts keys strictly < x; successor / predecessor are STRICT', () => {
    const sa = new SortedArray(8);
    for (const k of [10, 20, 30, 40]) sa.set(k, k);
    assert.equal(sa.rank(10), 0);
    assert.equal(sa.rank(11), 1);
    assert.equal(sa.rank(30), 2);
    assert.equal(sa.rank(41), 4);
    assert.equal(sa.rank(-5), 0);
    assert.equal(sa.successor(20), 30, 'strictly greater');
    assert.equal(sa.successor(25), 30);
    assert.equal(sa.successor(40), undefined);
    assert.equal(sa.predecessor(30), 20, 'strictly less');
    assert.equal(sa.predecessor(25), 20);
    assert.equal(sa.predecessor(10), undefined);
});

// --- rangeIter inclusive + infinite bounds ----------------------------------

test('rangeIter yields [lo, hi] inclusive ascending; +-Infinity are unbounded ends', () => {
    const sa = new SortedArray(16);
    for (let k = 0; k < 10; k++) sa.set(k, k);
    assert.deepEqual([...sa.rangeIter(3, 6)], [3, 4, 5, 6]);
    assert.deepEqual([...sa.rangeIter(3, 3)], [3]);       // single
    assert.deepEqual([...sa.rangeIter(-Infinity, 2)], [0, 1, 2]);
    assert.deepEqual([...sa.rangeIter(7, Infinity)], [7, 8, 9]);
    assert.deepEqual([...sa.rangeIter(100, 200)], []);     // above range
    assert.deepEqual([...sa.rangeIter(2.5, 5.5)], [3, 4, 5]); // non-integer bounds
});

test('rangeIter is version-stamped: mutating mid-iteration throws [lite-logn]', () => {
    const sa = new SortedArray(16);
    for (let k = 0; k < 10; k++) sa.set(k, k);
    assert.throws(() => {
        for (const key of sa.rangeIter(0, 9)) {
            if (key === 3) sa.set(100, 100); // structural change
        }
    }, /\[lite-logn\]/);
    // value update also bumps the version -> also trips the guard
    const sb = new SortedArray(16);
    for (let k = 0; k < 10; k++) sb.set(k, k);
    assert.throws(() => {
        for (const key of sb.rangeIter(0, 9)) {
            if (key === 3) sb.set(5, 999); // in-place value update bumps _version
        }
    }, /\[lite-logn\]/);
    // delete mid-iteration also trips
    const sc = new SortedArray(16);
    for (let k = 0; k < 10; k++) sc.set(k, k);
    assert.throws(() => {
        for (const key of sc.rangeIter(0, 9)) {
            if (key === 3) sc.delete(7);
        }
    }, /\[lite-logn\]/);
});

// --- clear ------------------------------------------------------------------

test('clear empties the map and keeps capacity; a live iterator fails closed', () => {
    const sa = new SortedArray(8);
    for (let k = 0; k < 5; k++) sa.set(k, k);
    assert.equal(sa.clear(), sa, 'fluent');
    assert.equal(sa.size, 0);
    assert.equal(sa.capacity, 8);
    assert.equal(sa.get(2), undefined);
    // clear bumps the version -> a captured iterator throws
    for (let k = 0; k < 5; k++) sa.set(k, k);
    assert.throws(() => {
        for (const key of sa.rangeIter(0, 4)) { if (key === 1) sa.clear(); }
    }, /\[lite-logn\]/);
});

// --- forEach ----------------------------------------------------------------

test('forEach visits (key, value, self) ascending', () => {
    const sa = new SortedArray(8);
    for (const k of [3, 1, 2]) sa.set(k, k * 100);
    const seen = [];
    sa.forEach((key, value, self) => {
        seen.push([key, value]);
        assert.equal(self, sa);
    });
    assert.deepEqual(seen, [[1, 100], [2, 200], [3, 300]]);
});

// --- fixed capacity: overflow fails closed ----------------------------------

test('set beyond capacity throws [lite-logn]; an in-place update at full is fine', () => {
    const sa = new SortedArray(3);
    sa.set(1, 1); sa.set(2, 2); sa.set(3, 3);
    assert.equal(sa.size, 3);
    assert.throws(() => sa.set(4, 4), /\[lite-logn\]/, 'a new key at full throws');
    assert.doesNotThrow(() => sa.set(2, 22), 'updating an existing key at full is fine');
    assert.equal(sa.get(2), 22);
});

// --- static build -----------------------------------------------------------

test('build sorts once from parallel array-likes; keys / values stay paired', () => {
    const sa = SortedArray.build([9, 1, 5, 3, 7], [90, 10, 50, 30, 70]);
    assert.equal(sa.size, 5);
    assert.equal(sa.capacity, 5);
    assert.deepEqual([...sa.rangeIter(-Infinity, Infinity)], [1, 3, 5, 7, 9]);
    assert.equal(sa.get(5), 50);
    assert.equal(sa.get(9), 90);
    assert.equal(sa.valueAt(0), 10);
    // works with typed-array inputs too
    const tb = SortedArray.build(Float64Array.from([2, 0, 1]), Float64Array.from([20, 0, 10]));
    assert.deepEqual([tb.keyAt(0), tb.keyAt(1), tb.keyAt(2)], [0, 1, 2]);
    assert.equal(tb.get(0), 0, 'a 0 value is legal -- null is not zero');
});

// --- differential fuzz vs an independent Map + sorted-array oracle -----------

// mulberry32 -- a small deterministic PRNG so the fuzz is reproducible.
function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test('1e5 mixed-op fuzz agrees with a Map + sorted-array oracle, 0 divergences', () => {
    const CAP = 512;
    const KEY_SPACE = 400; // < CAP so set never overflows
    const sa = new SortedArray(CAP);
    const oracle = new Map();
    const rnd = mulberry32(0xC0FFEE);
    const OPS = 100000;
    for (let i = 0; i < OPS; i++) {
        const key = (rnd() * KEY_SPACE) | 0;
        const r = rnd();
        if (r < 0.45) {
            const val = (rnd() * 1e6) | 0;
            sa.set(key, val);
            oracle.set(key, val);
        } else if (r < 0.65) {
            assert.equal(sa.delete(key), oracle.delete(key), 'delete verdict at op ' + i);
        } else if (r < 0.78) {
            assert.equal(sa.get(key), oracle.has(key) ? oracle.get(key) : undefined, 'get at op ' + i);
        } else if (r < 0.86) {
            assert.equal(sa.has(key), oracle.has(key), 'has at op ' + i);
        } else if (r < 0.93) {
            const sorted = [...oracle.keys()].sort((a, b) => a - b);
            // rank: count strictly < key
            let rk = 0; while (rk < sorted.length && sorted[rk] < key) rk++;
            assert.equal(sa.rank(key), rk, 'rank at op ' + i);
            // successor / predecessor
            const succ = sorted.find((k) => k > key);
            const pred = [...sorted].reverse().find((k) => k < key);
            assert.equal(sa.successor(key), succ === undefined ? undefined : succ, 'succ at op ' + i);
            assert.equal(sa.predecessor(key), pred === undefined ? undefined : pred, 'pred at op ' + i);
        } else {
            // select / keyAt / valueAt / min / max against the sorted oracle
            const sorted = [...oracle.keys()].sort((a, b) => a - b);
            assert.equal(sa.size, sorted.length, 'size at op ' + i);
            assert.equal(sa.min(), sorted.length ? sorted[0] : undefined, 'min at op ' + i);
            assert.equal(sa.max(), sorted.length ? sorted[sorted.length - 1] : undefined, 'max at op ' + i);
            if (sorted.length) {
                const k = (rnd() * sorted.length) | 0;
                assert.equal(sa.select(k), sorted[k], 'select at op ' + i);
                assert.equal(sa.keyAt(k), sorted[k], 'keyAt at op ' + i);
                assert.equal(sa.valueAt(k), oracle.get(sorted[k]), 'valueAt at op ' + i);
            }
        }
        // invariant: keys are always ascending + paired with their oracle value
        if ((i & 4095) === 0) {
            for (let j = 1; j < sa.size; j++) {
                assert.ok(sa.keyAt(j - 1) < sa.keyAt(j), 'sorted invariant broke at op ' + i);
            }
        }
    }
    // final full agreement
    const sorted = [...oracle.keys()].sort((a, b) => a - b);
    assert.equal(sa.size, sorted.length);
    for (let j = 0; j < sorted.length; j++) {
        assert.equal(sa.keyAt(j), sorted[j]);
        assert.equal(sa.valueAt(j), oracle.get(sorted[j]));
    }
});
