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

// ============================================================================
// v1.4.0 consumer stage: S1 magnitude budget, setFrom, search (lite-pick).
// ============================================================================

test('Fenwick S1: single 1e308 set exceeds the MAX/2 budget and throws tagged, state unchanged', () => {
    const f = new Fenwick(2);
    assert.throws(() => f.set(0, 1e308), /\[lite-logn\]/);
    assert.equal(f.at(0), 0);                     // byte-identical no-op
    assert.equal(f.at(1), 0);
    assert.ok(!Number.isNaN(f.prefix(1)));        // no NaN ever produced
});

test('Fenwick S1: set(0,1e308).set(1,1e308) throws with the snapshot unchanged and no NaN', () => {
    const f = new Fenwick(2);
    assert.throws(() => { f.set(0, 1e308); f.set(1, 1e308); }, /\[lite-logn\]/);
    assert.equal(f.at(0), 0);
    assert.equal(f.at(1), 0);
    assert.ok(!Number.isNaN(f.at(1)));
});

test('Fenwick S1: build over budget fails closed', () => {
    assert.throws(() => Fenwick.build([1e308, 1e308]), /\[lite-logn\]/);
});

test('Fenwick S1: churn at normal magnitudes never hits the cold path (values stay exact)', () => {
    const f = new Fenwick(64);
    for (let r = 0; r < 5000; r++) {
        const i = (r * 2654435761 >>> 0) & 63;
        f.update(i, ((r & 7) - 4) * 1.5);         // small +/- deltas
    }
    // The bound is well under MAX/2; no throw, and prefix stays finite / consistent.
    assert.ok(Number.isFinite(f.prefix(63)));
    let manual = 0; for (let i = 0; i < 64; i++) manual += f.at(i);
    assert.ok(Math.abs(f.prefix(63) - manual) < 1e-6);
});

test('Fenwick S1: cold recompute accepts when cancellation freed room, then still bounds', () => {
    const B = Number.MAX_VALUE / 2;
    const f = new Fenwick(3);
    f.set(0, B * 0.4);                            // _mag ~ 0.4B
    f.set(0, 0);                                  // true sum now 0, but _mag drifted to ~0.8B
    // A 0.4B write: hot check sees 0.8B + 0.4B = 1.2B > budget -> cold recompute finds true 0, accepts.
    f.set(1, B * 0.4);
    assert.ok(Number.isFinite(f.prefix(2)));
    assert.equal(f.at(0), 0);
    assert.equal(f.at(1), B * 0.4);
    // A genuine overflow is still rejected, state unchanged.
    assert.throws(() => f.set(2, B * 0.9), /\[lite-logn\]/);
    assert.equal(f.at(2), 0);
});

test('Fenwick.setFrom: element i := src[i], same doors as set', () => {
    const f = new Fenwick(4);
    const src = new Float64Array([1.5, 2.25, 3.75, 4.5]);
    f.setFrom(src, 0).setFrom(src, 2);
    assert.equal(f.at(0), 1.5);
    assert.equal(f.at(2), 3.75);
    assert.equal(f.prefix(3), 1.5 + 3.75);
    // type door: non-Float64Array throws
    assert.throws(() => f.setFrom([1, 2, 3, 4], 0), /\[lite-logn\]/);
    // NaN / Infinity in the buffer fails closed
    assert.throws(() => f.setFrom(new Float64Array([NaN]), 0), /\[lite-logn\]/);
    assert.throws(() => f.setFrom(new Float64Array([Infinity]), 0), /\[lite-logn\]/);
    // out-of-range index
    assert.throws(() => f.setFrom(src, 4), /\[lite-logn\]/);
});

test('Fenwick.setFrom matches set over a fuzz corpus', () => {
    const n = 128;
    const a = new Fenwick(n), b = new Fenwick(n);
    const src = new Float64Array(n);
    for (let r = 0; r < 4000; r++) {
        const i = (r * 2654435761 >>> 0) % n;
        const v = (((r * 40503) & 0xffff) - 32768) * 0.5;
        src[i] = v;
        a.set(i, v);
        b.setFrom(src, i);
        assert.equal(a.at(i), b.at(i));
    }
    for (let i = 0; i < n; i++) assert.equal(a.prefix(i), b.prefix(i));
});

test('Fenwick.search: smallest i with inclusive prefix >= target, vs brute force', () => {
    const weights = [2, 0, 3, 1, 0, 4, 5, 0, 1];
    const f = Fenwick.build(weights);
    const total = f.prefix(weights.length - 1);
    // brute: smallest i in [0, n] with sum(weights[0..i]) >= target
    const brute = (target) => {
        let acc = 0;
        for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (acc >= target) return i; }
        return weights.length;
    };
    for (let t = -3; t <= total + 3; t++) {
        assert.equal(f.search(t), brute(t), 'search(' + t + ')');
    }
    // fractional targets
    for (let t = 0.5; t < total; t += 0.5) assert.equal(f.search(t), brute(t), 'search(' + t + ')');
    // target <= 0 -> 0; target > total -> length
    assert.equal(f.search(0), 0);
    assert.equal(f.search(-100), 0);
    assert.equal(f.search(total + 0.001), weights.length);
    // zero-weight slots are never RETURNED for target > 0
    for (let t = 1; t <= total; t++) {
        const idx = f.search(t);
        if (idx < weights.length) assert.notEqual(weights[idx], 0, 'zero-weight index ' + idx + ' returned for target ' + t);
    }
    // NaN throws; non-number throws
    assert.throws(() => f.search(NaN), /\[lite-logn\]/);
    assert.throws(() => f.search('3'), /\[lite-logn\]/);
});

