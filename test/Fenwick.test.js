/**
 * @zakkster/lite-logn -- Fenwick boundary + differential suite.
 *
 * The second member's contract, proven at the doors and against a plain-array
 * oracle:
 *   - surface + kinds (every op exists with the right shape);
 *   - construction validation (bad length: 0, negative, non-integer, > max);
 *   - boundaries (length 1, i = 0, i = length-1, prefix(-1) === 0, empty ranges);
 *   - fail-closed doors (out-of-range index, non-finite delta / value typeof-first,
 *     rangeSum lo > hi);
 *   - a >= 10k mixed update / prefix / rangeSum / at / set fuzz vs a Float64Array
 *     oracle, 0 divergences;
 *   - the rangeSum(lo,hi) === prefix(hi) - prefix(lo-1) invariant;
 *   - prefix monotone under nonnegative updates;
 *   - build(values) === the same values applied incrementally;
 *   - set / at round-trip.
 * Every test BITES: a broken impl (missing walk step, wrong base case, dropped
 * guard) fails it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Fenwick } from '../LogN.js';

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

// A plain-array reference model: every op computed the naive O(n) way.
function makeOracle(n) {
    const a = new Float64Array(n);
    return {
        update: (i, d) => { a[i] += d; },
        set: (i, v) => { a[i] = v; },
        at: (i) => a[i],
        prefix: (i) => { let s = 0; for (let k = 0; k <= i; k++) s += a[k]; return s; },
        rangeSum: (lo, hi) => { let s = 0; for (let k = lo; k <= hi; k++) s += a[k]; return s; },
    };
}

// --- surface ----------------------------------------------------------------

test('surface: every Fenwick op exists with the right kind', () => {
    const f = new Fenwick(8);
    for (const m of ['update', 'prefix', 'rangeSum', 'at', 'set', 'clear', 'forEach']) {
        assert.equal(typeof f[m], 'function', m + ' must be a method');
    }
    assert.equal(typeof f.length, 'number');
    assert.equal(typeof Fenwick.build, 'function');
});

// --- construction validation ------------------------------------------------

test('constructor rejects a bad length', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, '8', null, undefined, 2 ** 31, Symbol('x')]) {
        assert.throws(() => new Fenwick(bad), /\[lite-logn\]/, 'length ' + String(bad) + ' must throw');
    }
});

test('constructor allocates a zero-initialized tree; length getter reports capacity', () => {
    const f = new Fenwick(16);
    assert.equal(f.length, 16);
    for (let i = 0; i < 16; i++) assert.equal(f.at(i), 0);
    assert.equal(f.prefix(15), 0);
});

// --- fluent return (this) ---------------------------------------------------

test('update / set / clear return the same instance (fluent)', () => {
    const f = new Fenwick(4);
    assert.equal(f.update(0, 1), f);
    assert.equal(f.set(1, 2), f);
    assert.equal(f.clear(), f);
});

// --- boundaries -------------------------------------------------------------

test('length 1: the degenerate tree behaves', () => {
    const f = new Fenwick(1);
    assert.equal(f.prefix(-1), 0);
    assert.equal(f.prefix(0), 0);
    f.update(0, 5);
    assert.equal(f.at(0), 5);
    assert.equal(f.prefix(0), 5);
    assert.equal(f.rangeSum(0, 0), 5);
    f.set(0, -3);
    assert.equal(f.at(0), -3);
});

test('prefix(-1) === 0 is the clean empty-prefix base case', () => {
    const f = new Fenwick(8);
    for (let i = 0; i < 8; i++) f.update(i, i + 1);
    assert.equal(f.prefix(-1), 0);
    // rangeSum(0, hi) must equal prefix(hi) with no prefix(lo-1 = -1) special-casing bug
    assert.equal(f.rangeSum(0, 7), f.prefix(7));
    assert.equal(f.rangeSum(0, 0), f.prefix(0));
});

test('first and last index (i = 0, i = length-1) update and read correctly', () => {
    const f = new Fenwick(32);
    f.update(0, 10);
    f.update(31, 20);
    assert.equal(f.at(0), 10);
    assert.equal(f.at(31), 20);
    assert.equal(f.prefix(0), 10);
    assert.equal(f.prefix(31), 30);
    assert.equal(f.rangeSum(0, 31), 30);
    assert.equal(f.rangeSum(1, 30), 0);
});

test('negative deltas are honored (running sum can go negative)', () => {
    const f = new Fenwick(8);
    f.update(3, -5);
    f.update(5, 2);
    assert.equal(f.at(3), -5);
    assert.equal(f.prefix(7), -3);
    assert.equal(f.rangeSum(3, 5), -3);
});

// --- fail-closed doors ------------------------------------------------------

test('out-of-range index throws on update / prefix / at / set / rangeSum', () => {
    const f = new Fenwick(8);
    for (const bad of [-1, 8, 100, 1.5, NaN, Infinity, '0', null, undefined, Symbol('i')]) {
        assert.throws(() => f.update(bad, 1), /\[lite-logn\]/, 'update ' + String(bad));
        assert.throws(() => f.at(bad), /\[lite-logn\]/, 'at ' + String(bad));
        assert.throws(() => f.set(bad, 1), /\[lite-logn\]/, 'set ' + String(bad));
        assert.throws(() => f.rangeSum(bad, 7), /\[lite-logn\]/, 'rangeSum lo ' + String(bad));
        assert.throws(() => f.rangeSum(0, bad), /\[lite-logn\]/, 'rangeSum hi ' + String(bad));
    }
    // prefix admits -1 but rejects everything else out of [-1, length)
    for (const bad of [-2, 8, 1.5, NaN, '0', null, Symbol('i')]) {
        assert.throws(() => f.prefix(bad), /\[lite-logn\]/, 'prefix ' + String(bad));
    }
    assert.equal(f.prefix(-1), 0); // -1 is the only sub-zero index allowed
});

test('non-finite delta / value fails closed, typeof-first (no coercion of Symbol/BigInt)', () => {
    const f = new Fenwick(8);
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n]) {
        assert.throws(() => f.update(0, bad), /\[lite-logn\]/, 'update delta ' + String(bad));
        assert.throws(() => f.set(0, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // the tree is untouched by a rejected op
    assert.equal(f.prefix(7), 0);
});

test('rangeSum with lo > hi throws (no silent swap, no negative-window sum)', () => {
    const f = new Fenwick(8);
    for (let i = 0; i < 8; i++) f.update(i, 1);
    assert.throws(() => f.rangeSum(5, 2), /\[lite-logn\]/);
    assert.equal(f.rangeSum(2, 5), 4); // the honest window still works
});

// --- rejected op leaves a NON-ZERO tree byte-for-byte untouched -------------
// (QA hardening: the earlier "untouched" check ran on an all-zero tree, which
// is a weak oracle -- a broken guard order that wrote a NaN delta before
// validating would still leave every reachable prefix at "not 0", masking
// nothing there but proving less. Seed real, distinct, per-index values first,
// snapshot every element, attempt every throwing door, then re-snapshot and
// deep-equal: a partial write to ANY cell before the throw must show up here.)
test('a rejected update / set leaves an already-populated tree exactly untouched', () => {
    const f = new Fenwick(8);
    for (let i = 0; i < 8; i++) f.update(i, (i + 1) * 11); // distinct nonzero values
    const before = [];
    for (let i = 0; i < 8; i++) before.push(f.at(i));
    const bads = [NaN, Infinity, -Infinity, '5', null, undefined, {}, Symbol('k'), 3n];
    for (const bad of bads) {
        assert.throws(() => f.update(3, bad), /\[lite-logn\]/, 'update delta ' + String(bad));
        assert.throws(() => f.set(3, bad), /\[lite-logn\]/, 'set value ' + String(bad));
    }
    // out-of-range index doors too (value valid, index bad)
    for (const bad of [-1, 8, 100, 1.5, NaN]) {
        assert.throws(() => f.update(bad, 5), /\[lite-logn\]/, 'update i ' + String(bad));
        assert.throws(() => f.set(bad, 5), /\[lite-logn\]/, 'set i ' + String(bad));
    }
    const after = [];
    for (let i = 0; i < 8; i++) after.push(f.at(i));
    assert.deepEqual(after, before, 'a rejected op must not mutate any cell');
});

// --- fresh (empty) Fenwick: rangeSum semantics ------------------------------

test('a freshly constructed Fenwick reports 0 for every rangeSum window', () => {
    const f = new Fenwick(16);
    assert.equal(f.rangeSum(0, 15), 0);
    assert.equal(f.rangeSum(0, 0), 0);
    assert.equal(f.rangeSum(15, 15), 0);
    assert.equal(f.rangeSum(4, 9), 0);
});

// --- rangeSum invariant -----------------------------------------------------

test('rangeSum(lo, hi) === prefix(hi) - prefix(lo-1) across the domain', () => {
    const f = new Fenwick(64);
    const rng = mulberry32(0xF00D);
    for (let i = 0; i < 64; i++) f.update(i, Math.floor(rng() * 200) - 100);
    for (let lo = 0; lo < 64; lo++) {
        for (let hi = lo; hi < 64; hi++) {
            const lhs = f.rangeSum(lo, hi);
            const rhs = f.prefix(hi) - (lo > 0 ? f.prefix(lo - 1) : 0);
            assert.equal(lhs, rhs, 'rangeSum(' + lo + ',' + hi + ') invariant');
        }
    }
});

// --- prefix monotone under nonnegative updates ------------------------------

test('prefix is monotone nondecreasing after only nonnegative updates', () => {
    const f = new Fenwick(50);
    const rng = mulberry32(0x2468);
    for (let step = 0; step < 500; step++) {
        f.update(Math.floor(rng() * 50), rng() * 10); // always >= 0
    }
    let prev = f.prefix(-1); // 0
    for (let i = 0; i < 50; i++) {
        const p = f.prefix(i);
        assert.ok(p >= prev - 1e-9, 'prefix must not decrease at i=' + i);
        prev = p;
    }
});

// --- set / at round-trip ----------------------------------------------------

test('set / at round-trip: set(i, v) then at(i) === v, prefix stays consistent', () => {
    const f = new Fenwick(16);
    const rng = mulberry32(0x1357);
    const oracle = makeOracle(16);
    for (let step = 0; step < 300; step++) {
        const i = Math.floor(rng() * 16);
        const v = Math.floor(rng() * 1000) - 500;
        f.set(i, v); oracle.set(i, v);
        assert.equal(f.at(i), v);
    }
    for (let i = 0; i < 16; i++) {
        assert.equal(f.at(i), oracle.at(i));
        assert.equal(f.prefix(i), oracle.prefix(i));
    }
});

// --- build differential -----------------------------------------------------

test('build(values) === the same values applied incrementally (O(n) trick faithful)', () => {
    const rng = mulberry32(0xBADC0DE);
    for (const n of [1, 2, 7, 8, 15, 16, 100, 257, 1024]) {
        const values = new Float64Array(n);
        for (let i = 0; i < n; i++) values[i] = Math.floor(rng() * 2000) - 1000;
        const built = Fenwick.build(values);
        const incr = new Fenwick(n);
        for (let i = 0; i < n; i++) incr.update(i, values[i]);
        assert.equal(built.length, n);
        for (let i = 0; i < n; i++) {
            assert.equal(built.at(i), incr.at(i), 'build at ' + i + ' (n=' + n + ')');
            assert.equal(built.prefix(i), incr.prefix(i), 'build prefix ' + i + ' (n=' + n + ')');
        }
    }
});

test('build accepts a plain Array and fails closed on bad input', () => {
    const f = Fenwick.build([1, 2, 3, 4]);
    assert.equal(f.prefix(3), 10);
    assert.equal(f.at(2), 3);
    assert.throws(() => Fenwick.build(null), /\[lite-logn\]/);
    assert.throws(() => Fenwick.build({}), /\[lite-logn\]/);            // no length
    assert.throws(() => Fenwick.build([1, NaN, 3]), /\[lite-logn\]/);   // non-finite entry
    assert.throws(() => Fenwick.build([1, '2']), /\[lite-logn\]/);      // non-number entry
    assert.throws(() => Fenwick.build([]), /\[lite-logn\]/);            // length 0 -> ctor throws
});

// --- clear ------------------------------------------------------------------

test('clear zeros every element and keeps the capacity (reusable)', () => {
    const f = new Fenwick(8);
    for (let i = 0; i < 8; i++) f.update(i, i + 1);
    f.clear();
    for (let i = 0; i < 8; i++) assert.equal(f.at(i), 0);
    assert.equal(f.prefix(7), 0);
    f.update(4, 9); // reusable after clear
    assert.equal(f.at(4), 9);
});

// --- forEach ----------------------------------------------------------------

test('forEach visits (value, index) in ascending order, matching at(i)', () => {
    const f = new Fenwick(10);
    const rng = mulberry32(0x9999);
    const oracle = makeOracle(10);
    for (let i = 0; i < 10; i++) { const v = Math.floor(rng() * 100); f.set(i, v); oracle.set(i, v); }
    let expected = 0;
    f.forEach((value, index, self) => {
        assert.equal(index, expected, 'forEach index order');
        assert.equal(value, oracle.at(index), 'forEach value at ' + index);
        assert.equal(self, f);
        expected++;
    });
    assert.equal(expected, 10);
});

// --- the big differential fuzz (>= 10k mixed ops vs a plain-array oracle) ----

test('differential fuzz: >= 10k mixed ops on n=1024 match the array oracle exactly', () => {
    const n = 1024;
    const f = new Fenwick(n);
    const oracle = makeOracle(n);
    const rng = mulberry32(0xCAFEBABE);
    let divergences = 0;
    const STEPS = 40000;
    for (let step = 0; step < STEPS; step++) {
        const r = rng();
        const i = Math.floor(rng() * n);
        if (r < 0.35) {                              // update
            const d = Math.floor(rng() * 400) - 200;
            f.update(i, d); oracle.update(i, d);
        } else if (r < 0.55) {                       // set
            const v = Math.floor(rng() * 2000) - 1000;
            f.set(i, v); oracle.set(i, v);
        } else if (r < 0.70) {                       // at
            if (f.at(i) !== oracle.at(i)) divergences++;
        } else if (r < 0.85) {                       // prefix
            if (f.prefix(i) !== oracle.prefix(i)) divergences++;
        } else {                                     // rangeSum
            const lo = Math.min(i, Math.floor(rng() * n));
            const hi = Math.max(i, lo);
            if (f.rangeSum(lo, hi) !== oracle.rangeSum(lo, hi)) divergences++;
        }
        if ((step & 4095) === 0) {
            // periodic full sweep to catch a drift the sampled reads missed
            for (let k = 0; k < n; k += 97) {
                if (f.prefix(k) !== oracle.prefix(k)) { divergences++; break; }
            }
        }
    }
    // final full sweep
    for (let k = 0; k < n; k++) {
        if (f.at(k) !== oracle.at(k)) divergences++;
        if (f.prefix(k) !== oracle.prefix(k)) divergences++;
    }
    assert.equal(divergences, 0, 'fuzz produced ' + divergences + ' divergences');
});
