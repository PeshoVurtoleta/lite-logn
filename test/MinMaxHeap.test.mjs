/**
 * @zakkster/lite-logn -- MinMaxHeap boundary + oracle-fuzz suite.
 *
 * The seventh member's contract, proven at the doors and against a brute-force model:
 *   - construction validation (bad capacity);
 *   - push / popMin / popMax ordering; peekMin/peekMax + peekMinKey/peekMaxKey;
 *   - the min-max alternating-level ORDERING oracle after every op (>= 1e5 mixed ops);
 *   - level-parity load-bearing (a flipped parity / clz32 offset yields >= 1000 divergences);
 *   - both ends drain sorted; popped id multiset === pushed (dupes allowed);
 *   - Floyd MinMaxHeap.build === repeated push (drain sequence + id multiset + peeks);
 *   - fail-closed doors (capacity + key + full + empty return undefined, never throw);
 *   - explicit small-n correctness at n = 1,2,3,4 (the classic min-max off-by-one).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MinMaxHeap } from '../LogN.js';

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

// The level-parity predicate under test (matches LogN.js exactly). Slot i is a MIN
// level iff the depth (31 - clz32(i+1)) is even.
function isMinLevel(i) { return ((31 - Math.clz32(i + 1)) & 1) === 0; }

// White-box min-max ORDERING oracle: every MIN-level node <= all descendants in its
// 2-level cone (children + grandchildren), reverse on MAX levels. Reading the SoA
// internals -- a check the public surface cannot express. Parameterized on the parity
// function so a mutation test can flip it and prove the check has teeth.
function minMaxOk(h, parity = isMinLevel) {
    const K = h._key, n = h._n;
    for (let i = 0; i < n; i++) {
        const mn = parity(i);
        for (const c of [2 * i + 1, 2 * i + 2]) {
            if (c < n) { if (mn ? K[c] < K[i] : K[c] > K[i]) return false; }
        }
        for (const g of [4 * i + 3, 4 * i + 4, 4 * i + 5, 4 * i + 6]) {
            if (g < n) { if (mn ? K[g] < K[i] : K[g] > K[i]) return false; }
        }
    }
    return true;
}

// --- construction validation ------------------------------------------------

test('constructor rejects a bad capacity', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, 2 ** 31, null, '8', Symbol('x'), 10n]) {
        assert.throws(() => new MinMaxHeap(bad), /\[lite-logn\]/, 'capacity ' + String(bad));
    }
    const h = new MinMaxHeap(16);
    assert.equal(h.capacity, 16);
    assert.equal(h.size, 0);
});

// --- surface (the non-addressable asymmetry vs BinaryHeap) ------------------

test('surface: every MinMaxHeap op exists; there is NO changeKey / remove / keyOf / has / _pos (the asymmetry vs BinaryHeap)', () => {
    const h = new MinMaxHeap(8);
    for (const m of ['push', 'popMin', 'popMax', 'peekMin', 'peekMax', 'peekMinKey', 'peekMaxKey', 'clear', 'forEach']) {
        assert.equal(typeof h[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof h[Symbol.iterator], 'function', '[Symbol.iterator] must be a method');
    assert.equal(typeof MinMaxHeap.build, 'function', 'static build must exist');
    for (const m of ['changeKey', 'remove', 'keyOf', 'has']) {
        assert.equal(typeof h[m], 'undefined', 'MinMaxHeap must NOT expose ' + m);
    }
    assert.equal(h._pos, undefined, 'MinMaxHeap must NOT carry a _pos reverse map');
    assert.equal(typeof h.size, 'number');
    assert.equal(typeof h.capacity, 'number');
});

// --- push / popMin / popMax ordering -----------------------------------------

test('popMin pops ascending by key; popMax pops descending', () => {
    const pairs = [[0, 5], [1, 1], [2, 9], [3, 3], [4, 7]];
    let h = new MinMaxHeap(8);
    for (const [id, k] of pairs) h.push(id, k);
    assert.equal(h.size, 5);
    const mins = [];
    while (h.size) { mins.push(h.peekMinKey()); h.popMin(); }
    assert.deepEqual(mins, [1, 3, 5, 7, 9]);

    h = new MinMaxHeap(8);
    for (const [id, k] of pairs) h.push(id, k);
    const maxes = [];
    while (h.size) { maxes.push(h.peekMaxKey()); h.popMax(); }
    assert.deepEqual(maxes, [9, 7, 5, 3, 1]);
});

test('peekMin / peekMax / peekMinKey / peekMaxKey report the live extremes', () => {
    const h = new MinMaxHeap(8);
    h.push(2, 4.0); h.push(5, 2.0); h.push(7, 6.0);
    assert.equal(h.peekMin(), 5);
    assert.equal(h.peekMinKey(), 2.0);
    assert.equal(h.peekMax(), 7);
    assert.equal(h.peekMaxKey(), 6.0);
});

// --- explicit small-n correctness (the classic min-max off-by-one) ----------

test('correctness at n = 1,2,3,4 explicitly (popMax must not read an absent slot 2)', () => {
    // n = 1: single element serves BOTH ends.
    let h = new MinMaxHeap(8); h.push(9, 42);
    assert.equal(h.peekMin(), 9); assert.equal(h.peekMax(), 9);
    assert.equal(h.peekMinKey(), 42); assert.equal(h.peekMaxKey(), 42);
    assert.equal(h.popMax(), 9); assert.equal(h.size, 0);
    h.push(8, 7); assert.equal(h.popMin(), 8); assert.equal(h.size, 0);

    // n = 2: root (min) + one child (max); popMax must read ONLY slot 1.
    h = new MinMaxHeap(8); h.push(0, 3); h.push(1, 5);
    assert.equal(h.peekMinKey(), 3); assert.equal(h.peekMaxKey(), 5);
    assert.equal(h.popMax(), 1); assert.equal(h.peekMinKey(), 3); assert.equal(h.size, 1);
    h = new MinMaxHeap(8); h.push(0, 3); h.push(1, 5);
    assert.equal(h.popMin(), 0); assert.equal(h.peekMaxKey(), 5); assert.equal(h.size, 1);

    // n = 3: root + two max children.
    for (const order of [[[0, 1], [1, 8], [2, 5]], [[0, 1], [1, 5], [2, 8]]]) {
        h = new MinMaxHeap(8); for (const [id, k] of order) h.push(id, k);
        assert.equal(h.peekMinKey(), 1); assert.equal(h.peekMaxKey(), 8);
        assert.ok(minMaxOk(h));
        const ks = []; while (h.size) { ks.push(h.peekMinKey()); h.popMin(); }
        assert.deepEqual(ks, [1, 5, 8]);
    }

    // n = 4: root + two max + one min grandchild -- exercise both pops to empty.
    h = new MinMaxHeap(8);
    for (const [id, k] of [[0, 2], [1, 9], [2, 6], [3, 4]]) h.push(id, k);
    assert.ok(minMaxOk(h));
    assert.equal(h.peekMinKey(), 2); assert.equal(h.peekMaxKey(), 9);
    const desc = []; while (h.size) { desc.push(h.peekMaxKey()); h.popMax(); }
    assert.deepEqual(desc, [9, 6, 4, 2]);
});

test('correctness at n = 5 explicitly (root + two max children + two min grandchildren)', () => {
    for (const order of [
        [[0, 3], [1, 9], [2, 7], [3, 5], [4, 1]],
        [[0, 1], [1, 5], [2, 7], [3, 9], [4, 3]],
        [[0, 9], [1, 7], [2, 5], [3, 3], [4, 1]], // descending insert
    ]) {
        const h = new MinMaxHeap(8);
        for (const [id, k] of order) h.push(id, k);
        assert.ok(minMaxOk(h), 'n=5 ordering violated for order ' + JSON.stringify(order));
        assert.equal(h.peekMinKey(), 1);
        assert.equal(h.peekMaxKey(), 9);
        const asc = []; while (h.size) { asc.push(h.peekMinKey()); h.popMin(); }
        assert.deepEqual(asc, [1, 3, 5, 7, 9]);
    }
    // popMax drain at n=5, exercising the mi=2 vs mi=1 branch on every pop.
    const h = new MinMaxHeap(8);
    for (const [id, k] of [[0, 3], [1, 9], [2, 7], [3, 5], [4, 1]]) h.push(id, k);
    const desc = []; while (h.size) { desc.push(h.peekMaxKey()); h.popMax(); }
    assert.deepEqual(desc, [9, 7, 5, 3, 1]);
});

test('duplicate keys AND duplicate ids coexist in one heap; drain multiset preserved', () => {
    const h = new MinMaxHeap(16);
    // Same key repeated (ties) AND same id repeated (opaque payload, not unique).
    const pairs = [[7, 4], [7, 4], [7, 4], [3, 4], [3, 9], [3, 9], [1, 1], [1, 1]];
    for (const [id, k] of pairs) h.push(id, k);
    assert.equal(h.size, pairs.length);
    assert.ok(minMaxOk(h));
    assert.equal(h.peekMinKey(), 1);
    assert.equal(h.peekMaxKey(), 9);
    const drainedIds = []; const drainedKeys = [];
    while (h.size) { drainedKeys.push(h.peekMinKey()); drainedIds.push(h.popMin()); }
    assert.deepEqual(drainedKeys, [1, 1, 4, 4, 4, 4, 9, 9]);
    assert.deepEqual(drainedIds.slice().sort((a, b) => a - b), pairs.map((p) => p[0]).sort((a, b) => a - b));
});

// --- fail-closed doors ------------------------------------------------------

test('a non-finite / non-number key fails closed (checked FIRST); size unchanged', () => {
    const h = new MinMaxHeap(8);
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, '3', Symbol('k'), 1n, {}]) {
        assert.throws(() => h.push(0, bad), /\[lite-logn\]/, 'key ' + String(bad));
    }
    assert.equal(h.size, 0);
});

test('a non-integer / out-of-range id fails closed; the id domain is [0, 2^32)', () => {
    const h = new MinMaxHeap(8);
    for (const bad of [-1, 1.5, NaN, Infinity, 2 ** 32, null, undefined, '0', Symbol('i'), 3n]) {
        assert.throws(() => h.push(bad, 1), /\[lite-logn\]/, 'id ' + String(bad));
    }
    assert.equal(h.size, 0);
    // the full Uint32 range is legal (a wider domain than BinaryHeap's [0, capacity))
    h.push(0, 1); h.push(0xFFFFFFFF, 2); // dupe id 0 not required unique, top of range legal
    assert.equal(h.size, 2);
    assert.equal(h.peekMaxKey(), 2);
});

test('full heap throws with size unchanged (no silent drop)', () => {
    const h = new MinMaxHeap(3);
    h.push(0, 1); h.push(1, 2); h.push(2, 3);
    assert.equal(h.size, 3);
    assert.throws(() => h.push(3, 4), /\[lite-logn\]/);
    assert.equal(h.size, 3);
});

test('every peek / pop on an empty heap returns undefined and never throws', () => {
    const h = new MinMaxHeap(4);
    assert.equal(h.peekMin(), undefined);
    assert.equal(h.peekMax(), undefined);
    assert.equal(h.peekMinKey(), undefined);
    assert.equal(h.peekMaxKey(), undefined);
    assert.equal(h.popMin(), undefined);
    assert.equal(h.popMax(), undefined);
    // drained back to empty behaves the same
    h.push(0, 1); h.popMin();
    assert.equal(h.popMax(), undefined);
    assert.equal(h.peekMinKey(), undefined);
});

// --- clear / iteration ------------------------------------------------------

test('clear empties the heap and it stays reusable', () => {
    const h = new MinMaxHeap(8);
    for (let i = 0; i < 5; i++) h.push(i, 5 - i);
    h.clear();
    assert.equal(h.size, 0);
    assert.equal(h.peekMin(), undefined);
    h.push(0, 1); // reusable after clear
    assert.equal(h.peekMin(), 0);
});

test('forEach and [Symbol.iterator] visit every live id (order unspecified)', () => {
    const h = new MinMaxHeap(8);
    const ids = [4, 1, 7, 2, 5];
    for (const id of ids) h.push(id, id * 10);
    const seen = new Set();
    h.forEach((id, key) => { seen.add(id); assert.equal(key, id * 10); });
    assert.deepEqual([...seen].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
    const iter = new Set();
    for (const id of h) iter.add(id);
    assert.deepEqual([...iter].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
});

// --- ASSERTION 1: min-max ORDERING oracle over >= 1e5 mixed ops --------------

test('min-max ordering oracle: after EVERY op the 2-level cone holds + peeks track brute Math.min/max (0 divergences)', () => {
    const cap = 4096;
    const h = new MinMaxHeap(cap);
    const model = []; // multiset of live keys (dupes allowed)
    const rng = mulberry32(0x51105EED);
    let divergences = 0;
    const STEPS = 120000;
    for (let step = 0; step < STEPS; step++) {
        const r = rng();
        if (r < 0.45 && model.length < cap) {              // push
            const key = Math.floor(rng() * 1e6);
            const id = Math.floor(rng() * 1000);            // ids NOT unique
            h.push(id, key); model.push(key);
        } else if (r < 0.72 && model.length > 0) {          // popMin
            const mn = Math.min(...model);
            if (h.peekMinKey() !== mn) divergences++;
            if (h.popMin() === undefined) divergences++;
            model.splice(model.indexOf(mn), 1);
        } else if (model.length > 0) {                      // popMax
            const mx = Math.max(...model);
            if (h.peekMaxKey() !== mx) divergences++;
            if (h.popMax() === undefined) divergences++;
            model.splice(model.indexOf(mx), 1);
        }
        if (h.size !== model.length) divergences++;
        if (!minMaxOk(h)) divergences++;
        if (model.length > 0) {
            if (h.peekMinKey() !== Math.min(...model)) divergences++;
            if (h.peekMaxKey() !== Math.max(...model)) divergences++;
        }
    }
    assert.equal(divergences, 0, 'min-max fuzz produced ' + divergences + ' divergences');
});

// --- ASSERTION 2: level-parity is load-bearing ------------------------------

test('level-parity is load-bearing: the FLIPPED parity predicate fails the ordering oracle >= 1000 times', () => {
    // Build a real, correct heap over a 1e5-op trace, sampling the ordering oracle under
    // BOTH the correct parity and a flipped one. The correct one never fails; the flipped
    // one (min<->max swapped) must fail thousands of times -- proof the parity is load-bearing.
    const cap = 2048;
    const h = new MinMaxHeap(cap);
    const model = [];
    const rng = mulberry32(0xBADC0FFE);
    let correct = 0, flipped = 0;
    const flip = (i) => !isMinLevel(i);              // parity flip
    const offBy = (i) => ((32 - Math.clz32(i + 1)) & 1) === 0; // 31 -> 32 clz32 offset
    let flippedOff = 0;
    for (let step = 0; step < 100000; step++) {
        const r = rng();
        if (r < 0.5 && model.length < cap) { const k = Math.floor(rng() * 1e6); h.push(Math.floor(rng() * 500), k); model.push(k); }
        else if (r < 0.75 && model.length > 0) { const mn = Math.min(...model); h.popMin(); model.splice(model.indexOf(mn), 1); }
        else if (model.length > 0) { const mx = Math.max(...model); h.popMax(); model.splice(model.indexOf(mx), 1); }
        if ((step & 63) === 0 && h.size > 8) {
            if (!minMaxOk(h, isMinLevel)) correct++;
            if (!minMaxOk(h, flip)) flipped++;
            if (!minMaxOk(h, offBy)) flippedOff++;
        }
    }
    assert.equal(correct, 0, 'the CORRECT parity must never fail the oracle');
    assert.ok(flipped >= 1000, 'the FLIPPED parity must fail the oracle >= 1000 times, got ' + flipped);
    assert.ok(flippedOff >= 1000, 'the 32-clz32 offset parity must fail the oracle >= 1000 times, got ' + flippedOff);
});

// --- ASSERTION 3: both ends drain sorted; id multiset preserved -------------

test('both ends drain sorted; popped id multiset === pushed (dupes allowed)', () => {
    for (let fill = 0; fill < 10; fill++) {
        const n = 8191;
        const rng = mulberry32(0xF00D ^ (fill * 2654435761));
        // popMin drain
        let h = new MinMaxHeap(n);
        const pushedIds = [];
        for (let i = 0; i < n; i++) {
            const id = Math.floor(rng() * 64);            // heavy duplication
            const key = Math.floor(rng() * 1e7);
            h.push(id, key); pushedIds.push(id);
        }
        let prev = -Infinity; const drainedIdsMin = [];
        while (h.size) {
            const k = h.peekMinKey(); assert.ok(k >= prev, 'popMin not non-decreasing'); prev = k;
            drainedIdsMin.push(h.popMin());
        }
        assert.equal(h.popMin(), undefined);
        assert.deepEqual(pushedIds.slice().sort((a, b) => a - b), drainedIdsMin.slice().sort((a, b) => a - b));

        // popMax drain (fresh identical fill)
        const rng2 = mulberry32(0xF00D ^ (fill * 2654435761));
        h = new MinMaxHeap(n);
        const pushed2 = [];
        for (let i = 0; i < n; i++) { const id = Math.floor(rng2() * 64); const key = Math.floor(rng2() * 1e7); h.push(id, key); pushed2.push(id); }
        let hi = Infinity; const drainedMax = [];
        while (h.size) {
            const k = h.peekMaxKey(); assert.ok(k <= hi, 'popMax not non-increasing'); hi = k;
            drainedMax.push(h.popMax());
        }
        assert.equal(h.popMax(), undefined);
        assert.deepEqual(pushed2.slice().sort((a, b) => a - b), drainedMax.slice().sort((a, b) => a - b));
    }
});

// --- ASSERTION 4: build === repeated push -----------------------------------

test('MinMaxHeap.build (Floyd) === repeated push: same popMin drain, same id multiset, same peeks', () => {
    const rng = mulberry32(0xC0FFEE);
    for (let t = 0; t < 200; t++) {
        const n = 1 + Math.floor(rng() * 1000);
        const cap = Math.max(n, 1024);
        const ids = new Array(n), keys = new Array(n);
        for (let i = 0; i < n; i++) { ids[i] = Math.floor(rng() * 100); keys[i] = Math.floor(rng() * 1e7); }

        const hb = MinMaxHeap.build(ids, keys, cap);
        const hp = new MinMaxHeap(cap);
        for (let i = 0; i < n; i++) hp.push(ids[i], keys[i]);

        assert.equal(hb.size, n);
        assert.equal(hp.size, n);
        assert.ok(minMaxOk(hb), 'build produced an invalid heap');
        assert.equal(hb.peekMinKey(), hp.peekMinKey());
        assert.equal(hb.peekMaxKey(), hp.peekMaxKey());

        // resident id multiset agrees
        const bidset = [...hb].sort((a, b) => a - b);
        const pidset = [...hp].sort((a, b) => a - b);
        assert.deepEqual(bidset, pidset);

        // popMin drain KEY sequence agrees
        const ka = [], kb = [];
        while (hb.size) { ka.push(hb.peekMinKey()); hb.popMin(); }
        while (hp.size) { kb.push(hp.peekMinKey()); hp.popMin(); }
        assert.deepEqual(ka, kb);
    }
});

// --- ASSERTION 4b: build fails closed ---------------------------------------

test('MinMaxHeap.build fails closed on bad input', () => {
    assert.throws(() => MinMaxHeap.build(null, [1], 8), /\[lite-logn\]/);          // non-array-like
    assert.throws(() => MinMaxHeap.build([0, 1], [1], 8), /\[lite-logn\]/);        // length mismatch
    assert.throws(() => MinMaxHeap.build([0, 1], [1, NaN], 8), /\[lite-logn\]/);   // non-finite key
    assert.throws(() => MinMaxHeap.build([0, -1], [1, 2], 8), /\[lite-logn\]/);    // id < 0
    assert.throws(() => MinMaxHeap.build([0, 2 ** 32], [1, 2], 8), /\[lite-logn\]/); // id >= 2^32
    assert.throws(() => MinMaxHeap.build(new Array(9).fill(0), new Array(9).fill(0), 8),
        /\[lite-logn\]/); // count > capacity
});