test('Fenwick.search: weighted sampling picks index i with probability w_i/total (exact enumeration)', () => {
    // Rational targets u = (m + 0.5)/D * total for m in [0, D) tile (0, total]; each lands in exactly
    // one weight bucket. Enumerating them is an exact chi-square-free proof of the sampling law.
    const weights = [3, 1, 0, 5, 2, 0, 4];       // total 15, two zero-weight slots
    const f = Fenwick.build(weights);
    const total = weights.reduce((a, b) => a + b, 0);
    const D = 3000;                               // sample points
    const counts = new Array(weights.length).fill(0);
    for (let m = 0; m < D; m++) {
        const u = ((m + 0.5) / D) * total;        // in (0, total]
        counts[f.search(u)]++;
    }
    // Expected proportion per index = w_i / total; zero-weight indices get 0 samples.
    for (let i = 0; i < weights.length; i++) {
        const expected = (weights[i] / total) * D;
        assert.ok(Math.abs(counts[i] - expected) <= 1,
            'index ' + i + ' got ' + counts[i] + ', expected ~' + expected);
    }
    assert.equal(counts[2], 0);                   // zero-weight slots never sampled
    assert.equal(counts[5], 0);
});

// Exact BigInt-scaled oracle (weights & targets are doubles -> exact rationals via a 2^1100 scale).
function _bigOracle() {
    const SC = 1100n;
    const toBig = (x) => { if (x === 0) return 0n; const neg = x < 0; x = Math.abs(x); let e = 0, mm = x; while (!Number.isInteger(mm)) { mm *= 2; e++; } return (neg ? -1n : 1n) * (BigInt(mm) << (SC - BigInt(e))); };
    return (w, tgt) => { const T = toBig(tgt); let acc = 0n; for (let i = 0; i < w.length; i++) { acc += toBig(w[i]); if (acc >= T) return i; } return w.length; };
}

test('Fenwick.search: EXACT vs a BigInt oracle for representable (integer) sums; zeroBad = 0; +-Inf', () => {
    const exact = _bigOracle();
    let rng = 20260927 >>> 0;
    const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let mismatch = 0, zeroBad = 0, lenBad = 0, checks = 0;
    for (let iter = 0; iter < 2500; iter++) {
        const n = 1 + (iter % 120);
        const w = new Array(n);
        // integer weights (exact sums < 2^53), incl. ~30% zeros AND some large (up to 2^46)
        for (let i = 0; i < n; i++) w[i] = rand() < 0.3 ? 0 : Math.floor(rand() * (rand() < 0.5 ? 1000 : 2 ** 46));
        const f = Fenwick.build(w);
        let tot = 0; for (const x of w) tot += x;
        const probe = (u) => { checks++; const g = f.search(u); if (g !== exact(w, u)) mismatch++; if (u > 0 && g < n && w[g] === 0) zeroBad++; if (u > 0 && u <= tot && g >= n) lenBad++; };
        for (let i = 0; i < n; i++) { probe(f.prefix(i)); probe(f.prefix(i) + 1); probe(f.prefix(i) - 1); } // exact boundaries +-1
        for (let s = 0; s < 30; s++) probe(Math.floor(tot * (1 - rand())));
        probe(tot); probe(tot + 1);                                       // total, over-total
    }
    assert.equal(mismatch, 0, 'search disagreed with the BigInt oracle on representable sums (' + mismatch + ')');
    assert.equal(zeroBad, 0, 'search returned a zero-weight index for representable sums (' + zeroBad + ')');
    assert.equal(lenBad, 0, 'search returned length for target <= total (' + lenBad + ')');
    assert.ok(checks > 1000);
    // +Infinity -> length; -Infinity / target <= 0 -> 0.
    const g = Fenwick.build([1, 0, 2, 0, 3]);
    assert.equal(g.search(Infinity), 5);
    assert.equal(g.searchFrom(Float64Array.of(Infinity), 0), 5);
    assert.equal(g.search(-Infinity), 0);
    assert.equal(g.search(0), 0);
    assert.equal(g.search(6), 4);                                        // total -> last positive bucket
    assert.equal(g.search(6 * (1 + 2 ** -50)), 5);                       // just over total -> length
    assert.throws(() => g.search(NaN), /\[lite-logn\]/);
});

test('Fenwick.search: FRACTIONAL weights -- exact lower_bound over prefix(), within 1 ULP of target', () => {
    // For non-representable sums the guarantee is: search returns the exact lower_bound over the
    // library's own float prefix(), i.e. prefix(got) >= target (when got < n) and prefix(got-1) <
    // target -- so the returned index's prefix is within one ULP of target. (A zero-weight index can
    // appear only at a target exactly equal to a stored prefix whose zero weight rounded up sub-ULP;
    // that is the documented float bound, unreachable by a sampled u -- see the docblock.)
    let rng = 13 >>> 0;
    const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let lbFail = 0, lenBad = 0, checks = 0;
    for (let iter = 0; iter < 3000; iter++) {
        const n = 1 + (iter % 120);
        const w = new Array(n);
        for (let i = 0; i < n; i++) { const r = rand(); w[i] = r < 0.3 ? 0 : r * 10 ** Math.floor(rand() * 8 - 3); }
        const f = Fenwick.build(w);
        const tot = f.prefix(n - 1);
        const probe = (u) => {
            if (!(u > 0)) return; checks++;
            const g = f.search(u);
            if (u <= tot && g >= n) lenBad++;
            if (g < n) { if (!(f.prefix(g) >= u)) lbFail++; if (g > 0 && !(f.prefix(g - 1) < u)) lbFail++; }
        };
        for (let i = 0; i < n; i++) probe(f.prefix(i));
        for (let s = 0; s < 40; s++) probe(tot * (1 - rand()));
        probe(tot);
    }
    assert.equal(lbFail, 0, 'search is not an exact lower_bound over prefix() (' + lbFail + ')');
    assert.equal(lenBad, 0, 'search returned length for target <= total (' + lenBad + ')');
    assert.ok(checks > 1000);
});

test('Fenwick.searchFrom: EXACTLY identical to search (shared body) + doors + byte-identical reject', () => {
    let rng = 424242 >>> 0;
    const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let diverge = 0;
    for (let iter = 0; iter < 4000; iter++) {
        const n = 1 + (iter % 16);
        const w = new Array(n);
        for (let i = 0; i < n; i++) w[i] = rand() < 0.25 ? 0 : rand() * 3.7;
        const f = Fenwick.build(w);
        const src = new Float64Array(n + 2);
        for (let i = 0; i < n; i++) src[i] = f.prefix(i);
        src[n] = -5; src[n + 1] = f.prefix(n - 1) * 2;            // <=0 and > total probes too
        for (let i = 0; i < src.length; i++) if (f.searchFrom(src, i) !== f.search(src[i])) diverge++;
    }
    assert.equal(diverge, 0, 'searchFrom diverged from search in ' + diverge + ' cases');
    // doors: non-Float64Array, out-of-range i, NaN src[i]
    const f = Fenwick.build([1, 2, 3]);
    assert.throws(() => f.searchFrom([1, 2, 3], 0), /\[lite-logn\]/);
    assert.throws(() => f.searchFrom(new Float64Array([1, 2]), 5), /\[lite-logn\]/);
    assert.throws(() => f.searchFrom(new Float64Array([NaN]), 0), /\[lite-logn\]/);
    // byte-identical state after a rejected searchFrom
    const before = Array.from({ length: 3 }, (_, i) => f.at(i));
    try { f.searchFrom(new Float64Array([NaN]), 0); } catch (e) { /* expected */ }
    for (let i = 0; i < 3; i++) assert.equal(f.at(i), before[i]);
});

test('Fenwick.search: O(log n) even with a long zero-weight run (1e5 zeros), never O(n)', () => {
    const N = 100002;
    const w = new Float64Array(N);
    w[0] = 1.5; w[N - 1] = 2.5;                          // 1e5 zeros between two positive weights
    const f = Fenwick.build(w);
    const total = f.prefix(N - 1);
    // correctness at / around the plateau (never a zero slot; the owning buckets are 0 and N-1)
    assert.equal(f.search(1.5), 0);
    assert.equal(f.search(total), N - 1);
    assert.equal(f.search(total + 1), N);
    assert.equal(f.search(total * 0.5), N - 1);          // mid of the plateau -> the next positive bucket
    // timing: O(log n) descent must be far below an O(n) scan. Warm, then compare to a 4x-larger tree.
    const timeit = (fn, reps) => { let a = 0; const t0 = process.hrtime.bigint(); for (let r = 0; r < reps; r++) a += fn(r); const t1 = process.hrtime.bigint(); return { ns: Number(t1 - t0) / reps, a }; };
    for (let warm = 0; warm < 3; warm++) timeit((r) => f.search((r % 100 / 100) * total), 20000);
    const small = timeit((r) => f.search((r % 997 / 997) * total), 40000).ns;
    // A per-op cost of a few hundred ns at most; an O(n)=1e5 scan would be orders larger.
    assert.ok(small < 5000, 'search on a 1e5-zero tree took ' + small.toFixed(0) + ' ns/op -- looks O(n), not O(log n)');
});
